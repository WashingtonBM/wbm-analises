import { after, before, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import app from "../app";

const SUPABASE_URL = "https://test-project.supabase.co";
const GEMINI_PREFIX = "https://generativelanguage.googleapis.com/";
const VALID_TOKEN = "valid-test-token";
const OTHER_TOKEN = "other-user-token";
const OWNER_ID = "00000000-0000-0000-0000-000000000001";
const OTHER_ID = "00000000-0000-0000-0000-000000000002";
const realFetch = globalThis.fetch;

const analysisBody = {
  fileName: "relatorio.txt",
  sourceType: "text",
  content: "Receita 100",
  question: "Qual o saldo?",
};

const cannedModelReport = {
  answer: "Resposta de teste",
  summary: "Resumo de teste",
  keyFindings: ["Achado de teste"],
  anomalies: [],
  recommendations: ["Recomendação de teste"],
  suggestedQuestions: ["Pergunta de teste?"],
};

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

const fetchMock = mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
  const url = requestUrl(input);
  if (url.startsWith(`${SUPABASE_URL}/auth/v1/user`)) {
    const authorization = new Headers(init?.headers).get("authorization");
    const validUserId = authorization === `Bearer ${VALID_TOKEN}` ? OWNER_ID
      : authorization === `Bearer ${OTHER_TOKEN}` ? OTHER_ID
      : null;
    if (validUserId) {
      return Response.json({
        id: validUserId,
        aud: "authenticated",
        role: "authenticated",
        email: "tesoureiro@example.com",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-01-01T00:00:00Z",
      });
    }
    return Response.json({ code: 401, error_code: "bad_jwt", msg: "invalid JWT" }, { status: 401 });
  }
  if (url.startsWith(GEMINI_PREFIX)) {
    return Response.json({
      candidates: [{ content: { parts: [{ text: JSON.stringify(cannedModelReport) }] } }],
    });
  }
  throw new Error(`Unexpected outbound request in test: ${url}`);
});

const savedEnv = {
  SUPABASE_URL: process.env["SUPABASE_URL"],
  SUPABASE_ANON_KEY: process.env["SUPABASE_ANON_KEY"],
  GEMINI_API_KEY: process.env["GEMINI_API_KEY"],
  OPENAI_API_KEY: process.env["OPENAI_API_KEY"],
  AUTHORIZED_SUPABASE_USER_IDS: process.env["AUTHORIZED_SUPABASE_USER_IDS"],
};

let server: Server;
let baseUrl: string;

function callsTo(prefix: string) {
  return fetchMock.mock.calls.filter((call) => requestUrl(call.arguments[0] as string | URL | Request).startsWith(prefix));
}

function postAnalysis(headers: Record<string, string> = {}) {
  return realFetch(`${baseUrl}/api/analysis`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(analysisBody),
  });
}

before(async () => {
  process.env["SUPABASE_URL"] = SUPABASE_URL;
  process.env["SUPABASE_ANON_KEY"] = "anon-test-key";
  process.env["GEMINI_API_KEY"] = "gemini-test-key";
  delete process.env["OPENAI_API_KEY"];
  process.env["AUTHORIZED_SUPABASE_USER_IDS"] = OWNER_ID;
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
  fetchMock.mock.restore();
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

beforeEach(() => {
  fetchMock.mock.resetCalls();
});

describe("API access", () => {
  it("keeps the health check public", async () => {
    const response = await realFetch(`${baseUrl}/api/healthz`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  });

  it("denies analysis requests that carry no session", async () => {
    const response = await postAnalysis();
    assert.equal(response.status, 401);
    assert.equal(callsTo(GEMINI_PREFIX).length, 0);
  });

  it("denies analysis requests with an invalid session token", async () => {
    const response = await postAnalysis({ Authorization: "Bearer forged-token" });
    assert.equal(response.status, 401);
    assert.equal(callsTo(GEMINI_PREFIX).length, 0);
  });

  it("leaves unlisted API paths public and returns 404", async () => {
    const response = await realFetch(`${baseUrl}/api/unlisted-route`);
    assert.equal(response.status, 404);
  });

  it("returns 403 for a valid session whose user is not authorized", async () => {
    const response = await postAnalysis({ Authorization: `Bearer ${OTHER_TOKEN}` });
    assert.equal(response.status, 403);
    assert.equal(callsTo(GEMINI_PREFIX).length, 0);
  });

  it("denies every user when the allowlist is empty", async () => {
    const previous = process.env["AUTHORIZED_SUPABASE_USER_IDS"];
    process.env["AUTHORIZED_SUPABASE_USER_IDS"] = "";
    try {
      const response = await postAnalysis({ Authorization: `Bearer ${VALID_TOKEN}` });
      assert.equal(response.status, 503);
      assert.equal(callsTo(GEMINI_PREFIX).length, 0);
    } finally {
      process.env["AUTHORIZED_SUPABASE_USER_IDS"] = previous;
    }
  });

  it("runs the analysis for a valid session", async () => {
    const response = await postAnalysis({ Authorization: `Bearer ${VALID_TOKEN}` });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { answer: string };
    assert.equal(body.answer, cannedModelReport.answer);
    assert.equal(callsTo(GEMINI_PREFIX).length, 1);
  });

  it("fails closed when session verification is not configured", async () => {
    const url = process.env["SUPABASE_URL"];
    delete process.env["SUPABASE_URL"];
    try {
      const response = await postAnalysis({ Authorization: `Bearer ${VALID_TOKEN}` });
      assert.equal(response.status, 503);
      assert.equal(callsTo(GEMINI_PREFIX).length, 0);
    } finally {
      process.env["SUPABASE_URL"] = url;
    }
  });
});
