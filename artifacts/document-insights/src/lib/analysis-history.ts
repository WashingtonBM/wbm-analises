import type { SupabaseClient } from '@supabase/supabase-js';

export type AnalysisResult = {
  answer: string;
  summary: string;
  keyFindings: string[];
  anomalies: string[];
  recommendations: string[];
  suggestedQuestions: string[];
  source: { fileName: string; charactersAnalyzed: number };
};

export type SavedAnalysis = {
  id: string;
  createdAt: string;
  fileName: string;
  sourceType: string;
  question: string;
  result: AnalysisResult;
};

type NewAnalysis = {
  fileName: string;
  sourceType: string;
  question: string;
  result: AnalysisResult;
};

type AnalysisRow = {
  id: string;
  created_at: string;
  file_name: string;
  source_type: string;
  question: string;
  result: AnalysisResult;
};

const HISTORY_LIMIT = 20;
const HISTORY_COLUMNS = 'id,created_at,file_name,source_type,question,result';

function isAnalysisRow(value: unknown): value is AnalysisRow {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Partial<AnalysisRow>;
  return typeof row.id === 'string'
    && typeof row.created_at === 'string'
    && typeof row.file_name === 'string'
    && typeof row.source_type === 'string'
    && typeof row.question === 'string'
    && typeof row.result === 'object'
    && row.result !== null;
}

export async function saveAnalysis(client: SupabaseClient, entry: NewAnalysis): Promise<void> {
  const { error } = await client.from('analyses').insert({
    file_name: entry.fileName,
    source_type: entry.sourceType,
    question: entry.question,
    characters_analyzed: entry.result.source.charactersAnalyzed,
    result: entry.result,
  });
  if (error) throw error;
}

export async function listAnalyses(client: SupabaseClient): Promise<SavedAnalysis[]> {
  const { data, error } = await client
    .from('analyses')
    .select(HISTORY_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw error;
  const rows: unknown = data;
  if (!Array.isArray(rows) || !rows.every(isAnalysisRow)) {
    throw new Error('Unexpected history response');
  }
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    fileName: row.file_name,
    sourceType: row.source_type,
    question: row.question,
    result: row.result,
  }));
}
