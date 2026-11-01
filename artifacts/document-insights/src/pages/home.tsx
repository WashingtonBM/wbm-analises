import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { analyzeContent, type AnalysisInput } from '@workspace/api-client-react';
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clipboard,
  Clock3,
  FileText,
  FileSpreadsheet,
  FileType2,
  Image as ImageIcon,
  Library,
  LoaderCircle,
  PanelLeft,
  Plus,
  RotateCcw,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import AnalysisHistory from '../components/analysis-history';
import { saveAnalysis, type AnalysisResult, type SavedAnalysis } from '../lib/analysis-history';
import { useAuth } from '../lib/auth-context';
import { supabase } from '../lib/supabase';

const ACCEPTED_TYPES = '.txt,.md,.csv,.json,.tsv,.pdf,.xls,.xlsx,.png,.jpg,.jpeg,.webp';
const MAX_CONTENT_LENGTH = 120000;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TOTAL_FILE_SIZE = 18 * 1024 * 1024;

type SourceType = 'text' | 'pdf' | 'spreadsheet' | 'image' | 'mixed';
type FileSourceType = Exclude<SourceType, 'mixed' | 'text'> | 'text';
type LoadedSource = {
  id: string;
  name: string;
  size: number;
  sourceType: FileSourceType;
  content: string;
  imageData?: string;
  previewUrl?: string;
};

function formatCharacters(count: number) {
  return new Intl.NumberFormat('en-US').format(count);
}

function formatFileSize(bytes: number) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SourceIcon({ type, size = 16 }: { type: SourceType; size?: number }) {
  if (type === 'image') return <ImageIcon size={size} />;
  if (type === 'spreadsheet') return <FileSpreadsheet size={size} />;
  if (type === 'pdf') return <FileType2 size={size} />;
  return <FileText size={size} />;
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('empty-file'));
    reader.onerror = () => reject(new Error('read-failed'));
    reader.readAsDataURL(file);
  });
}

async function extractPdfText(file: File) {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
  GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const document = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const text = await page.getTextContent();
    const pageText = text.items
      .map((item) => 'str' in item && typeof item.str === 'string' ? item.str : '')
      .filter(Boolean)
      .join(' ');
    if (pageText.trim()) pages.push(`[Página ${pageNumber}]\n${pageText.trim()}`);
  }
  return pages.join('\n\n');
}

async function extractSpreadsheetText(file: File) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheets = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    return `[Aba: ${sheetName}]\n${XLSX.utils.sheet_to_csv(sheet, { blankrows: false })}`;
  });
  return sheets.join('\n\n').trim();
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [sources, setSources] = useState<LoadedSource[]>([]);
  const [content, setContent] = useState('');
  const [isReadingFiles, setIsReadingFiles] = useState(false);
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [fileError, setFileError] = useState('');
  const [copied, setCopied] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');
  const resultRef = useRef<HTMLElement>(null);
  const { signOut, getAccessToken } = useAuth();
  const analysis = useMutation({
    mutationFn: ({ data, accessToken }: { data: AnalysisInput; accessToken: string | null }) => {
      if (!accessToken) throw new Error('Sua sessão expirou. Entre novamente para continuar.');
      return analyzeContent(data, { headers: { Authorization: `Bearer ${accessToken}` } });
    },
  });

  const sourcesRef = useRef(sources);
  useEffect(() => {
    sourcesRef.current = sources;
  }, [sources]);
  useEffect(() => () => {
    sourcesRef.current.forEach((source) => source.previewUrl && URL.revokeObjectURL(source.previewUrl));
  }, []);

  const clearSource = () => {
    sources.forEach((source) => source.previewUrl && URL.revokeObjectURL(source.previewUrl));
    setSources([]);
    setContent('');
    setResult(null);
  };

  const reset = () => {
    clearSource();
    setQuestion('');
    setFileError('');
    setCopied(false);
    analysis.reset();
    if (inputRef.current) inputRef.current.value = '';
  };

  const loadFile = async (file: File): Promise<LoadedSource | null> => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    const imageExtensions = ['png', 'jpg', 'jpeg', 'webp'];
    const isImage = ['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
      || Boolean(extension && imageExtensions.includes(extension));
    const isPdf = extension === 'pdf' || file.type === 'application/pdf';
    const isSpreadsheet = Boolean(extension && ['xls', 'xlsx', 'csv', 'tsv'].includes(extension));
    const isText = Boolean(extension && ['txt', 'md', 'json'].includes(extension));
    if (!isImage && !isPdf && !isSpreadsheet && !isText) {
      setFileError('Escolha um PDF, XLS, XLSX, CSV, TSV, TXT, MD, JSON ou uma imagem PNG, JPG ou WEBP.');
      return null;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileError('Esse arquivo ultrapassa o limite de 10 MB.');
      return null;
    }

    try {
      if (isImage) {
        const dataUrl = await readAsDataUrl(file);
        return {
          id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
          name: file.name,
          size: file.size,
          sourceType: 'image',
          content: '',
          imageData: dataUrl,
          previewUrl: URL.createObjectURL(file),
        };
      }

      const text = isPdf
        ? await extractPdfText(file)
        : isSpreadsheet
          ? await extractSpreadsheetText(file)
          : await file.text();
      if (!text.trim()) {
        setFileError(isPdf
          ? 'Esse PDF não possui texto selecionável. Envie um PDF com camada de texto ou uma imagem da página.'
          : 'Esse arquivo parece estar vazio ou sem dados legíveis.');
        return null;
      }
      return {
        id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
        name: file.name,
        size: file.size,
        sourceType: isPdf ? 'pdf' : isSpreadsheet ? 'spreadsheet' : 'text',
        content: text.slice(0, MAX_CONTENT_LENGTH),
      };
    } catch {
      setFileError('Não foi possível ler esse arquivo. Verifique o formato e tente novamente.');
      return null;
    }
  };

  const loadFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    setFileError('');
    if (files.length > 8 || sources.length + files.length > 8) {
      setFileError('Você pode enviar até 8 arquivos por análise.');
      return;
    }
    const addedBytes = files.reduce((total, file) => total + file.size, 0);
    if (totalFileSize + addedBytes > MAX_TOTAL_FILE_SIZE) {
      setFileError('O tamanho combinado dos arquivos não pode ultrapassar 18 MB.');
      return;
    }
    setIsReadingFiles(true);
    const loaded = (await Promise.all(files.map(loadFile))).filter((source): source is LoadedSource => Boolean(source));
    setIsReadingFiles(false);
    if (!loaded.length) return;
    const nextSources = [...sources, ...loaded];
    setSources(nextSources);
    setContent(nextSources.map((source) => source.content).filter(Boolean).join('\n\n').slice(0, MAX_CONTENT_LENGTH));
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeSource = (id: string) => {
    const removed = sources.find((source) => source.id === id);
    if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
    const nextSources = sources.filter((source) => source.id !== id);
    setSources(nextSources);
    setContent(nextSources.map((source) => source.content).filter(Boolean).join('\n\n').slice(0, MAX_CONTENT_LENGTH));
    setResult(null);
  };

  const sourceType: SourceType = sources.length === 0
    ? 'text'
    : new Set(sources.map((source) => source.sourceType)).size === 1
      ? sources[0].sourceType
      : 'mixed';
  const fileName = sources.map((source) => source.name).join(', ');
  const imageData = sources.flatMap((source) => source.imageData ? [source.imageData] : []);
  const totalFileSize = sources.reduce((total, source) => total + source.size, 0);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasSource || !question.trim()) return;
    const data = {
      fileName: fileName || 'pasted-content.txt',
      sourceType,
      ...(content.trim() ? { content: content.slice(0, MAX_CONTENT_LENGTH) } : {}),
      ...(imageData.length ? { imageData } : {}),
      question: question.trim(),
    };
    const accessToken = await getAccessToken();
    analysis.mutate(
      { data, accessToken },
      {
        onSuccess: (response) => {
          const analysisResult = response as AnalysisResult;
          setResult(analysisResult);
          setSelectedHistoryId(null);
          setSaveError('');
          saveAnalysis(supabase, {
            fileName: data.fileName,
            sourceType,
            question: question.trim(),
            result: analysisResult,
          })
            .then(() => setHistoryVersion((version) => version + 1))
            .catch(() => setSaveError('A análise foi gerada, mas não foi possível salvá-la no histórico.'));
        },
      },
    );
  };

  const copyAnswer = async () => {
    if (!result) return;
    await navigator.clipboard?.writeText(`${result.answer}\n\nResumo executivo\n${result.summary}\n\nPrincipais achados\n${result.keyFindings.map((finding) => `• ${finding}`).join('\n')}\n\nAnomalias\n${result.anomalies.map((finding) => `• ${finding}`).join('\n')}\n\nRecomendações\n${result.recommendations.map((finding) => `• ${finding}`).join('\n')}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const openHistoryEntry = (entry: SavedAnalysis) => {
    setResult(entry.result);
    setSelectedHistoryId(entry.id);
    setQuestion(entry.question);
    setSaveError('');
    resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const hasSource = sources.length > 0 || Boolean(content.trim());
  const isWorking = analysis.isPending || isReadingFiles;
  const apiError = analysis.error as { response?: { data?: { error?: string } }; message?: string } | null;
  const errorStatus = (analysis.error as { status?: number } | null)?.status;
  const errorMessage = errorStatus === 401 || errorStatus === 403
    ? 'Não foi possível autorizar sua conta para esta análise. Entre novamente ou confirme seu acesso.'
    : apiError?.response?.data?.error || apiError?.message || 'The analysis desk could not complete that request. Please try again.';

  return (
    <div className="noise min-h-[100dvh] bg-background">
      <div className="flex min-h-[100dvh] flex-col md:flex-row">
        <aside className="flex w-full shrink-0 flex-col bg-sidebar text-sidebar-foreground md:min-h-[100dvh] md:w-[255px]">
          <div className="flex items-center justify-between border-b border-sidebar-border px-5 py-5 md:block md:px-6 md:py-7">
            <div className="flex items-center gap-3" data-testid="brand-document-insights">
              <div className="flex size-9 items-center justify-center rounded-[10px] bg-sidebar-primary text-sidebar-primary-foreground">
                <Library size={18} strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-[15px] font-extrabold tracking-[-0.02em]">WBM</p>
                <p className="font-display text-[18px] leading-4 text-sidebar-primary">Análises</p>
              </div>
            </div>
            <button className="focus-ring rounded-md p-2 text-sidebar-foreground/65 transition hover:bg-sidebar-accent hover:text-sidebar-foreground md:hidden" type="button" aria-label="Open navigation" data-testid="button-open-navigation">
              <PanelLeft size={18} />
            </button>
          </div>
          <div className="hidden flex-1 flex-col px-4 py-7 md:flex">
            <p className="mb-3 px-2 font-mono-ui text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/45">Área de trabalho</p>
            <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent px-3 py-3 text-sm font-semibold text-sidebar-accent-foreground" data-testid="nav-analysis-active">
              <Sparkles size={16} className="text-sidebar-primary" />
              Nova análise
            </div>
            <p className="mt-auto px-2 font-mono-ui text-[10px] uppercase leading-5 tracking-[0.12em] text-sidebar-foreground/40">
              Sigilo por padrão
              <br />
              Seus dados permanecem seus.
            </p>
          </div>
          <div className="hidden items-center gap-2 border-t border-sidebar-border px-6 py-5 text-xs text-sidebar-foreground/50 md:flex">
            <span className="size-1.5 rounded-full bg-sidebar-primary" />
            Central de análise online
          </div>
        </aside>

        <main className="desk-grid min-w-0 flex-1 overflow-hidden">
          <header className="flex items-center justify-between border-b border-border/80 bg-background/85 px-5 py-5 backdrop-blur-sm sm:px-8 lg:px-12">
            <div>
              <p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-muted-foreground">WBM Análises / 01</p>
              <h1 className="mt-1 text-base font-bold tracking-[-0.02em]">Nova análise financeira</h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={reset} type="button" className="focus-ring group flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-bold text-foreground transition hover:border-primary hover:text-primary" data-testid="button-new-analysis">
                <Plus size={15} className="transition-transform group-hover:rotate-90" />
                Começar de novo
              </button>
              <button type="button" onClick={() => void signOut()} className="focus-ring rounded-full border border-border bg-card px-3.5 py-2 text-xs font-bold text-foreground transition hover:border-primary hover:text-primary" data-testid="button-sign-out">
                Sair
              </button>
            </div>
          </header>

          <div className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8 sm:py-12 lg:px-12 lg:py-16">
            <section className="animate-rise mb-10 max-w-3xl">
              <div className="mb-4 flex items-center gap-2 text-primary">
                <span className="h-px w-8 bg-primary" />
                <span className="font-mono-ui text-[10px] font-medium uppercase tracking-[0.2em]">Analise seus relatórios</span>
              </div>
              <h2 className="font-display max-w-2xl text-[clamp(2.6rem,5vw,4.7rem)] leading-[0.94] tracking-[-0.045em] text-foreground">
                Encontre o sinal<br />
                <span className="text-primary">por trás dos números.</span>
              </h2>
              <p className="mt-5 max-w-lg text-sm leading-6 text-muted-foreground sm:text-[15px]">
                Envie um relatório financeiro. Faça uma pergunta objetiva. Receba uma leitura executiva com achados, anomalias e próximos passos fundamentados no material.
              </p>
            </section>

            <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(350px,.95fr)] lg:items-start">
              <section className="animate-rise rounded-2xl border border-border bg-card paper-shadow [animation-delay:80ms]" data-testid="section-source">
                <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
                  <div className="flex items-center gap-3">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-primary"><FileText size={16} /></span>
                    <div>
                      <h3 className="text-sm font-bold">Relatório financeiro</h3>
                      <p className="font-mono-ui text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Arquivo ou texto colado</p>
                    </div>
                  </div>
                  {hasSource && <span className="flex items-center gap-1.5 text-xs font-semibold text-primary" data-testid="status-source-ready"><CheckCircle2 size={14} /> Pronto para ler</span>}
                </div>
                <div className="p-5 sm:p-6">
                   <input id="source-file" ref={inputRef} type="file" accept={ACCEPTED_TYPES} multiple className="hidden" onChange={(event) => event.target.files?.length && void loadFiles(event.target.files)} data-testid="input-source-file" />
                  {!hasSource ? (
                    <label htmlFor="source-file" className="focus-ring group flex min-h-[184px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-primary/35 bg-primary/[0.035] px-6 text-center transition hover:border-primary/70 hover:bg-primary/[0.065]" data-testid="dropzone-source">
                      <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform group-hover:-translate-y-1"><Upload size={19} /></span>
                       <span className="text-sm font-bold">{isReadingFiles ? 'Lendo arquivos…' : 'Selecione um ou mais arquivos'}</span>
                       <span className="mt-1.5 max-w-md text-xs leading-5 text-muted-foreground">PDF, XLS, XLSX, CSV, TSV, TXT, MD, JSON e imagens PNG, JPG ou WEBP · até 8 arquivos e 18 MB no total</span>
                    </label>
                  ) : (
                    <div className="animate-appear">
                       <div className="mb-4 flex items-center justify-between gap-3">
                         <p className="font-mono-ui text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{sources.length} {sources.length === 1 ? 'arquivo carregado' : 'arquivos carregados'} · {formatFileSize(totalFileSize)}</p>
                         <button type="button" onClick={() => inputRef.current?.click()} className="focus-ring flex items-center gap-1.5 rounded-lg border border-primary/25 px-3 py-2 text-xs font-bold text-primary transition hover:bg-primary/[0.06]" data-testid="button-add-source"><Plus size={14} /> Adicionar</button>
                      </div>
                       <div className="mb-4 grid gap-2 sm:grid-cols-2" data-testid="list-loaded-sources">
                         {sources.map((source) => (
                           <div key={source.id} className="overflow-hidden rounded-xl border border-primary/20 bg-primary/[0.045]" data-testid={`card-loaded-source-${source.id}`}>
                             <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                               <div className="flex min-w-0 items-center gap-2">
                                 <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><SourceIcon type={source.sourceType} size={15} /></div>
                                 <div className="min-w-0">
                                   <p className="truncate text-xs font-bold">{source.name}</p>
                                   <p className="font-mono-ui text-[9px] text-muted-foreground">{formatFileSize(source.size)}</p>
                                 </div>
                               </div>
                               <button type="button" onClick={() => removeSource(source.id)} className="focus-ring rounded-md p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive" aria-label={`Remover ${source.name}`} data-testid={`button-remove-source-${source.id}`}><X size={14} /></button>
                             </div>
                             {source.previewUrl && <img src={source.previewUrl} alt={`Prévia de ${source.name}`} className="max-h-28 w-full border-t border-border object-contain" data-testid={`image-source-preview-${source.id}`} />}
                           </div>
                         ))}
                       </div>
                       {content ? (
                         <>
                            <textarea value={content} onChange={(event) => { setContent(event.target.value.slice(0, MAX_CONTENT_LENGTH)); setResult(null); }} className="focus-ring min-h-[168px] w-full resize-y rounded-xl border border-border bg-background/60 p-4 font-mono-ui text-xs leading-5 text-foreground placeholder:text-muted-foreground/75" placeholder="Cole ou edite o conteúdo do relatório…" aria-label="Conteúdo do relatório" data-testid="textarea-source-content" />
                           <div className="mt-2 flex justify-between font-mono-ui text-[10px] text-muted-foreground"><span>O texto é analisado apenas nesta solicitação</span><span data-testid="text-character-count">{formatCharacters(content.length)} / {formatCharacters(MAX_CONTENT_LENGTH)}</span></div>
                         </>
                       ) : (
                         <div className="rounded-xl border border-border bg-background/60 px-4 py-3 text-xs leading-5 text-muted-foreground">As imagens selecionadas serão lidas visualmente pelo agente.</div>
                       )}
                    </div>
                  )}
                   {!hasSource && <textarea value={content} onChange={(event) => { setContent(event.target.value.slice(0, MAX_CONTENT_LENGTH)); setResult(null); }} className="focus-ring mt-4 min-h-[96px] w-full resize-y rounded-xl border border-border bg-background/60 p-4 font-mono-ui text-xs leading-5 text-foreground placeholder:text-muted-foreground/75" placeholder="Ou cole o texto diretamente…" aria-label="Colar conteúdo do relatório" data-testid="textarea-paste-content" />}
                  {fileError && <div className="mt-3 flex items-start gap-2 rounded-lg bg-destructive/8 px-3 py-2.5 text-xs leading-5 text-destructive" role="alert" data-testid="alert-file-error"><AlertCircle size={15} className="mt-0.5 shrink-0" />{fileError}</div>}
                </div>
              </section>

              <section className="animate-rise rounded-2xl border border-border bg-card paper-shadow [animation-delay:150ms]" data-testid="section-question">
                <div className="border-b border-border px-5 py-4 sm:px-6">
                  <div className="flex items-center gap-3">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-accent/25 text-accent-foreground"><ArrowUpRight size={16} /></span>
                    <div>
                      <h3 className="text-sm font-bold">Pergunta para o agente</h3>
                      <p className="font-mono-ui text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Quanto mais específica, melhor a leitura</p>
                    </div>
                  </div>
                </div>
                <div className="p-5 sm:p-6">
                  <textarea value={question} onChange={(event) => { setQuestion(event.target.value.slice(0, 4000)); setResult(null); }} className="focus-ring min-h-[170px] w-full resize-y rounded-xl border border-border bg-background/60 p-4 text-sm leading-6 text-foreground placeholder:font-display placeholder:text-lg placeholder:italic placeholder:text-muted-foreground/60" placeholder="Qual ponto financeiro devo entender melhor neste relatório?" aria-label="Pergunta da análise" data-testid="textarea-analysis-question" />
                  <div className="mt-3 flex items-center justify-between gap-4">
                    <p className="flex items-center gap-1.5 text-xs leading-5 text-muted-foreground"><Clock3 size={14} /> Normalmente pronto em menos de um minuto</p>
                    <span className="font-mono-ui text-[10px] text-muted-foreground" data-testid="text-question-count">{question.length} / 4,000</span>
                  </div>
                  <button type="submit" disabled={!hasSource || !question.trim() || isWorking} className="focus-ring mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45" data-testid="button-submit-analysis">
                    {isWorking ? <><LoaderCircle size={16} className="animate-spin" /> Analisando relatório…</> : <><Sparkles size={16} /> Gerar análise <ChevronRight size={16} /></>}
                  </button>
                  <p className="mt-3 text-center text-[11px] leading-4 text-muted-foreground">As respostas permanecem fundamentadas no material enviado.</p>
                </div>
              </section>
            </form>

            {analysis.isError && (
              <div className="animate-appear mt-8 flex items-start justify-between gap-4 rounded-2xl border border-destructive/25 bg-destructive/[0.06] p-5" role="alert" data-testid="alert-analysis-error">
                <div className="flex items-start gap-3"><AlertCircle size={19} className="mt-0.5 shrink-0 text-destructive" /><div><p className="text-sm font-bold text-destructive">A análise encontrou um problema</p><p className="mt-1 text-xs leading-5 text-destructive/80">{errorMessage}</p></div></div>
                <button type="button" onClick={() => analysis.reset()} className="focus-ring flex shrink-0 items-center gap-1.5 rounded-lg border border-destructive/20 px-3 py-2 text-xs font-bold text-destructive transition hover:bg-destructive/10" data-testid="button-dismiss-error"><RotateCcw size={13} /> Fechar</button>
              </div>
            )}

            {isWorking && (
              <section className="animate-appear mt-10 rounded-2xl border border-border bg-card p-6 paper-shadow" aria-label="Analysis loading" data-testid="state-analysis-loading">
                <div className="flex items-center gap-3"><span className="flex size-8 items-center justify-center rounded-lg bg-accent/25"><Sparkles size={15} className="text-accent-foreground" /></span><div className="h-4 w-36 rounded skeleton" /></div>
                <div className="mt-6 space-y-3"><div className="h-3 w-full rounded skeleton" /><div className="h-3 w-[88%] rounded skeleton" /><div className="h-3 w-[64%] rounded skeleton" /></div>
                <p className="mt-5 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Cruzando trechos e indicadores do relatório</p>
              </section>
            )}

            {result && !isWorking && (
              <section ref={resultRef} className="animate-rise mt-10 scroll-mt-8" data-testid="section-analysis-result">
                <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
                  <div>
                    <div className="mb-2 flex items-center gap-2 text-primary"><CheckCircle2 size={16} /><span className="font-mono-ui text-[10px] font-medium uppercase tracking-[0.16em]">Análise concluída</span></div>
                    <h2 className="font-display text-4xl tracking-[-0.035em] sm:text-5xl" data-testid="heading-analysis-result">Relatório executivo</h2>
                    <p className="mt-2 text-xs text-muted-foreground" data-testid="text-result-source">Baseado em {result.source.fileName} · {formatCharacters(result.source.charactersAnalyzed)} caracteres analisados</p>
                  </div>
                  <button type="button" onClick={copyAnswer} className="focus-ring flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-bold text-foreground transition hover:border-primary hover:text-primary" data-testid="button-copy-result">
                    {copied ? <Check size={14} /> : <Clipboard size={14} />}{copied ? 'Copiado' : 'Copiar relatório'}
                  </button>
                </div>
                {saveError && <p className="mb-5 text-xs leading-5 text-destructive" role="alert" data-testid="alert-history-save-error">{saveError}</p>}
              <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
                  <article className="rounded-2xl border border-border bg-card p-6 paper-shadow sm:p-8" data-testid="card-answer">
                    <p className="mb-4 font-mono-ui text-[10px] uppercase tracking-[0.16em] text-primary">Resposta executiva</p>
                    <p className="whitespace-pre-wrap text-[15px] leading-7 text-foreground" data-testid="text-analysis-answer">{result.answer}</p>
                    <div className="mt-8 border-t border-border pt-6">
                      <p className="mb-3 font-mono-ui text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Em resumo</p>
                      <p className="font-display text-[22px] leading-7 text-foreground" data-testid="text-analysis-summary">{result.summary}</p>
                    </div>
                  </article>
                  <div className="space-y-5">
                    <article className="rounded-2xl border border-border bg-primary p-6 text-primary-foreground" data-testid="card-key-findings">
                      <p className="mb-5 font-mono-ui text-[10px] uppercase tracking-[0.16em] text-primary-foreground/65">Principais achados</p>
                      <ol className="space-y-4">
                        {result.keyFindings.map((finding, index) => <li key={`${finding}-${index}`} className="flex gap-3 text-sm leading-6" data-testid={`text-key-finding-${index}`}><span className="font-mono-ui text-xs text-accent">{String(index + 1).padStart(2, '0')}</span><span>{finding}</span></li>)}
                      </ol>
                    </article>
                    {result.anomalies.length > 0 && <article className="rounded-2xl border border-accent/40 bg-accent/[0.12] p-6" data-testid="card-anomalies">
                      <p className="mb-4 font-mono-ui text-[10px] uppercase tracking-[0.16em] text-accent-foreground">Pontos fora da curva</p>
                      <ul className="space-y-3">
                        {result.anomalies.map((anomaly, index) => <li key={`${anomaly}-${index}`} className="text-sm leading-6 text-foreground" data-testid={`text-anomaly-${index}`}>{anomaly}</li>)}
                      </ul>
                    </article>}
                    <article className="rounded-2xl border border-border bg-card p-6" data-testid="card-recommendations">
                      <p className="mb-4 font-mono-ui text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Recomendações</p>
                      <ul className="space-y-2">
                        {result.recommendations.map((recommendation, index) => <li key={`${recommendation}-${index}`} className="text-sm leading-5 text-foreground" data-testid={`text-recommendation-${index}`}>{recommendation}</li>)}
                      </ul>
                    </article>
                    <article className="rounded-2xl border border-border bg-card p-6" data-testid="card-suggested-questions">
                      <p className="mb-4 font-mono-ui text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Próximas perguntas</p>
                      <div className="space-y-1">
                        {result.suggestedQuestions.map((suggestion, index) => <button type="button" key={`${suggestion}-${index}`} onClick={() => { setQuestion(suggestion); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="focus-ring group flex w-full items-start justify-between gap-3 rounded-lg px-2 py-2.5 text-left text-sm leading-5 transition hover:bg-secondary" data-testid={`button-suggested-question-${index}`}><span>{suggestion}</span><ChevronRight size={15} className="mt-0.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></button>)}
                      </div>
                    </article>
                  </div>
                </div>
              </section>
            )}

            {!result && !isWorking && !analysis.isError && (
              <div className="animate-appear mt-8 flex items-center gap-3 text-xs text-muted-foreground" data-testid="state-empty-analysis"><div className="flex size-7 items-center justify-center rounded-full border border-border bg-card"><Sparkles size={13} className="text-primary" /></div><span>O relatório executivo aparecerá aqui depois da sua pergunta.</span></div>
            )}
            <AnalysisHistory refreshKey={historyVersion} selectedId={selectedHistoryId} onSelect={openHistoryEntry} />
          </div>
        </main>
      </div>
    </div>
  );
}