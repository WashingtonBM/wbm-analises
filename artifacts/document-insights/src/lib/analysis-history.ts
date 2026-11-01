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
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function requestHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

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

export async function saveAnalysis(entry: NewAnalysis): Promise<void> {
  const response = await fetch(`${supabaseUrl}/rest/v1/analyses`, {
    method: 'POST',
    headers: requestHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({
      file_name: entry.fileName,
      source_type: entry.sourceType,
      question: entry.question,
      characters_analyzed: entry.result.source.charactersAnalyzed,
      result: entry.result,
    }),
  });
  if (!response.ok) throw new Error(`Save failed (${response.status})`);
}

export async function listAnalyses(): Promise<SavedAnalysis[]> {
  const query = `select=id,created_at,file_name,source_type,question,result&order=created_at.desc&limit=${HISTORY_LIMIT}`;
  const response = await fetch(`${supabaseUrl}/rest/v1/analyses?${query}`, {
    headers: requestHeaders(),
  });
  if (!response.ok) throw new Error(`History load failed (${response.status})`);
  const rows: unknown = await response.json();
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
