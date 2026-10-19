# WBM Análises

Agente de análise financeira para tesoureiros, com relatórios executivos, achados, anomalias e recomendações fundamentadas no material enviado.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Preferred secret: `GEMINI_API_KEY` — active Google Gemini API key; OpenAI remains a fallback when configured

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/document-insights/src/pages/home.tsx` — main WBM Análises workspace and analysis flow
- `artifacts/api-server/src/routes/analysis.ts` — validated analysis endpoint and provider call
- `lib/api-spec/openapi.yaml` — source of truth for the analysis request and response
- `artifacts/document-insights/src/index.css` — archival paper, ink, teal, and amber visual language

## Architecture decisions

- Reports are analyzed only from user-provided text and image content; the agent does not silently fetch outside data.
- The analysis response is structured into executive answer, summary, findings, anomalies, recommendations, and next questions.
- Uploaded text is read in the browser and sent only for the active analysis request; images are sent inline only for analysis; persistent document storage is not enabled yet.
- The provider credential is kept in Replit Secrets and is never logged or rendered in the UI.

## Product

- Users can upload up to 8 PDF, spreadsheet, text, or image files (18 MB combined), paste/edit source material, and ask a focused question.
- The agent returns a Portuguese executive readout with grounded findings, observed anomalies, recommendations, and suggested follow-up questions.
- The interface emphasizes confidentiality, clear business communication, loading/error states, and copyable results.

## User preferences

- The agent is named WBM Análises.
- Communication should be professional, analytical, clear, direct, and business-focused.
- Do not invent data, omit relevant information, use unauthorized external data, or expose confidential material.

## Gotchas

- Configure `GEMINI_API_KEY` for Gemini analysis; otherwise a configured OpenAI key is used. Provider errors are surfaced without exposing credentials.
- If `lib/api-spec/openapi.yaml` changes, run the API codegen command before typechecking.
- Scanned PDFs without selectable text require OCR or sending page images; persistent history and dashboards are not enabled.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
