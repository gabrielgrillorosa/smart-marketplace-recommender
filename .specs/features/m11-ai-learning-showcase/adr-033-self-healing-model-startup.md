# ADR-033: Self-Healing Model Initialization no Startup do AI Service

**Status**: Accepted
**Date**: 2026-04-27

## Context

O `ai-service` ao subir executa `versionedModelStore.loadCurrent()` — que carrega o modelo do volume `ai-model-data` se existir, ou loga `"starting untrained"` e continua sem modelo. Nesse segundo caso, qualquer chamada a `POST /recommend` retorna `ModelNotTrainedError` imediatamente, sem nenhum fallback ou auto-recuperação.

O problema é observável em dois cenários comuns:

1. **Primeiro uso:** `docker compose up` em ambiente limpo — o volume `ai-model-data` está vazio. O avaliador não sabe que precisa chamar manualmente `POST /embeddings/generate` e depois `POST /model/train` antes de usar as recomendações.
2. **Reset completo:** `docker compose down -v` seguido de `docker compose up` — mesmo cenário: serviço sobe sem modelo, recomendações falham até intervenção manual.

O Comitê de IA (4 personas, 2026-04-27) identificou que este comportamento viola o princípio de **self-healing service**: um serviço bem projetado deve recuperar seu estado operacional de forma autônoma ao detectar que está em estado degradado, sem exigir intervenção manual do operador.

Para um portfolio project onde o avaliador executa `docker compose up` e espera tudo funcionar imediatamente, a ausência de auto-recuperação é uma falha de experiência crítica — o avaliador vê `ModelNotTrainedError` sem nenhuma indicação de o que fazer.

A pré-condição para treinar é não trivial: o Neo4j precisa ter embeddings gerados (`POST /embeddings/generate`) antes de `POST /model/train`. Se o seed rodou (PostgreSQL e Neo4j têm dados) mas os embeddings estão ausentes, o `buildTrainingDataset` retorna 0 amostras e o treino falha silenciosamente.

## Decision

Implementar função `autoHealModel()` no `index.ts` do `ai-service`, chamada em background (não bloqueante) após `versionedModelStore.loadCurrent()` quando nenhum modelo for encontrado.

**Fluxo do `autoHealModel()`:**

```
1. Verificar se Neo4j tem produtos com embedding
   → Se sim: pular geração de embeddings
   → Se não: chamar embeddingService.generateEmbeddings() (idempotente)

2. Verificar se PostgreSQL tem clientes com pedidos (via API Service)
   → Se clientOrderMap vazio: logar warning e abortar (seed não rodou)
   → Se tem dados: prosseguir

3. Disparar ModelTrainer.train() em background via TrainingJobRegistry
   → Loga progresso epoch a epoch (mesmo fluxo do retrain manual)
   → Em caso de erro: loga e não crashar o processo

4. Ao concluir: modelo v1 disponível, /ready retorna 200
```

**Comportamento do `/ready`:** retorna `503` enquanto `autoHealModel()` estiver em execução — o Docker Compose já usa readiness probe para controlar `depends_on`, garantindo que o `api-service` e o `frontend` só recebam tráfego quando o ai-service estiver pronto.

**`start_period`** no healthcheck do ai-service no `docker-compose.yml` aumentado de `60s` para `180s` para cobrir: download do modelo HuggingFace (~90MB, já cacheado no volume `ai-hf-cache` em usos subsequentes) + geração de embeddings (~30s para 52 produtos) + treino (~15-20s com EPOCHS=30 BATCH=16).

**Idempotência:** `autoHealModel()` só é chamado quando `modelStore.getModel() === null` após `loadCurrent()`. Se o modelo existir, nenhuma ação é tomada — zero impacto em reinicializações normais.

## Alternatives Considered

- **Manter comportamento atual (manual)** — exige que o operador conheça a sequência `generate → train`; inaceitável para portfolio/demo onde o avaliador faz `docker compose up` e espera funcionar. Comitê rejeitou unanimemente.
- **Auto-treinar de forma síncrona no startup (bloqueando o boot)** — bloquearia o evento principal do Fastify por ~3 minutos; containers dependentes ficariam aguardando; Staff Engineer rejeitou por violar o padrão de startup rápido com readiness probe.
- **Seed script disparar o treino ao final** — acoplamento entre infraestrutura (seed) e serviço (ai-service); seed roda antes do ai-service estar healthy; race condition; Arquiteto de IA rejeitou.
- **Documentar o processo manual no README** — parcialmente feito, mas não resolve o problema de experiência; um portfolio project deve funcionar sem leitura de documentação adicional.

## Consequences

- `docker compose up` em ambiente limpo resulta em serviço totalmente operacional após ~3 minutos — sem intervenção manual.
- `/ready` retorna `503` durante a fase de auto-healing; Docker Compose healthcheck aguarda corretamente graças ao `start_period: 180s`.
- Volume `ai-hf-cache` garante que o modelo HuggingFace não é re-baixado em usos subsequentes — auto-healing em segundo `docker compose up` leva ~20s (só treino, sem download).
- `autoHealModel()` é non-fatal: qualquer erro (seed não rodou, Neo4j indisponível) é logado e o serviço continua sem modelo — mesmo comportamento atual, mas com log claro da causa.
- `start_period: 180s` no docker-compose.yml substitui o valor anterior de `60s`. Não afeta `interval` nem `retries` — apenas o tempo de carência antes do primeiro health check contar como falha.
- Impacto nos testes: `autoHealModel()` deve ser mockável via injeção de dependência ou flag de ambiente `AUTO_HEAL_MODEL=false` para testes unitários e E2E que não devem disparar treino real.
