
# ТЗ: Расширение контекста агента "Обсуждения"

## Текущее состояние

Агент в функции "Обсуждения" имеет **ограниченный доступ** к данным пользователя:

| Источник | Доступ | Примечания |
|----------|--------|------------|
| Записи дневника | Да | Максимум 8 записей, 600 симв./запись |
| Хроники (biographies) | Нет | Не включены в контекст |
| Документы | Нет | Модуль не реализован |
| Вложения (медиа) | Нет | Только подсчёт количества |

## Проблема

Хроники (AI-сгенерированные биографии дней) содержат ценный **структурированный анализ** каждого дня:
- `title` — заголовок дня
- `narrative` — связный рассказ (6-12 предложений)
- `highlights` — ключевые моменты (3-6 пунктов)
- `timeline` — хронология событий

Эта информация **недоступна** агенту обсуждений, хотя могла бы значительно улучшить качество ответов.

---

## Предлагаемое решение

### Этап 1: Добавить хроники в контекст

**Файл**: `src/lib/librarian/contextPack.ts`

#### 1.1 Обновить интерфейс EvidenceRef

```typescript
export interface EvidenceRef {
  type: 'entry' | 'document_page' | 'document' | 'biography'; // +biography
  // ...остальные поля
  biographyDate?: string; // YYYY-MM-DD для хроник
}
```

#### 1.2 Добавить функцию загрузки релевантных хроник

```typescript
async function loadRelevantBiographies(
  entryIds: number[],
  query: string
): Promise<StoredBiography[]> {
  // 1. Получить даты из entryIds
  const entries = await Promise.all(entryIds.map(id => db.entries.get(id)));
  const dates = [...new Set(entries.filter(Boolean).map(e => e!.date))];
  
  // 2. Загрузить хроники для этих дат
  const biographies: StoredBiography[] = [];
  for (const date of dates) {
    const bio = await db.biographies.get(date);
    if (bio && bio.status === 'complete' && bio.biography) {
      biographies.push(bio);
    }
  }
  
  // 3. Также искать по ключевым словам в findMode
  if (query.trim()) {
    const allBios = await db.biographies.toArray();
    const matches = allBios.filter(bio => 
      bio.status === 'complete' && 
      bio.biography &&
      calculateRelevanceScore(
        `${bio.biography.title} ${bio.biography.narrative} ${bio.biography.highlights.join(' ')}`,
        query
      ) > 0
    );
    // Добавить уникальные
    for (const bio of matches) {
      if (!biographies.some(b => b.date === bio.date)) {
        biographies.push(bio);
      }
    }
  }
  
  return biographies.slice(0, 4); // Максимум 4 хроники
}
```

#### 1.3 Добавить хроники в buildContextPack

```typescript
// После загрузки entries, добавить хроники
const biographies = await loadRelevantBiographies(
  findMode ? [] : sessionScope.entryIds, 
  userQuery
);

// Добавить в evidence и contextText
for (let i = 0; i < biographies.length && evidence.length < CONTEXT_LIMITS.maxEvidence; i++) {
  const bio = biographies[i];
  const refId = `B${i + 1}`;
  
  const snippet = createSnippet(
    `${bio.biography!.title}\n${bio.biography!.narrative}`, 
    CONTEXT_LIMITS.maxSnippetChars
  );
  
  evidence.push({
    type: 'biography',
    id: refId,
    title: `Хроника: ${bio.date}`,
    subtitle: bio.biography!.title,
    snippet,
    deepLink: `/day/${bio.date}`,
    entityId: 0,
    biographyDate: bio.date,
  });
  
  contextParts.push(`[${refId}] Chronicle ${bio.date}: ${bio.biography!.title}\n${snippet}`);
}
```

---

### Этап 2: Обновить UI для отображения хроник

**Файл**: `src/components/discussions/EvidenceCard.tsx`

#### 2.1 Добавить иконку для biography

```typescript
function getIcon(type: EvidenceRef['type']) {
  switch (type) {
    case 'entry': return FileText;
    case 'biography': return BookOpen; // Новая иконка
    case 'document':
    case 'document_page': return Book;
    default: return FileText;
  }
}
```

#### 2.2 Обновить навигацию deepLink

```typescript
// В EvidenceCard onClick:
if (evidence.type === 'biography' && evidence.biographyDate) {
  navigate(`/day/${evidence.biographyDate}`);
} else {
  navigate(evidence.deepLink);
}
```

---

### Этап 3: Обновить системный промпт

**Файл**: `src/lib/ai/discussions.ts`

Добавить инструкцию для AI об использовании хроник:

```typescript
const systemPrompt = `...
ТИПЫ ИСТОЧНИКОВ:
- [E1], [E2]... — записи дневника
- [B1], [B2]... — хроники (AI-сводки дней)

Хроники содержат структурированный анализ дня. Используй их для получения общей картины.
...`;
```

---

## Технические детали

| Аспект | Значение |
|--------|----------|
| Файлы для изменения | `contextPack.ts`, `EvidenceCard.tsx`, `discussions.ts`, `db.ts` (типы) |
| Новый тип evidence | `'biography'` |
| Лимит хроник | 4 на запрос |
| Совместимость | Обратная совместимость сохранена |
| Приватность | Хроники генерируются только из non-private записей |

---

## Ожидаемый результат

После реализации агент сможет:
1. Видеть хроники для дат выбранных записей
2. Искать по хроникам в режиме "Найти в записях"
3. Цитировать хроники с переходом к просмотру дня
4. Давать более качественные ответы благодаря структурированным данным

```text
+--------------------------------------------------+
|     КОНТЕКСТ АГЕНТА (после реализации)           |
+--------------------------------------------------+
| [E1] Запись 31.01 @ 10:00                        |
|     "Сегодня была важная встреча..."             |
+--------------------------------------------------+
| [E2] Запись 31.01 @ 14:30                        |
|     "Обсудили проект с командой..."              |
+--------------------------------------------------+
| [B1] Хроника 31.01.2026                          |
|     "День прорывов: от утренней встречи..."      |
+--------------------------------------------------+
```

---

## Следующие шаги (опционально)

1. **Документы** — реализовать модуль документов с OCR
2. **Вложения** — добавить описания изображений (из `attachmentInsights`)
3. **Напоминания** — включить активные напоминания в контекст
