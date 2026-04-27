# ADR-034: `/ready` Probe and Compose Startup Cycle

**Status**: Accepted
**Date**: 2026-04-27

## Context

O M12 exige que o `ai-service` permaneça vivo durante a recuperação, mas só fique pronto quando o modelo estiver utilizável. Isso pede que a probe operacional do container reflita `/ready`, não apenas liveness.

O compose atual, porém, cria um ciclo: `api-service` depende do `ai-service` saudável, enquanto o auto-healing do `ai-service` depende do `api-service` para buscar clientes, produtos e pedidos usados pelo treino. Se o healthcheck do `ai-service` continuasse representando apenas `/health`, o Docker Compose nunca enxergaria o estado "modelo pronto". Se o healthcheck mudasse para `/ready` sem ajustar as dependências, o boot poderia travar: o `ai-service` aguardaria dados do `api-service`, e o `api-service` aguardaria o `ai-service` saudável.

Há um dado arquitetural que permite resolver esse ciclo com segurança: o `api-service` já possui fallback por circuit breaker para indisponibilidade temporária do motor de IA e não precisa do `ai-service` pronto para iniciar.

## Decision

Adotar o seguinte contrato operacional no `docker-compose.yml`:

1. O healthcheck do `ai-service` passa a consultar `/ready`, não `/health`.
2. O `start_period` do `ai-service` sobe para `180s`, mantendo `interval`, `timeout` e `retries`.
3. O `api-service` deixa de depender de `ai-service: service_healthy` e passa a depender apenas de o container do `ai-service` estar iniciado (`service_started`).
4. `/health` continua sendo exclusivamente liveness; `/ready` passa a ser a fonte de verdade para "modelo utilizável".

## Alternatives considered

- **Manter healthcheck em `/health`**: evita o ciclo, mas o Compose passa a considerar o serviço saudável antes do modelo existir, o que contradiz o objetivo do M12.
- **Trocar para `/ready` sem alterar `depends_on`**: cria ciclo de startup, porque o treino do auto-heal precisa do `api-service` antes de o `ai-service` ficar pronto.
- **Mover a leitura de dados de treino para fora do `api-service`**: eliminaria a dependência cruzada, mas amplia o milestone para um refactor arquitetural do pipeline de treino.

## Consequences

- O estado "healthy" do container do `ai-service` passa a significar "recomendações utilizáveis", e não somente "processo vivo".
- O `api-service` pode subir antes de o modelo do `ai-service` ficar pronto, o que é aceitável porque já existe fallback operacional para indisponibilidade temporária da IA.
- O boot deixa de ter dependência circular entre treino e healthcheck.
- O `start_period: 180s` continua sendo a janela de tolerância oficial para cold boot com warm-up + embeddings + treino.
