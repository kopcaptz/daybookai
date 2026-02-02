

# Исправление чата Ethereal — двойная подписка

## Проблема

Чат не активен потому что хук `useEtherealRealtime()` вызывается **дважды**:

1. В `EtherealChat.tsx` (строка 18)
2. В `EtherealHeader.tsx` (строка 18)

Это видно по логам — каждая операция выполняется в двух экземплярах:
```
[RT] history:start
[RT] history:start    ← дубликат!
[RT] connected + reconcile
[RT] history:end
[RT] history:end      ← дубликат!
```

Два независимых экземпляра хука приводят к:
- Race condition при подписке на Realtime канал
- Разным значениям `isConnected` в разных компонентах
- Потенциальному конфликту при обработке сообщений

## Решение

Передавать `isConnected` как prop из `EtherealChat` в `EtherealHeader` вместо повторного вызова хука.

### Изменения в EtherealHeader.tsx

```typescript
// До:
export function EtherealHeader({ title, subtitle }: EtherealHeaderProps) {
  const { isConnected } = useEtherealRealtime();  // ← проблема!

// После:
interface EtherealHeaderProps {
  title: string;
  subtitle?: string;
  isConnected: boolean;  // ← получаем через prop
}

export function EtherealHeader({ title, subtitle, isConnected }: EtherealHeaderProps) {
  // Удаляем useEtherealRealtime()
```

### Изменения в EtherealChat.tsx

```typescript
// Передаём isConnected как prop:
<EtherealHeader title="Бар" subtitle="Чат" isConnected={isConnected} />
```

## Изменяемые файлы

| Файл | Изменение |
|------|-----------|
| `src/components/ethereal/EtherealHeader.tsx` | Удалить вызов `useEtherealRealtime()`, добавить prop `isConnected` |
| `src/pages/ethereal/EtherealChat.tsx` | Передать `isConnected` в `EtherealHeader` |

## Техническая схема

```text
До:                                 После:
┌─────────────────┐                ┌─────────────────┐
│  EtherealChat   │                │  EtherealChat   │
│  useEtherealRT()├──┬──isConn=?   │  useEtherealRT()├──isConnected
└────────┬────────┘  │             └────────┬────────┘     │
         │           │                      │              │
    ┌────▼────┐      │                 ┌────▼────┐         │
    │ Header  │      │                 │ Header  │◄────────┘
    │ useRT() ├──────┘                 │ (prop)  │
    └─────────┘                        └─────────┘
  ❌ 2 экземпляра                     ✅ 1 экземпляр
```

## Результат

- Один экземпляр хука `useEtherealRealtime()`
- Стабильное значение `isConnected` во всех компонентах
- Поле ввода и кнопки станут активными
- Исчезнут дублирующиеся логи

