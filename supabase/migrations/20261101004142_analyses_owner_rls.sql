/*
# Scope analyses history to authenticated owners

1. Modified Tables
- `analyses`
  - New column `user_id` (uuid), references `auth.users(id)`, defaults to the signed-in user, required.
  - New index on (`user_id`, `created_at` DESC) for the per-user history query.

2. Security
- Removed the public SELECT and INSERT policies that allowed anonymous reads of every saved report.
- The `anon` role loses all privileges on `analyses`.
- The `authenticated` role keeps only SELECT and INSERT.
- SELECT is limited to rows where `user_id` equals the caller's id.
- INSERT requires `user_id` to equal the caller's id.
- No UPDATE or DELETE policies are created; those operations are denied.

3. Important Notes
- The table had zero rows when this migration was written, so no existing record needed an owner.
- If any row exists when this runs, the NOT NULL step fails and the whole migration is rolled back without changes.
- Row level security stays enabled.
*/

ALTER TABLE analyses ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE analyses ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE analyses ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS analyses_user_created_idx ON analyses (user_id, created_at DESC);

ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_analyses" ON analyses;
DROP POLICY IF EXISTS "anon_insert_analyses" ON analyses;

REVOKE ALL ON analyses FROM anon, authenticated;
GRANT SELECT, INSERT ON analyses TO authenticated;

DROP POLICY IF EXISTS "select_own_analyses" ON analyses;
CREATE POLICY "select_own_analyses" ON analyses FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_analyses" ON analyses;
CREATE POLICY "insert_own_analyses" ON analyses FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
