# ADR-067: Retreino só manual, métricas completas no backend e showcase «Pos-Retreino» vs «Com IA»

**Status:** Accepted  
**Data:** 2026-05-01  
**Milestone:** **M20** — artefactos: [spec.md](./spec.md), [tasks.md](./tasks.md)  
**Contexto:** `smart-marketplace-recommender` — `ai-service`, `api-service`, frontend (`AnalysisPanel`, `ModelStatusPanel`), marcos M13/M19/**M20**.

## Contexto

O fluxo actual faz **sync Neo4j** + **enqueue de treino** em `POST /api/v1/orders/:orderId/sync-and-train` ([`orders.ts`](../../../ai-service/src/routes/orders.ts)), com o checkout a devolver `expectedTrainingTriggered: true` quando há itens. Para demos pedagógicas e para **acumular compras** antes de um retreino com massa crítica mínima, o treino a **cada** checkout produz gradientes ruidosos e sobrecarga operacional sem ganho claro.

Paralelamente, o **M19 / ADR-065** fixou o baseline de **«Pos-Efetivar»** como o ranking **cart-aware pré-checkout** vs o ranking após promoção do modelo. Na narrativa «demo sem ênfase no carrinho», o utilizador quer comparar **modelo antigo vs modelo novo após retreino**, não necessariamente **carrinho vs pós-checkout**.

O painel **`ModelStatusPanel`** esconde o retreino manual e métricas sob **«Modo avançado / diagnóstico»**, embora o caminho manual deva ser o **primário** quando o automaticismo do checkout for desligado.

## Decisão

1. **Treino:** O **checkout** SHALL apenas **sincronizar** relações `BOUGHT` (e dados necessários) para Neo4j; **não** SHALL enfileirar `TrainingJobRegistry.enqueue` por defeito. O retreino profundo SHALL ser disparado pelo **botão existente** (`POST /api/v1/model/train` via proxy), com política de segurança (`X-Admin-Key`) inalterada.
2. **Contrato API checkout:** `expectedTrainingTriggered` SHALL ser **`false`** quando o enqueue automático estiver desligado, para o frontend **não** entrar em estado de polling «aprendendo com pedido» só por causa do checkout.
3. **Configuração:** Expor **feature flags** documentadas (ex.: `CHECKOUT_ENQUEUE_TRAINING`, `ENABLE_DAILY_TRAIN` ou equivalente) para **cron diário** e **checkout** independentemente; valores por defeito alinhados a «demo só manual» até decisão operacional contrária.
4. **Métricas de treino:** O backend SHALL devolver **métricas completas** do ciclo de treino da rede (pelo menos as já calculadas em `ModelTrainer` — loss/accuracy finais, amostras, `precisionAt5`, duração, `syncedAt`, épocas configuradas vs efectivas se early stopping — e extensões acordadas como parâmetros do modelo, versão de artefacto) nos **resultados do job** e/ou **`GET /model/status`**, para o painel e auditoria.
5. **Showcase:** Renomear o conceito de UI **«Pos-Efetivar»** para **«Pos-Retreino»** onde fizer sentido. O **delta** dessa coluna SHALL usar **`buildRecommendationDeltaMap(previous, current)`** com **`previous` = snapshot «Com IA»** (ranking com o modelo **antes** da promoção) e **`current` = snapshot após promoção** (`captureRetrained`). A coluna **«Com Carrinho»** pode permanecer para fluxos com carrinho ou ser **opcional/oculta** por modo de demo — sem obrigar baseline cart-aware para Pos-Retreino.
6. **«Reiniciar» (produto):** Acção que **promove** o estado do showcase: **«Com IA»** passa a reflectir o ranking **«Pos-Retreino»** (novo normal), limpando comparação transitória; o catálogo recomenda com o **modelo já activo** no processo (sem exigir novo deploy). **Implementação UI:** rótulo **«Fixar novo normal»** (ver [ADR-069](./adr-069-reiniciar-vs-limpar-showcase-copy.md)) para não colidir com «Limpar showcase».
7. **Supersedência narrativa:** Esta decisão **refina** o produto do **ADR-065** para cenários «baseline = modelo anterior» em vez de «baseline = carrinho pré-checkout» quando o modo **Pos-Retreino** estiver activo; o ADR-065 mantém-se válido para o modo cart-aware histórico e para compatibilidade de testes até migração explícita.

## Opções consideradas (descartadas)

| Opção | Por que não |
|-------|-------------|
| Manter enqueue em cada checkout | Ruído de treino com poucas amostras novas; custo e UX de «sempre treinando». |
| Baseline Pos-Retreino = «Sem IA» | O utilizador pediu comparar **modelo antigo vs novo**, não shuffle sem rede. |
| Um único endpoint sem renomear | `sync-and-train` sem train viola o nome; preferível endpoint/sync-only ou flag clara (implementação em tarefas). |

## Consequências

- **Positivas:** Controlo pedagógico do momento do retreino; batches maiores entre corridas; deltas alinhados à pergunta «o que mudou o modelo?»; métricas visíveis para calibrar decisões.
- **Negativas:** É necessário **actualizar** E2E (`m13-cart-async-retrain.spec.ts`), specs M13/M19/M20 e copy do `ModelStatusPanel` que hoje assume checkout→treino. Utilizadores habituados ao fluxo antigo precisam de **disciplina** para clicar em retreinar após acumular dados.
- **Risco:** Treino manual sem dados novos suficientes — mitigar com mensagens a partir de `probeTrainingDataAvailability` / resultado do job.

## Ligações

- [ADR-065 — Baseline cart-aware Pos-Efetivar](../m19-pos-efetivar-showcase-deltas/adr-065-post-checkout-column-deltas-baseline.md) — modo histórico / cart-aware.
- [ADR-045 — Polling e captura pós-checkout](../m13-cart-checkout-async-retrain/adr-045-current-version-polling-for-post-checkout-capture.md)
- [ADR-012 — Training job registry](../m7-production-readiness/adr-012-training-job-registry.md)
- [ADR-013 — Versioned model store](../m7-production-readiness/adr-013-versioned-model-store.md)

## Artefactos de follow-up

- **Planeado:** [spec.md](./spec.md) (requisitos **PR-067-01**…), [design.md](./design.md) (UI complexo), [ADR-068](./adr-068-post-retrain-baseline-snapshot-in-analysis-slice.md), [ADR-069](./adr-069-reiniciar-vs-limpar-showcase-copy.md), e [tasks.md](./tasks.md) (**T067-1**…**T067-7**). Atalhos históricos em M19: [spec-adr067.md](../m19-pos-efetivar-showcase-deltas/spec-adr067.md), [tasks-adr067.md](../m19-pos-efetivar-showcase-deltas/tasks-adr067.md).
- O [spec M19](../m19-pos-efetivar-showcase-deltas/spec.md) permanece registo da entrega **ADR-065/066**; **M20** / ADR-067 estende-se nos artefactos acima até fecho **IMPLEMENTED**.
- Actualização de [STATE.md](../../project/STATE.md) e [ROADMAP.md](../../project/ROADMAP.md) na tarefa **T067-7**.
