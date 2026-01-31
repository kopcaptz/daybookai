-- Добавить явную политику запрета прямого доступа
-- Edge Functions с service_role продолжат работать (обходят RLS)
CREATE POLICY "Deny all direct access"
  ON public.feedback
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- Добавить комментарий для документации
COMMENT ON TABLE public.feedback IS 
  'User feedback storage. All access managed via Edge Functions with service_role. Direct client access prohibited by RLS policy.';