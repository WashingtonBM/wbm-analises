import type { NextFunction, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

export type SessionVerifier = (accessToken: string) => Promise<string | null>;

function bearerToken(header: string | undefined): string | null {
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

export async function verifySupabaseSession(accessToken: string): Promise<string | null> {
  const url = process.env["SUPABASE_URL"];
  const anonKey = process.env["SUPABASE_ANON_KEY"];
  if (!url || !anonKey) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set to verify sessions");
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error) {
    if (error.status === 401 || error.status === 403) return null;
    throw error;
  }
  return data.user?.id ?? null;
}

export function authorizedUserIdsFromEnv(): string[] {
  return (process.env["AUTHORIZED_SUPABASE_USER_IDS"] ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function createRequireSession(verify: SessionVerifier, allowedUserIds: () => string[]) {
  return async function requireSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    const token = bearerToken(req.headers.authorization);
    if (!token) {
      res.status(401).json({ error: "Faça login para usar esta função." });
      return;
    }

    let userId: string | null;
    try {
      userId = await verify(token);
    } catch (err) {
      req.log.error({ err }, "Session verification failed");
      res.status(503).json({ error: "Não foi possível verificar seu acesso agora. Tente novamente." });
      return;
    }

    if (!userId) {
      res.status(401).json({ error: "Sua sessão é inválida ou expirou. Entre novamente." });
      return;
    }

    const allowed = allowedUserIds();
    if (allowed.length === 0) {
      req.log.error("AUTHORIZED_SUPABASE_USER_IDS is not configured; denying access");
      res.status(503).json({ error: "O acesso ao agente ainda não está configurado." });
      return;
    }

    if (!allowed.includes(userId)) {
      res.status(403).json({ error: "Sua conta não tem permissão para usar esta função." });
      return;
    }
    next();
  };
}

export const requireSession = createRequireSession(verifySupabaseSession, authorizedUserIdsFromEnv);
