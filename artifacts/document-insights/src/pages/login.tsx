import { type FormEvent, useState } from 'react';
import { Redirect } from 'wouter';
import { AlertCircle, Library, LoaderCircle } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { isSupabaseConfigured } from '../lib/supabase';

function describeSignInError(error: unknown): string {
  const status = (error as { status?: number } | null)?.status;
  if (status === 400 || status === 401) return 'E-mail ou senha incorretos.';
  if (status !== undefined) return 'Não foi possível entrar agora. Tente novamente em instantes.';
  return 'Não foi possível conectar ao serviço de login. Verifique sua conexão e tente novamente.';
}

export default function Login() {
  const { status, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (status === 'signed-in') return <Redirect to="/" />;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !password || isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await signIn(email.trim(), password);
    } catch (error) {
      setErrorMessage(describeSignInError(error));
      setIsSubmitting(false);
    }
  };

  const isDisabled = !isSupabaseConfigured || isSubmitting || status === 'loading';

  return (
    <div className="noise flex min-h-[100dvh] items-center justify-center bg-background px-5 py-10">
      <div className="animate-rise w-full max-w-sm rounded-2xl border border-border bg-card p-7 paper-shadow sm:p-8" data-testid="section-login">
        <div className="mb-7 flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-[10px] bg-primary text-primary-foreground">
            <Library size={18} strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-[15px] font-extrabold tracking-[-0.02em]">WBM</p>
            <p className="font-display text-[18px] leading-4 text-primary">Análises</p>
          </div>
        </div>

        <h1 className="font-display text-3xl tracking-[-0.03em] text-foreground">Entrar</h1>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">Use o e-mail e a senha fornecidos para acessar suas análises.</p>

        {!isSupabaseConfigured && (
          <p className="mt-5 rounded-lg bg-destructive/8 px-3 py-2.5 text-xs leading-5 text-destructive" role="alert" data-testid="alert-login-config">
            O acesso ainda não está configurado neste ambiente. Avise o responsável pelo aplicativo.
          </p>
        )}

        <form onSubmit={submit} className="mt-6 space-y-4" aria-label="Formulário de login">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-foreground">E-mail</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isDisabled}
              className="focus-ring w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm text-foreground disabled:opacity-60"
              data-testid="input-login-email"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-foreground">Senha</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isDisabled}
              className="focus-ring w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm text-foreground disabled:opacity-60"
              data-testid="input-login-password"
            />
          </label>

          {errorMessage && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/8 px-3 py-2.5 text-xs leading-5 text-destructive" role="alert" data-testid="alert-login-error">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={isDisabled}
            className="focus-ring mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45"
            data-testid="button-login-submit"
          >
            {isSubmitting ? <><LoaderCircle size={16} className="animate-spin" /> Entrando…</> : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
