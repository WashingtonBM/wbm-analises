import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listAnalyses, saveAnalysis } from './analysis-history';

type Call = { method: string; args: unknown[] };

function fakeClient(response: { data?: unknown; error?: unknown }) {
  const calls: Call[] = [];
  const builder = (table: string) => {
    const chain = {
      insert(payload: unknown) {
        calls.push({ method: `${table}.insert`, args: [payload] });
        return chain;
      },
      select(columns: string) {
        calls.push({ method: `${table}.select`, args: [columns] });
        return chain;
      },
      order(column: string, options: unknown) {
        calls.push({ method: `${table}.order`, args: [column, options] });
        return chain;
      },
      limit(count: number) {
        calls.push({ method: `${table}.limit`, args: [count] });
        return chain;
      },
      then<T>(resolve: (value: unknown) => T, reject?: (reason: unknown) => T) {
        return Promise.resolve(response).then(resolve, reject);
      },
    };
    return chain;
  };
  const client = {
    from(table: string) {
      calls.push({ method: 'from', args: [table] });
      return builder(table);
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const result = {
  answer: 'Resposta',
  summary: 'Resumo',
  keyFindings: [],
  anomalies: [],
  recommendations: [],
  suggestedQuestions: [],
  source: { fileName: 'relatorio.csv', charactersAnalyzed: 42 },
};

const savedRow = {
  id: 'row-1',
  created_at: '2026-01-02T10:00:00Z',
  file_name: 'relatorio.csv',
  source_type: 'spreadsheet',
  question: 'Qual o saldo?',
  result,
};

describe('saveAnalysis', () => {
  it('inserts into analyses without sending user_id so the database assigns the owner', async () => {
    const { client, calls } = fakeClient({ error: null });
    await saveAnalysis(client, {
      fileName: 'relatorio.csv',
      sourceType: 'spreadsheet',
      question: 'Qual o saldo?',
      result,
    });
    assert.deepEqual(calls[0], { method: 'from', args: ['analyses'] });
    const payload = calls[1].args[0] as Record<string, unknown>;
    assert.equal(calls[1].method, 'analyses.insert');
    assert.equal('user_id' in payload, false);
    assert.equal(payload['characters_analyzed'], 42);
  });

  it('rejects when the database refuses the insert', async () => {
    const { client } = fakeClient({ error: new Error('row violates row-level security policy') });
    await assert.rejects(saveAnalysis(client, {
      fileName: 'x',
      sourceType: 'text',
      question: 'q',
      result,
    }));
  });
});

describe('listAnalyses', () => {
  it('reads only the newest 20 rows ordered by date and maps them to the app shape', async () => {
    const { client, calls } = fakeClient({ data: [savedRow], error: null });
    const entries = await listAnalyses(client);
    assert.ok(calls.some((call) => call.method === 'analyses.order' && call.args[0] === 'created_at'
      && (call.args[1] as { ascending: boolean }).ascending === false));
    assert.ok(calls.some((call) => call.method === 'analyses.limit' && call.args[0] === 20));
    assert.deepEqual(entries, [{
      id: 'row-1',
      createdAt: '2026-01-02T10:00:00Z',
      fileName: 'relatorio.csv',
      sourceType: 'spreadsheet',
      question: 'Qual o saldo?',
      result,
    }]);
  });

  it('rejects when the query fails', async () => {
    const { client } = fakeClient({ error: new Error('permission denied') });
    await assert.rejects(listAnalyses(client));
  });

  it('rejects a response that does not match the expected row shape', async () => {
    const { client } = fakeClient({ data: [{ id: 'row-1' }], error: null });
    await assert.rejects(listAnalyses(client), /Unexpected history response/);
  });
});
