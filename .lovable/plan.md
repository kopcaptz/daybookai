
# План: Точечные RTL-фиксы для Ethereal Layer

## Проблема

При RTL-языках (иврит, арабский) интерфейс Ethereal Layer зеркально отражён — табы идут справа налево, кнопки ввода перевёрнуты.

## Решение

Точечные RTL-фиксы:
1. `rtl:flex-row-reverse` на flex-контейнерах навигации и ввода
2. `dir="ltr"` только на внутренних span с датами/временем/кодами

---

## Изменения по файлам

### 1. `EtherealBottomTabs.tsx` — строка 30

**Проблема:** Табы идут в обратном порядке при RTL.

**Массив tabs уже в логическом порядке (Bar→Games) — не трогаем!**

**Изменение:** Добавить `rtl:flex-row-reverse` на контейнер табов.

```tsx
// Строка 30 — было:
<div className="flex justify-around items-center h-16 max-w-lg mx-auto">

// Станет:
<div className="flex rtl:flex-row-reverse justify-around items-center h-16 max-w-lg mx-auto">
```

---

### 2. `EtherealChat.tsx` — строка 198

**Проблема:** Поле ввода с кнопками перевёрнуто (Send слева, Media справа).

**Изменение:** Добавить `rtl:flex-row-reverse` на контейнер ввода.

```tsx
// Строка 198 — было:
<div className="flex gap-2">

// Станет:
<div className="flex rtl:flex-row-reverse gap-2">
```

---

### 3. `EtherealChat.tsx` — строки 159-161

**Проблема:** Время `HH:mm` может отображаться как `54:32` вместо `23:45`.

**Изменение:** Обернуть время во внутренний `<span dir="ltr">`.

```tsx
// Было:
<span className="text-[10px] text-muted-foreground mt-1">
  {format(new Date(msg.createdAtMs), 'HH:mm')}
</span>

// Станет:
<span className="text-[10px] text-muted-foreground mt-1">
  <span dir="ltr">{format(new Date(msg.createdAtMs), 'HH:mm')}</span>
</span>
```

---

### 4. `EtherealPinModal.tsx` — строки 129-136

**Проблема:** PIN — это код, должен вводиться LTR.

**Изменение:** Добавить `dir="ltr"` и `className="text-left"` на Input для PIN.

```tsx
// Было (строки 129-136):
<Input
  id="pin"
  type="password"
  placeholder={t('pinPlaceholder')}
  value={pin}
  onChange={(e) => setPin(e.target.value)}
  minLength={4}
/>

// Станет:
<Input
  id="pin"
  type="password"
  placeholder={t('pinPlaceholder')}
  value={pin}
  onChange={(e) => setPin(e.target.value)}
  minLength={4}
  dir="ltr"
  className="text-left"
/>
```

---

### 5. `ChronicleView.tsx` — строка 133

**Проблема:** Дата `d MMMM yyyy, HH:mm` может переворачиваться.

**Изменение:** Обернуть дату во внутренний `<span dir="ltr">`.

```tsx
// Было:
<span className="flex items-center gap-1">
  <Clock className="w-4 h-4" />
  {format(new Date(chronicle.createdAtMs), 'd MMMM yyyy, HH:mm', { locale: dateLocale })}
</span>

// Станет:
<span className="flex items-center gap-1">
  <Clock className="w-4 h-4" />
  <span dir="ltr">{format(new Date(chronicle.createdAtMs), 'd MMMM yyyy, HH:mm', { locale: dateLocale })}</span>
</span>
```

---

### 6. `ChronicleView.tsx` — строка 137

**Проблема:** Дата редактирования `d MMM HH:mm` может переворачиваться.

**Изменение:** Обернуть дату во внутренний `<span dir="ltr">`.

```tsx
// Было:
<span className="text-xs opacity-70">
  ({t('edited')} {chronicle.updatedByName}, {format(new Date(chronicle.updatedAtMs), 'd MMM HH:mm', { locale: dateLocale })})
</span>

// Станет:
<span className="text-xs opacity-70">
  ({t('edited')} {chronicle.updatedByName}, <span dir="ltr">{format(new Date(chronicle.updatedAtMs), 'd MMM HH:mm', { locale: dateLocale })}</span>)
</span>
```

---

### 7. `ChronicleCard.tsx` — строка 81

**Проблема:** Дата `d MMM HH:mm` может переворачиваться.

**Изменение:** Обернуть дату во внутренний `<span dir="ltr">`.

```tsx
// Было:
<span className="flex items-center gap-1">
  <Clock className="w-3 h-3" />
  {format(new Date(chronicle.updatedAtMs), 'd MMM HH:mm', { locale: dateLocale })}
</span>

// Станет:
<span className="flex items-center gap-1">
  <Clock className="w-3 h-3" />
  <span dir="ltr">{format(new Date(chronicle.updatedAtMs), 'd MMM HH:mm', { locale: dateLocale })}</span>
</span>
```

---

### 8. `TaskCard.tsx` — строка 151

**Проблема:** Дата `dueText` может переворачиваться.

**Изменение:** Обернуть dueText во внутренний `<span dir="ltr">`.

```tsx
// Было:
{t('due')} {dueText}

// Станет:
{t('due')} <span dir="ltr">{dueText}</span>
```

---

### 9. `EtherealMembersSheet.tsx` — строка 133

**Проблема:** Время `formatDistanceToNow` может отображаться некорректно.

**Изменение:** Обернуть время во внутренний `<span dir="ltr">`.

```tsx
// Было:
<p className="text-xs text-muted-foreground">
  {t('lastSeen')} {formatDistanceToNow(new Date(member.lastSeenAt), { locale: dateLocale })} {t('ago')}
</p>

// Станет:
<p className="text-xs text-muted-foreground">
  {t('lastSeen')} <span dir="ltr">{formatDistanceToNow(new Date(member.lastSeenAt), { locale: dateLocale })}</span> {t('ago')}
</p>
```

---

## Сводка изменений

| Файл | Изменение | Строка |
|------|-----------|--------|
| `EtherealBottomTabs.tsx` | `rtl:flex-row-reverse` на контейнер табов | 30 |
| `EtherealChat.tsx` | `rtl:flex-row-reverse` на composer | 198 |
| `EtherealChat.tsx` | `<span dir="ltr">` на время сообщения | 159-161 |
| `EtherealPinModal.tsx` | `dir="ltr" className="text-left"` на PIN input | 129-136 |
| `ChronicleView.tsx` | `<span dir="ltr">` на основную дату | 133 |
| `ChronicleView.tsx` | `<span dir="ltr">` на дату редактирования | 137 |
| `ChronicleCard.tsx` | `<span dir="ltr">` на дату | 81 |
| `TaskCard.tsx` | `<span dir="ltr">` на dueText | 151 |
| `EtherealMembersSheet.tsx` | `<span dir="ltr">` на "last seen" | 133 |

---

## Ожидаемый результат

- Табы навигации в правильном порядке: Bar → Library → Bridge → Map → Games
- Composer чата: Media слева, Input по центру, Send справа
- Все числа, даты и время отображаются корректно (LTR) внутри RTL-окружения
- PIN вводится как код (LTR)
- Окружающий RTL-текст не ломается
