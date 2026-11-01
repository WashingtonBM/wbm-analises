/*
# Guard analyses to owner-only access

1. Modified Tables
- `analyses`: no columns changed, no rows touched, table not recreated.

2. Security
- Row level security stays enabled.
- Public policies `anon_select_analyses` and `anon_insert_analyses` are dropped if they exist.
- The `anon` role has all privileges revoked on `analyses`.
- The `authenticated` role keeps only SELECT and INSERT.
- Owner policies `select_own_analyses` (rows where `user_id` equals the caller) and `insert_own_analyses` (rows where `user_id` must equal the caller) are created only when missing. Existing correct policies are left unchanged.
- No UPDATE or DELETE policies exist, so those operations are denied.

3. Important Notes
- Safe to re-run: every statement checks for existing state first.
- No data is deleted or modified.
*/

ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_analyses" ON analyses;
DROP POLICY IF EXISTS "anon_insert_analyses" ON analyses;

REVOKE ALL ON analyses FROM anon;
GRANT SELECT, INSERT ON analyses TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'analyses' AND policyname = 'select_own_analyses'
  ) THEN
    CREATE POLICY "select_own_analyses" ON analyses FOR SELECT
      TO authenticated USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'analyses' AND policyname = 'insert_own_analyses'
  ) THEN
    CREATE POLICY "insert_own_analyses" ON analyses FOR INSERT
      TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
