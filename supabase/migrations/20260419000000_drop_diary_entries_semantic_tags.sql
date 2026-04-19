-- Drop the semantic_tags column from diary_entries.
-- Clients no longer read or write this column: the runtime reader was removed
-- from contextPack scoring, the client sync wiring was cleaned out of
-- syncService, the producer stopped generating and persisting the field, and
-- Dexie v17 dropped the local schema/index. This migration closes the tail.

ALTER TABLE public.diary_entries DROP COLUMN semantic_tags;
