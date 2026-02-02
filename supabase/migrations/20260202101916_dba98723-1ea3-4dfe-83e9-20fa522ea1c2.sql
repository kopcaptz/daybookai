-- Add priority, completed_at, completed_by columns to ethereal_tasks
ALTER TABLE public.ethereal_tasks
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_by uuid;

-- Add constraint for priority values
ALTER TABLE public.ethereal_tasks
  ADD CONSTRAINT ethereal_tasks_priority_check 
  CHECK (priority IN ('normal', 'urgent'));

-- Add foreign key for completed_by
ALTER TABLE public.ethereal_tasks
  ADD CONSTRAINT ethereal_tasks_completed_by_fkey 
  FOREIGN KEY (completed_by) REFERENCES public.ethereal_room_members(id) ON DELETE SET NULL;

-- Indexes for frequent queries
CREATE INDEX IF NOT EXISTS idx_tasks_room_updated 
  ON public.ethereal_tasks(room_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_room_status_due 
  ON public.ethereal_tasks(room_id, status, due_at);