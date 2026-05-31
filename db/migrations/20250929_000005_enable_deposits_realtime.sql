-- Enable RLS on deposits table
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists to avoid conflicts
DROP POLICY IF EXISTS "Allow public read access to deposits" ON public.deposits;

-- Create policy to allow public read access (needed for anonymous realtime subscriptions)
CREATE POLICY "Allow public read access to deposits"
ON public.deposits
FOR SELECT
TO public
USING (true);

-- Add table to supabase_realtime publication if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'deposits'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.deposits;
  END IF;
END
$$;

