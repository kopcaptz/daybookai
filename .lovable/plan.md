

# План: Обновление RLS-политик Ethereal Layer для явного указания ролей

## Проблема
Текущие RESTRICTIVE RLS-политики для ethereal_* таблиц используют роль `{public}` вместо явного указания `{anon, authenticated}`. Хотя безопасность не нарушена (USING false блокирует все запросы), сканеры безопасности интерпретируют `{public}` как "открытый доступ" и выдают ложноположительные предупреждения.

## Текущее состояние политик

| Таблица | Роли | Статус |
|---------|------|--------|
| ethereal_calendar_events | {public} | Требует обновления |
| ethereal_chronicle_revisions | {public} | Требует обновления |
| ethereal_chronicles | {public} | Требует обновления |
| ethereal_game_rounds | {public} | Требует обновления |
| ethereal_game_sessions | {public} | Требует обновления |
| ethereal_messages | {public} | Требует обновления |
| ethereal_room_members | {anon, authenticated} | OK |
| ethereal_rooms | {public} | Требует обновления |
| ethereal_sessions | {public} | Требует обновления |
| ethereal_tasks | {public} | Требует обновления |

## Что будет сделано

Для 9 таблиц (все кроме ethereal_room_members) выполним:
1. Удаление старой политики с `{public}`
2. Создание новой RESTRICTIVE политики с явным указанием `TO anon, authenticated`

## SQL-миграция

```sql
-- ethereal_calendar_events
DROP POLICY IF EXISTS "Deny all direct access" ON public.ethereal_calendar_events;
CREATE POLICY "Deny all direct access"
  ON public.ethereal_calendar_events
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ethereal_chronicle_revisions
DROP POLICY IF EXISTS "Deny all direct access" ON public.ethereal_chronicle_revisions;
CREATE POLICY "Deny all direct access"
  ON public.ethereal_chronicle_revisions
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ethereal_chronicles
DROP POLICY IF EXISTS "Deny all direct access" ON public.ethereal_chronicles;
CREATE POLICY "Deny all direct access"
  ON public.ethereal_chronicles
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ethereal_game_rounds
DROP POLICY IF EXISTS "Deny all direct access for ethereal_game_rounds" ON public.ethereal_game_rounds;
CREATE POLICY "Deny all direct access"
  ON public.ethereal_game_rounds
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ethereal_game_sessions
DROP POLICY IF EXISTS "Deny all direct access for ethereal_game_sessions" ON public.ethereal_game_sessions;
CREATE POLICY "Deny all direct access"
  ON public.ethereal_game_sessions
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ethereal_messages
DROP POLICY IF EXISTS "Deny all direct access" ON public.ethereal_messages;
CREATE POLICY "Deny all direct access"
  ON public.ethereal_messages
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ethereal_rooms
DROP POLICY IF EXISTS "Deny all direct access" ON public.ethereal_rooms;
CREATE POLICY "Deny all direct access"
  ON public.ethereal_rooms
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ethereal_sessions
DROP POLICY IF EXISTS "Deny all direct access" ON public.ethereal_sessions;
CREATE POLICY "Deny all direct access"
  ON public.ethereal_sessions
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ethereal_tasks
DROP POLICY IF EXISTS "Deny all direct access" ON public.ethereal_tasks;
CREATE POLICY "Deny all direct access"
  ON public.ethereal_tasks
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
```

## Результат

После миграции:
- Все ethereal_* таблицы будут иметь явное указание ролей `{anon, authenticated}`
- Сканеры безопасности перестанут выдавать ложноположительные предупреждения о "публичном доступе"
- Фактический уровень безопасности не изменится (USING false по-прежнему блокирует все прямые запросы)

## Критерий готовности

- Все 10 ethereal_* таблиц имеют политики с `roles = {anon, authenticated}`
- Повторное сканирование безопасности не показывает предупреждений о "публичном доступе"
- Edge Functions продолжают работать корректно (используют service_role, который обходит RLS)

