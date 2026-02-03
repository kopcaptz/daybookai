-- Add explicit RESTRICTIVE RLS policy for feedback-attachments bucket
-- This provides defense-in-depth protection consistent with ethereal-media bucket

CREATE POLICY "deny_direct_feedback_attachments"
ON storage.objects
AS RESTRICTIVE
FOR ALL
TO public
USING (bucket_id = 'feedback-attachments' AND false)
WITH CHECK (bucket_id = 'feedback-attachments' AND false);