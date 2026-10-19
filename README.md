# WBM Análises

Aplicação de análise financeira que transforma relatórios e dados enviados pelo usuário em uma leitura executiva, com principais achados, anomalias, recomendações e perguntas para investigação.

O usuário pode enviar um ou mais arquivos, fazer uma pergunta específica e receber uma análise fundamentada no material fornecido.

## Funcionalidades

- Upload de até **8 arquivos** por análise, com limite combinado de **18 MB** e limite de **10 MB por arquivo**.
- Formatos aceitos:
  - PDF com texto selecionável;
  - XLS e XLSX;
  - CSV e TSV;
  - TXT, MD e JSON;
  - imagens PNG, JPG, JPEG e WEBP.
- Extração de texto de PDFs digitais e planilhas no navegador.
- Análise visual de imagens pelo provedor de IA configurado.
- Relatório estruturado com resposta executiva, resumo, achados, anomalias, recomendações e perguntas sugeridas.
- Edição do texto extraído e cópia do relatório.

> PDFs digitalizados sem camada de texto podem não ser lidos. Para esses casos, envie a página como imagem ou use uma planilha/texto extraído.

## Tecnologias

- React, TypeScript e Vite no frontend.
- Express 5 e TypeScript na API.
- pnpm workspaces.
- TanStack Query para chamadas da API.
- OpenAPI, Orval e Zod para o contrato e os tipos compartilhados.
- PDF.js para leitura de PDFs e SheetJS (`xlsx`) para planilhas.
- Gemini como provedor de IA preferencial; OpenAI pode ser usado como alternativa configurada.

## Executar no Replit

O projeto está dividido em dois artifacts: a interface web e a API. Abra o workspace no Replit e use o Preview; os workflows configurados iniciam os serviços e encaminham as chamadas `/api` para o backend.

Para configurar a análise, adicione a chave no **Secrets** do Replit:

- `GEMINI_API_KEY` — provedor preferencial.
- `OPENAI_API_KEY` — alternativa, usada quando a chave Gemini não está configurada.

Não coloque chaves de API no código, no README ou em arquivos versionados.

## Instalação e validação

Requer Node.js 24 e pnpm.

```bash
pnpm install
pnpm run typecheck
pnpm run build
```

Para iniciar os serviços localmente, execute cada comando em um terminal separado:

```bash
PORT=8080 pnpm --filter @workspace/api-server run dev
```

```bash
PORT=21883 BASE_PATH=/ pnpm --filter @workspace/document-insights run dev
```

Fora do Replit, configure um proxy para encaminhar as requisições `/api` à API na porta `8080`.

## Estrutura do projeto

```text
artifacts/
  api-server/          API Express e endpoint de análise
  document-insights/   Interface React/Vite
lib/
  api-spec/            Especificação OpenAPI
  api-client-react/    Cliente React gerado
  api-zod/             Schemas Zod gerados
  db/                  Configuração e schema do banco
```

## API

O endpoint principal é `POST /api/analysis`. A especificação da requisição e da resposta fica em `lib/api-spec/openapi.yaml`. Após alterar essa especificação, regenere os tipos e hooks:

```bash
pnpm --filter @workspace/api-spec run codegen
```

## Privacidade e limites

Os arquivos são processados para a solicitação ativa e não ficam salvos como histórico pelo aplicativo. O conteúdo enviado é encaminhado ao provedor de IA configurado para gerar a análise; consulte os termos desse provedor para informações sobre processamento e retenção.

O WBM Análises é uma ferramenta de apoio à leitura de dados, não substitui a revisão contábil, financeira ou profissional dos resultados.
