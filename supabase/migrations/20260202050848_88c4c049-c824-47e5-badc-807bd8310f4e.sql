-- Add image fields to ethereal_messages
ALTER TABLE public.ethereal_messages
  ADD COLUMN image_path TEXT,
  ADD COLUMN image_mime TEXT,
  ADD COLUMN image_w INTEGER,
  ADD COLUMN image_h INTEGER;

-- Create private storage bucket for ethereal media (2MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('ethereal-media', 'ethereal-media', false, 2097152);

-- RLS: deny direct access ONLY for ethereal-media bucket
-- (other buckets like feedback-attachments remain unaffected)
CREATE POLICY "deny_direct_ethereal_media"
ON storage.objects
FOR ALL
USING (bucket_id = 'ethereal-media' AND false)
WITH CHECK (bucket_id = 'ethereal-media' AND false);