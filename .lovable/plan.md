

# План: Исправление RLS политик Ethereal Layer

## Проблема

В миграции `20260201192557` политики RLS для 7 таблиц были созданы **без ключевого слова `AS RESTRICTIVE`**:

```sql
-- ПРОБЛЕМНЫЙ КОД (текущий):
CREATE POLICY "Deny all direct access" ON ethereal_messages 
  FOR ALL USING (false) WITH CHECK (false);
-- По умолчанию создаётся PERMISSIVE политика!
```

| Таблица | Текущий тип | Правильный тип |
|---------|-------------|----------------|
| ethereal_messages | PERMISSIVE | RESTRICTIVE |
| ethereal_rooms | PERMISSIVE | RESTRICTIVE |
| ethereal_room_members | PERMISSIVE | RESTRICTIVE |
| ethereal_sessions | PERMISSIVE | RESTRICTIVE |
| ethereal_chronicles | PERMISSIVE | RESTRICTIVE |
| ethereal_tasks | PERMISSIVE | RESTRICTIVE |
| ethereal_calendar_events | PERMISSIVE | RESTRICTIVE |

Правильно защищены (не требуют изменений):
- ethereal_game_sessions (RESTRICTIVE)
- ethereal_game_rounds (RESTRICTIVE)
- ethereal_chronicle_revisions (RESTRICTIVE)

---

## Почему это важно

**PERMISSIVE vs RESTRICTIVE в PostgreSQL:**

| Тип | Поведение |
|-----|-----------|
| PERMISSIVE + USING(false) | Блокирует доступ, НО если добавить другую PERMISSIVE политику с USING(true), доступ откроется |
| RESTRICTIVE + USING(false) | ВСЕГДА блокирует доступ, независимо от других политик |

**Текущий риск: НИЗКИЙ**, но это плохая практика для архитектуры "Deny all direct access".

---

## Решение

Создать миграцию, которая:
1. Удалит старые PERMISSIVE политики
2. Создаст новые RESTRICTIVE политики с тем же именем

```sql
-- Миграция: fix_ethereal_restrictive_policies

-- 1. Удаляем старые PERMISSIVE политики
DROP POLICY IF EXISTS "Deny all direct access" ON ethereal_messages;
DROP POLICY IF EXISTS "Deny all direct access" ON ethereal_rooms;
DROP POLICY IF EXISTS "Deny all direct access" ON ethereal_room_members;
DROP POLICY IF EXISTS "Deny all direct access" ON ethereal_sessions;
DROP POLICY IF EXISTS "Deny all direct access" ON ethereal_chronicles;
DROP POLICY IF EXISTS "Deny all direct access" ON ethereal_tasks;
DROP POLICY IF EXISTS "Deny all direct access" ON ethereal_calendar_events;

-- 2. Создаём RESTRICTIVE политики
CREATE POLICY "Deny all direct access" ON ethereal_messages
  AS RESTRICTIVE FOR ALL TO public
  USING (false) WITH CHECK (false);

CREATE POLICY "Deny all direct access" ON ethereal_rooms
  AS RESTRICTIVE FOR ALL TO public
  USING (false) WITH CHECK (false);

CREATE POLICY "Deny all direct access" ON ethereal_room_members
  AS RESTRICTIVE FOR ALL TO public
  USING (false) WITH CHECK (false);

CREATE POLICY "Deny all direct access" ON ethereal_sessions
  AS RESTRICTIVE FOR ALL TO public
  USING (false) WITH CHECK (false);

CREATE POLICY "Deny all direct access" ON ethereal_chronicles
  AS RESTRICTIVE FOR ALL TO public
  USING (false) WITH CHECK (false);

CREATE POLICY "Deny all direct access" ON ethereal_tasks
  AS RESTRICTIVE FOR ALL TO public
  USING (false) WITH CHECK (false);

CREATE POLICY "Deny all direct access" ON ethereal_calendar_events
  AS RESTRICTIVE FOR ALL TO public
  USING (false) WITH CHECK (false);
```

---

## Ожидаемый результат

После миграции все 10 таблиц Ethereal Layer будут иметь **RESTRICTIVE** политики:

```
ethereal_messages          → RESTRICTIVE ✅
ethereal_rooms             → RESTRICTIVE ✅
ethereal_room_members      → RESTRICTIVE ✅
ethereal_sessions          → RESTRICTIVE ✅
ethereal_chronicles        → RESTRICTIVE ✅
ethereal_tasks             → RESTRICTIVE ✅
ethereal_calendar_events   → RESTRICTIVE ✅
ethereal_game_sessions     → RESTRICTIVE ✅ (уже правильно)
ethereal_game_rounds       → RESTRICTIVE ✅ (уже правильно)
ethereal_chronicle_revisions → RESTRICTIVE ✅ (уже правильно)
```

Это обеспечит надёжную защиту архитектуры "Edge Function Proxy" и предотвратит случайное открытие доступа при добавлении новых политик в будущем.

