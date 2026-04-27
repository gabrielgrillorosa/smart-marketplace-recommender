# M12 - Self-Healing Model Startup Specification

## Problem Statement

Depois do M11, o ai-service ainda depende de uma sequencia manual quando sobe sem modelo: gerar embeddings, treinar o modelo e so entao usar recomendacoes. Em um ambiente limpo (`docker compose up` pela primeira vez ou `docker compose down -v` seguido de novo `up`), isso faz o avaliador cair em `ModelNotTrainedError` e interrompe a demo. O M12 remove essa friccao com auto-recuperacao no startup, sem bloquear o boot e com prontidao correta via `/ready`.

## Goals

- [ ] Em ambiente limpo, o ai-service se recupera sozinho e fica pronto para recomendacoes sem intervencao manual.
- [ ] O startup continua nao bloqueante: o processo sobe, `/health` permanece disponivel e `/ready` so vira `200` quando o auto-healing termina.
- [ ] Reinicializacoes normais com modelo ja carregado nao disparam auto-healing.
- [ ] O comportamento pode ser desativado em testes com `AUTO_HEAL_MODEL=false`.
- [ ] O healthcheck do ai-service tem `start_period` suficiente para cobrir download do modelo, geracao de embeddings e treino.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Treino sincronico travando o boot | Rejeitado; o servico deve continuar respondendo enquanto se recupera |
| Cron diario de retreinamento | Ja pertence ao M7 |
| Model versioning / rollback | Ja pertence ao M7 |
| Seguranca/autenticacao de endpoints admin | Ja pertence ao M7 |
| Mudancas na arquitetura de treino ou nos pesos do modelo | M12 so orquestra inicializacao, nao altera a estrategia de ML |
| Sincronizacao event-driven de produtos novos | Fora do escopo deste milestone |

---

## User Stories

### P1: Auto-healing no startup limpo

**User Story**: Como avaliador ou operador, quero que o ai-service detecte a ausencia de um modelo e se recupere automaticamente em background para que eu possa usar recomendacoes imediatamente apos o boot.

**Why P1**: Este e o valor central do M12. Sem recuperacao autonoma, um `docker compose up` limpo ainda exige passos manuais de recuperacao e a demo do portifolio falha no primeiro contato.

**Acceptance Criteria**:

1. WHEN `VersionedModelStore.loadCurrent()` completes and no model is available THEN ai-service SHALL invoke `autoHealModel()` in background without blocking `fastify.listen()`.
2. WHEN auto-heal starts THEN the system SHALL verify whether Neo4j already has embeddings and SHALL call `embeddingService.generateEmbeddings()` only if embeddings are missing.
3. WHEN training data is available THEN the system SHALL enqueue the existing training job flow and SHALL log progress until the model is saved.
4. WHEN the seed did not run or the recovery flow cannot build training data THEN ai-service SHALL log a warning and SHALL keep the process alive without crashing.
5. WHEN auto-healing succeeds THEN `/recommend` SHALL work without manual calls to `POST /embeddings/generate` or `POST /model/train`.

**Independent Test**: Run `docker compose up` from a clean volume, wait for the service to become ready, and confirm that recommendations work without any manual recovery command.

---

### P1: Readiness gate during recovery

**User Story**: Como infraestrutura, quero que a readiness fique bloqueada enquanto o self-healing estiver em execucao para que os servicos dependentes so recebam trafego quando o modelo estiver utilizavel.

**Why P1**: Readiness faz parte da experiencia do usuario. Se o servico parecer saudavel cedo demais, o Docker Compose pode roteirizar trafego antes de o modelo existir e a demo ainda falha.

**Acceptance Criteria**:

1. WHEN auto-heal is running THEN `/ready` SHALL return `503`.
2. WHEN auto-heal is running THEN `/health` SHALL continue returning `200`.
3. WHEN recovery completes successfully THEN `/ready` SHALL return `200` and Docker Compose health-based dependencies SHALL unblock downstream services.
4. WHEN recovery cannot complete because there is no training data THEN `/ready` SHALL remain `503` instead of falsely reporting readiness.

**Independent Test**: Start from empty volumes, poll `/health` and `/ready`, and confirm that `/ready` stays `503` during recovery and becomes `200` only after the model is available.

---

### P2: Normal restart skips auto-heal

**User Story**: Como operador, quero que reinicializacoes com um modelo ja treinado subam normalmente sem repetir a recuperacao para que o caminho quente continue rapido e previsivel.

**Why P2**: Importante para reinicializacoes do dia a dia, mas nao necessario para provar o valor do self-healing em um boot limpo.

**Acceptance Criteria**:

1. WHEN `VersionedModelStore.loadCurrent()` loads an existing model THEN `autoHealModel()` SHALL not be invoked.
2. WHEN a valid current model exists THEN the service SHALL reach `/ready = 200` without generating embeddings or starting a new training job.
3. WHEN the same persisted model is present across restarts THEN no duplicate recovery job SHALL be enqueued.

**Independent Test**: Boot once until the model exists, stop the stack, boot again, and confirm no auto-heal logs or duplicate training jobs appear.

---

### P2: Test opt-out and compose timing

**User Story**: Como QA e CI, quero desativar o auto-healing em testes e dar tempo suficiente para o cold boot para manter os testes deterministicos e evitar falhas prematuras de health.

**Why P2**: Estes sao requisitos de suporte para a feature, nao o valor visivel para o usuario, mas sao necessarios para uma validacao automatizada confiavel.

**Acceptance Criteria**:

1. WHEN `AUTO_HEAL_MODEL=false` THEN ai-service SHALL skip `autoHealModel()` even if no model is loaded.
2. WHEN `.env.example` is inspected THEN it SHALL document `AUTO_HEAL_MODEL=` with a note that it is intended for unit and E2E tests.
3. WHEN `docker-compose.yml` is inspected THEN the ai-service healthcheck `start_period` SHALL be `180s` and the other healthcheck parameters SHALL remain unchanged.

**Independent Test**: Run the service with `AUTO_HEAL_MODEL=false`, confirm that background recovery does not start, and inspect the compose file to verify the healthcheck grace period.

---

## Edge Cases

- WHEN Neo4j already has embeddings but the model is missing THEN auto-heal SHALL skip embedding generation and train directly.
- WHEN embeddings are missing but training data exists THEN auto-heal SHALL generate embeddings first and only then train.
- WHEN the seed did not run and there are no client orders THEN auto-heal SHALL abort gracefully without crashing or retrying in a tight loop.
- WHEN auto-heal is disabled by `AUTO_HEAL_MODEL=false` THEN no background recovery job SHALL start.
- WHEN the stack restarts with an already trained model THEN no recovery logs other than normal startup SHALL appear.

---

## Requirement Traceability

Each requirement gets a unique ID for tracking across design, tasks, and validation.

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| M12-01 | P1: Auto-healing no startup limpo | Execute | Implemented |
| M12-02 | P1: Auto-healing no startup limpo | Execute | Implemented |
| M12-03 | P1: Auto-healing no startup limpo | Execute | Implemented |
| M12-04 | P1: Auto-healing no startup limpo | Execute | Implemented |
| M12-05 | P1: Auto-healing no startup limpo | Execute | Implemented |
| M12-06 | P1: Readiness gate during recovery | Execute | Implemented |
| M12-07 | P1: Readiness gate during recovery | Execute | Implemented |
| M12-08 | P2: Normal restart skips auto-heal | Execute | Implemented |
| M12-09 | P2: Normal restart skips auto-heal | Execute | Implemented |
| M12-10 | P2: Test opt-out and compose timing | Execute | Implemented |
| M12-11 | P2: Test opt-out and compose timing | Execute | Implemented |
| M12-12 | P2: Test opt-out and compose timing | Execute | Implemented |

**Coverage:** 12 total, 12 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] `docker compose up` in a clean environment reaches a usable recommendation state without any manual `generate` or `train` command.
- [ ] `/ready` stays `503` while the model is being recovered and becomes `200` only when the model is ready.
- [ ] A normal restart with a trained model does not rerun auto-healing and reaches readiness quickly.
- [ ] Tests can disable self-healing with `AUTO_HEAL_MODEL=false` and keep startup deterministic.
- [ ] The ai-service healthcheck gives the cold boot enough grace time to finish recovery without premature unhealthy events.
