
# Анализ и ТЗ: Исправление доступа агента к записям

## Выявленные проблемы

### Проблема 1: Режим "Найти в записях" не возвращает записи

На скриншоте видно сообщение AI: *"К сожалению, на данный момент контекст записей не был предоставлен"*

**Причина**: Функция `buildFromSearch` в `contextPack.ts` использует **строгую фильтрацию по ключевым словам**:

```typescript
// Строки 127-135 contextPack.ts
const entries = allEntries
  .filter(entry => !entry.isPrivate && entry.aiAllowed !== false)
  .map(entry => {
    const score = calculateRelevanceScore(entry.text + ' ' + entry.tags.join(' '), query);
    scores.set(entry.id!, score);
    return { entry, score };
  })
  .filter(({ score }) => score > 0)  // <-- ПРОБЛЕМА: если score = 0, запись отбрасывается
```

Когда пользователь пишет "Найди последнюю запись", слова "найди", "последнюю", "запись" **не совпадают** с текстом реальных записей → score = 0 → все записи отбрасываются → AI получает пустой контекст.

### Проблема 2: Нет fallback для пустого результата

Если ключевые слова не найдены, функция возвращает пустой массив вместо хотя бы нескольких последних записей.

### Проблема 3: Хроники тоже не загружаются

Функция `loadRelevantBiographies` в режиме `findMode` **не загружает записи по умолчанию** (передаётся пустой массив `entryIds: []`), и если `query` не совпадает с текстом хроник, они тоже пусты.

---

## Проверка функционала кнопок

| Кнопка | Ожидаемое поведение | Фактическое поведение | Статус |
|--------|---------------------|----------------------|--------|
| "Найти в записях" | Включает глобальный поиск по всем записям | Включает режим, но записи не находятся если нет совпадений ключевых слов | Частично работает |
| "Обсудить" | Переключает в режим обсуждения выбранных записей | Работает, если записи выбраны вручную | Работает |

---

## План исправления

### Этап 1: Добавить fallback на последние записи

**Файл**: `src/lib/librarian/contextPack.ts`

```typescript
// Изменить buildFromSearch для добавления fallback
async function buildFromSearch(
  query: string
): Promise<{ entries: DiaryEntry[]; scores: Map<number, number> }> {
  const allEntries = await db.entries.toArray();
  const scores = new Map<number, number>();
  
  // Фильтруем приватные записи
  const eligibleEntries = allEntries.filter(
    entry => !entry.isPrivate && entry.aiAllowed !== false
  );
  
  // Если есть ключевые слова - ищем по ним
  const hasSearchTerms = query.trim().split(/\s+/).some(word => word.length > 2);
  
  if (hasSearchTerms) {
    // Текущая логика поиска по ключевым словам
    const matchedEntries = eligibleEntries
      .map(entry => {
        const score = calculateRelevanceScore(entry.text + ' ' + entry.tags.join(' '), query);
        scores.set(entry.id!, score);
        return { entry, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || b.entry.createdAt - a.entry.createdAt)
      .slice(0, CONTEXT_LIMITS.maxEvidence * 2)
      .map(({ entry }) => entry);
    
    // Если нашли совпадения - возвращаем их
    if (matchedEntries.length > 0) {
      return { entries: matchedEntries, scores };
    }
  }
  
  // FALLBACK: Возвращаем последние N записей по дате
  const recentEntries = eligibleEntries
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, CONTEXT_LIMITS.maxEvidence);
  
  // Присваиваем минимальный score для fallback записей
  for (const entry of recentEntries) {
    scores.set(entry.id!, 0.1);
  }
  
  return { entries: recentEntries, scores };
}
```

### Этап 2: Загружать хроники для fallback записей

**Файл**: `src/lib/librarian/contextPack.ts`

```typescript
// Изменить buildContextPack
export async function buildContextPack(options: ContextPackOptions): Promise<ContextPackResult> {
  // ... существующий код ...
  
  // Load and add biographies - ИСПРАВЛЕНИЕ: передавать entryIds даже в findMode
  const biographies = await loadRelevantBiographies(
    findMode 
      ? selectedEntries.map(e => e.id!).slice(0, 8)  // <- Используем найденные записи
      : sessionScope.entryIds,
    userQuery,
    findMode
  );
  
  // ... остальной код ...
}
```

### Этап 3: Улучшить loadRelevantBiographies

**Файл**: `src/lib/librarian/contextPack.ts`

```typescript
async function loadRelevantBiographies(
  entryIds: number[],
  query: string,
  findMode: boolean
): Promise<StoredBiography[]> {
  const biographies: StoredBiography[] = [];
  const addedDates = new Set<string>();
  
  // 1. Получить даты из entryIds (теперь работает и для findMode)
  if (entryIds.length > 0) {
    const entries = await Promise.all(entryIds.map(id => db.entries.get(id)));
    const dates = [...new Set(entries.filter(Boolean).map(e => e!.date))];
    
    for (const date of dates) {
      const bio = await db.biographies.get(date);
      if (bio && bio.status === 'complete' && bio.biography) {
        biographies.push(bio);
        addedDates.add(bio.date);
      }
    }
  }
  
  // 2. НОВОЕ: Если findMode и пустой результат - добавить последние хроники
  if (findMode && biographies.length === 0) {
    const allBios = await db.biographies
      .filter(bio => bio.status === 'complete' && bio.biography !== null)
      .reverse()
      .limit(CONTEXT_LIMITS.maxBiographies)
      .toArray();
    
    for (const bio of allBios) {
      if (!addedDates.has(bio.date)) {
        biographies.push(bio);
        addedDates.add(bio.date);
      }
    }
  }
  
  // 3. Поиск по ключевым словам (существующий код)
  // ...
  
  return biographies.slice(0, CONTEXT_LIMITS.maxBiographies);
}
```

---

## Дополнительные улучшения

### 1. Добавить обработку мета-запросов

Распознавать запросы типа "последняя запись", "вчера", "на прошлой неделе":

```typescript
function parseMetaQuery(query: string): { 
  type: 'recent' | 'date' | 'keyword'; 
  params?: any 
} {
  const lowerQuery = query.toLowerCase();
  
  if (/последн|recent|latest/.test(lowerQuery)) {
    return { type: 'recent' };
  }
  if (/вчера|yesterday/.test(lowerQuery)) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return { type: 'date', params: { date: yesterday.toISOString().split('T')[0] } };
  }
  
  return { type: 'keyword' };
}
```

### 2. Показывать индикатор загруженного контекста

В UI добавить информацию о том, сколько записей и хроник загружено:

```typescript
// После buildContextPack
setCurrentEvidence(contextPack);
if (contextPack.evidence.length === 0) {
  toast.info('Записи не найдены. Попробуйте другой запрос.');
}
```

---

## Ожидаемый результат

| Действие пользователя | До исправления | После исправления |
|-----------------------|----------------|-------------------|
| "Найди последнюю запись" | "Контекст не предоставлен" | Показывает последние 8 записей |
| "Что было вчера?" | Пустой контекст | Записи за вчера + хроника |
| Пустой поиск | Ошибка | Показывает последние записи |

---

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `src/lib/librarian/contextPack.ts` | Добавить fallback в `buildFromSearch`, улучшить `loadRelevantBiographies` |
| `src/pages/DiscussionChatPage.tsx` | Добавить уведомление если контекст пуст |

---

## Техническая сводка

**Корень проблемы**: Строгая фильтрация `score > 0` в режиме поиска без fallback на последние записи.

**Решение**: Добавить fallback на последние записи когда поиск не даёт результатов, передавать найденные записи в функцию загрузки хроник.

**Приоритет**: Критический — агент не может читать записи при общих запросах.
