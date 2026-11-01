/*
# Create analyses history table

1. New Tables
- `analyses`
  - `id` (uuid, primary key) identifies each saved analysis.
  - `created_at` (timestamptz) records when the analysis was generated.
  - `file_name` (text) is the name of the analyzed source(s).
  - `source_type` (text) is the kind of source (text, pdf, spreadsheet, image, mixed).
  - `question` (text) is the question asked by the user.
  - `characters_analyzed` (integer) is the amount of text sent for analysis.
  - `result` (jsonb) stores the full executive report returned by the agent.

2. Security
- Enable RLS on `analyses`.
- The app has no sign-in, so the anon and authenticated roles can read and add rows.
- Rows cannot be edited or deleted from the app.

3. Important Notes
- 1. Existing data is untouched; this only creates the table if it does not already exist.
- 2. Policies are dropped and recreated so this migration can be re-run safely.
*/

CREATE TABLE IF NOT EXISTS analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  file_name text NOT NULL,
  source_type text NOT NULL,
  question text NOT NULL,
  characters_analyzed integer NOT NULL DEFAULT 0,
  result jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS analyses_created_at_idx ON analyses (created_at DESC);

ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON analyses TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_analyses" ON analyses;
CREATE POLICY "anon_select_analyses" ON analyses FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_analyses" ON analyses;
CREATE POLICY "anon_insert_analyses" ON analyses FOR INSERT
  TO anon, authenticated WITH CHECK (true);
