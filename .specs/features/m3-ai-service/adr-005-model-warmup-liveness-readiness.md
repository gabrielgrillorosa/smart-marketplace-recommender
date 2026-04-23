# ADR-005: Model Warm-up no Startup e Separação de Liveness/Readiness

**Status**: Accepted
**Date**: 2026-04-23

## Context

`@xenova/transformers` (HuggingFace Transformers.js) baixa o modelo `all-MiniLM-L6-v2` (~90MB) na primeira invocação de `.embedQuery()`. Se esse download ocorrer no primeiro request de busca semântica em produção, a latência é de 30-60s — causando timeout no cliente. O Staff Engineering identificou isso como High severity. Paralelamente, o QA Staff identificou que a spec não diferencia liveness (servidor HTTP está up) de readiness (modelo está carregado e pronto para servir tráfego). Um container com o servidor HTTP respondendo mas o modelo ainda sendo baixado seria marcado como `healthy` pelo Docker e receberia tráfego prematuramente. As duas issues convergem na mesma solução: warm-up no startup + dois endpoints distintos.

## Decision

1. `EmbeddingService.init()` é chamado no startup do `index.ts` **antes** de `fastify.listen()`, forçando o download e inicialização do modelo. Uma flag `modelReady: boolean` é setada para `true` após a conclusão.
2. Dois endpoints distintos:
   - `GET /health` — liveness: retorna `{ status: "ok", service: "ai-service" }` HTTP 200 assim que o servidor Fastify está up, independentemente do estado do modelo. Usado pelo Docker Compose healthcheck (M3-05, M3-36).
   - `GET /ready` — readiness: retorna `{ ready: true }` HTTP 200 quando `modelReady === true`, ou `{ ready: false, message: "Model loading" }` HTTP 503 enquanto carrega. Usado pelo api-service antes de rotear recomendações.
3. Endpoints que dependem do modelo (`/api/v1/search/semantic`, `/api/v1/rag/query`) verificam `embeddingService.isReady` e retornam HTTP 503 com `"Model loading. Retry in a few seconds."` se o modelo ainda não estiver pronto.

## Alternatives considered

- **Lazy-load no primeiro request**: Descartado. Latência de 30-60s no primeiro request de busca é inaceitável; timeouts em cascata em clientes sem retry configurado.
- **Endpoint único `/health` com estado do modelo incluído**: Descartado. Docker Compose interpreta qualquer 200 como healthy — misturar liveness e readiness no mesmo endpoint causa roteamento de tráfego para containers não-ready.
- **Thread separada para warm-up (não-bloqueante)**: Descartado. `fastify.listen()` seria chamado antes do modelo estar pronto, criando uma janela onde o container está `healthy` mas não pode servir tráfego — exatamente o problema que a separação liveness/readiness resolve.

## Consequences

- Startup do container é mais lento na primeira execução (download do modelo). Na segunda execução, o modelo está em cache no disco e o warm-up é apenas a inicialização do pipeline (~2-5s).
- O Docker Compose healthcheck continua usando `/health` (liveness) — o container é marcado como `healthy` assim que o servidor HTTP sobe, mas o `api-service` deve aguardar `/ready` antes de fazer chamadas de recomendação.
- Volume mount para cache do modelo (`~/.cache/huggingface` ou `./model-cache`) é recomendado no `docker-compose.yml` para evitar re-download a cada `docker compose down && up`. Documentado como melhoria de DX para M6.
- Risco remanescente: se o download do modelo falhar (sem internet, CDN offline), o processo encerra com erro antes de aceitar health checks. Comportamento correto para MVP — sem modelo, o serviço não tem utilidade.
