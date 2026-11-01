import { useEffect, useState } from 'react';
import { ChevronRight, Clock3, LoaderCircle } from 'lucide-react';
import { listAnalyses, type SavedAnalysis } from '../lib/analysis-history';

type Props = {
  refreshKey: number;
  selectedId: string | null;
  onSelect: (entry: SavedAnalysis) => void;
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

export default function AnalysisHistory({ refreshKey, selectedId, onSelect }: Props) {
  const [entries, setEntries] = useState<SavedAnalysis[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    listAnalyses()
      .then((items) => {
        if (cancelled) return;
        setEntries(items);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <section className="mt-14 border-t border-border pt-10" aria-label="Análises anteriores" data-testid="section-analysis-history">
      <div className="mb-5 flex items-center gap-2 text-muted-foreground">
        <Clock3 size={15} />
        <h2 className="font-mono-ui text-[10px] font-medium uppercase tracking-[0.16em]">Análises anteriores</h2>
      </div>

      {status === 'loading' && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="state-history-loading">
          <LoaderCircle size={14} className="animate-spin" /> Carregando histórico…
        </div>
      )}

      {status === 'error' && (
        <p className="text-xs leading-5 text-destructive" role="alert" data-testid="state-history-error">
          Não foi possível carregar o histórico agora. Atualize a página para tentar de novo.
        </p>
      )}

      {status === 'ready' && entries.length === 0 && (
        <p className="text-xs leading-5 text-muted-foreground" data-testid="state-history-empty">
          As análises que você gerar aparecerão aqui para consulta posterior.
        </p>
      )}

      {status === 'ready' && entries.length > 0 && (
        <ul className="grid gap-2 md:grid-cols-2" data-testid="list-analysis-history">
          {entries.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => onSelect(entry)}
                aria-current={entry.id === selectedId ? 'true' : undefined}
                className={`focus-ring group flex w-full items-start justify-between gap-3 rounded-xl border px-4 py-3.5 text-left transition hover:border-primary/60 hover:bg-primary/[0.04] ${entry.id === selectedId ? 'border-primary/60 bg-primary/[0.06]' : 'border-border bg-card'}`}
                data-testid={`button-history-${entry.id}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{entry.fileName}</span>
                  <span className="mt-1 block truncate text-xs leading-5 text-muted-foreground">{entry.question}</span>
                  <span className="mt-2 block font-mono-ui text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{formatDate(entry.createdAt)}</span>
                </span>
                <ChevronRight size={15} className="mt-0.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
