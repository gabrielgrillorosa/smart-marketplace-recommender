# M23 — Redesenho de negative sampling (soft + hard) para ranking

**Status:** SPECIFIED (a partir da [RFC](./rfc.md); próximos passos: `design.md` e `tasks.md`)  
**Data:** 2026-05-04  
**RFC canónica:** [RFC-M23-NS-001](./rfc.md)

---

## Problem Statement

O pipeline atual de treino privilegia evitar falsos negativos por meio de exclusões amplas, mas remove exemplos com alto valor de aprendizagem para ranking. Em particular, candidatos semanticamente próximos e substitutos reais (categoria/marca/fornecedor) são filtrados com agressividade, reduzindo o sinal de preferência intra-categoria.

Para recomendação em produção, o problema central não é separar itens muito diferentes, mas escolher entre alternativas semelhantes. O M23 formaliza uma estratégia estratificada que mantém hard negatives como sinal obrigatório de treino e limita exclusão a quase-duplicatas.

---

## Goals

- [ ] **G1:** Redefinir soft negatives para excluir apenas casos de equivalência real (quase-duplicata), reduzindo risco de falso negativo sem apagar diversidade útil.
- [ ] **G2:** Introduzir hard/medium/easy negatives com distribuição controlada por positivo e fallback legacy por env.
- [ ] **G3:** Tratar itens de mesma categoria + marca/fornecedor como fonte primária de hard negatives, não como exclusão automática.
- [ ] **G4:** Validar o redesenho com protocolo de ranking orientado a decisão real (NDCG/MRR/top-N/cold start + métrica intra-categoria), não apenas AUC/precision isolada.
- [ ] **G5:** Garantir rollout seguro: flags, rollback, observabilidade e comparação contra baseline no mesmo protocolo.
- [ ] **G6:** Preservar generalização quando embedding de identidade / ID tower estiver ativo, garantindo negativos intra-categoria quando disponíveis.

---

## Out of Scope

| Item | Reason |
|------|--------|
| Troca de arquitetura do MLP / dual-tower completa | M23 foca estratégia de sampling e governança de dataset. |
| Mudança de UI/frontend como requisito de entrega | Pode haver ajustes em painéis de análise, mas não é critério de aceitação do milestone. |
| Substituir milestones M21/M22 | M23 é eixo complementar de qualidade de dados de treino. |
| Promover automaticamente modelo sem gate de métricas | Fora do escopo; mantém processo de promoção controlado. |

---

## User Stories

### P1: Soft cleanup mínimo e preciso ⭐ MVP

**User Story:** Como engenheiro de IA, quero excluir apenas negativos virtualmente equivalentes ao positivo para evitar rótulo incorreto sem eliminar sinal de ranking.

**Why P1:** Sem reduzir a exclusão excessiva no início do pipeline, o restante do desenho estratificado continua operando sobre um pool empobrecido e o problema central de ranking permanece sem solução.

**Acceptance Criteria:**

1. WHEN um candidato negativo tiver equivalência estrutural com o positivo (ex.: `same product_id`, mesma família de SKU quando disponível, ou variação trivial documentada) THEN o sampler SHALL removê-lo do pool negativo.
2. WHEN a similaridade semântica do candidato exceder `SOFT_NEGATIVE_MAX_SIM` (default inicial `0.92`) THEN o sampler SHALL removê-lo do pool negativo.
3. WHEN a similaridade estiver abaixo do limiar extremo e não houver equivalência estrutural THEN o candidato SHALL permanecer elegível para estratificação hard/medium/easy.
4. WHEN metadados como família de SKU não estiverem disponíveis THEN o soft cleanup SHALL degradar graciosamente para os sinais suportados sem ampliar o escopo de exclusão.

**Independent Test:** Montar um conjunto controlado com quase-duplicatas, itens semanticamente próximos e itens apenas correlacionados; verificar que só os quase-duplicados saem do pool e que candidatos próximos, mas não equivalentes, seguem elegíveis.

**Requirements:** M23-01 — M23-05

---

### P2: Hard negatives como sinal principal de ranking

**User Story:** Como operador de recomendação, quero que o dataset force decisões difíceis entre itens semelhantes para melhorar ordenação real.

**Why P2:** O valor de negócio do ranking está em decidir entre alternativas próximas; sem priorizar hard negatives, o treino continua aprendendo sobretudo separações fáceis.

**Acceptance Criteria:**

1. WHEN `NEGATIVE_SAMPLING_MODE=legacy` THEN o sampler SHALL reproduzir a política pré-M23.
2. WHEN `NEGATIVE_SAMPLING_MODE=stratified` THEN cada positivo SHALL buscar a distribuição alvo `1 hard + 2 medium + 1 easy` com `ratio=4` e fallback determinístico quando buckets estiverem incompletos.
3. WHEN houver hard negatives elegíveis THEN o sampler SHALL priorizá-los e SHALL incluir pelo menos um hard negative por positivo.
4. WHEN não houver hard negative elegível THEN o sampler SHALL preencher a vaga hard com o candidato de maior similaridade do bucket medium.
5. WHEN um candidato compartilhar categoria com o positivo e tiver sinal adicional de proximidade (`supplierName`, marca quando disponível, ou faixa de cosine hard) THEN ele SHALL permanecer elegível/prioritário para o bucket hard, não ser excluído por regra global.
6. WHEN o benchmark for repetido com a mesma seed e configuração THEN a composição dos buckets SHALL ser reprodutível.
7. WHEN a ID tower / embedding de identidade estiver ativa THEN o dataset SHALL preservar negativos intra-categoria quando disponíveis para proteger generalização.
8. WHEN `cosine` estiver em `HARD_NEGATIVE_SIM_RANGE` (default inicial `0.70–0.92`) THEN o candidato SHALL ser bucket hard; `0.40–0.70`, medium; `<0.40`, easy.

**Independent Test:** Executar o sampler em fixtures sintéticas com combinações conhecidas de candidatos hard/medium/easy, validar a proporção escolhida, o fallback determinístico e a preservação de itens intra-categoria relevantes.

**Requirements:** M23-06 — M23-15

---

### P3: Avaliação e rollout orientados a ranking real

**User Story:** Como responsável técnico, quero validar e promover a estratégia nova só quando houver ganho consistente em ranking/cold start com risco operacional controlado.

**Why P3:** M23 muda o sinal de treino; sem protocolo de comparação consistente e rollback claro, um ganho local pode mascarar regressão operacional.

**Acceptance Criteria:**

1. WHEN executar benchmark offline THEN o protocolo SHALL reportar pelo menos `precisionAtK`, `NDCG@K`, `MRR`, `pairwise accuracy within category` (ou equivalente documentado), distribuição de score e métrica de top-N após primeira interação ou proxy documentado.
2. WHEN comparar `legacy` vs `stratified` THEN o protocolo SHALL usar o mesmo dataset, a mesma janela de avaliação e pelo menos `2` runs por configuração para controlar variância.
3. WHEN a estratégia estratificada não superar nem sustentar o baseline nos critérios mínimos acordados THEN o rollout SHALL permanecer desligado.
4. WHEN a estratégia for ativada em staging/produção THEN SHALL existir caminho explícito de rollback usando modo legacy e baseline `model/version` preservado, ou protocolo documentado de retreino legacy.

**Independent Test:** Rodar baseline legacy e M23 estratificado sob o mesmo protocolo, repetir o benchmark conforme o critério de variância e verificar que a ativação/rollback fica operacionalmente clara para o operador.

**Requirements:** M23-16 — M23-20

---

## Edge Cases

- WHEN buckets hard/medium/easy não tiverem candidatos suficientes THEN sampler SHALL completar o ratio com fallback determinístico e log explícito do desbalanceamento.
- WHEN não houver candidatos hard elegíveis THEN o sampler SHALL escolher o candidato de maior similaridade dentro do bucket medium para preencher a vaga hard.
- WHEN candidato é semanticamente muito próximo, mas não equivalente estrutural THEN política SHALL priorizar bucket hard (não excluir por padrão).
- WHEN família de SKU não estiver disponível THEN o soft cleanup SHALL degradar graciosamente para `same product_id` + limiar extremo de cosine + variações triviais documentadas.
- WHEN ID tower / embedding de identidade estiver ativo THEN ausência de negativos intra-categoria disponíveis SHALL ser reportada em telemetria/log para análise de risco de generalização.
- WHEN run apresenta alta variância entre seeds THEN decisão SHALL considerar múltiplas execuções e média/intervalo, não run única.
- WHEN online/offline divergirem de forma material THEN rollout SHALL congelar até hipótese causal documentada.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status | Statement |
| ---------------- | ----- | ----- | ------ | --------- |
| **M23-01** | P1 | Spec | Pending | O pipeline **SHALL** suportar `SOFT_NEGATIVE_MAX_SIM` configurável por env (default inicial 0.92). |
| **M23-02** | P1 | Spec | Pending | Negativos com `same product_id` do positivo **SHALL** ser removidos do pool. |
| **M23-03** | P1 | Spec | Pending | Negativos da mesma família de SKU, quando esse dado existir, **SHALL** ser removidos do pool. |
| **M23-04** | P1 | Spec | Pending | Variações triviais elegíveis para exclusão **SHALL** ser explicitamente documentadas no design/implementação. |
| **M23-05** | P1 | Spec | Pending | O soft cleanup **SHALL** ser minimalista: candidatos abaixo do limiar extremo e sem equivalência estrutural **SHALL** permanecer elegíveis; quando metadados estruturais faltarem, o fallback **SHALL** usar apenas sinais suportados. |
| **M23-06** | P2 | Spec | Pending | O sampler **SHALL** suportar `NEGATIVE_SAMPLING_MODE=legacy|stratified`. |
| **M23-07** | P2 | Spec | Pending | Em `ratio=4`, o sampler **SHALL** buscar alvo `1 hard + 2 medium + 1 easy` por positivo com fallback determinístico. |
| **M23-08** | P2 | Spec | Pending | Hard negatives **SHALL** ser amostrados com prioridade sobre medium/easy buckets. |
| **M23-09** | P2 | Spec | Pending | **At least one hard negative MUST be present per positive when available.** |
| **M23-10** | P2 | Spec | Pending | Na ausência de hard negative elegível, o sampler **SHALL** preencher a vaga com o candidato de maior similaridade do bucket medium. |
| **M23-11** | P2 | Spec | Pending | Candidatos intra-categoria com sinal adicional de proximidade (`supplierName` e/ou marca quando disponível) **SHALL NOT** ser removidos por regra global no modo estratificado. |
| **M23-12** | P2 | Spec | Pending | Faixas default de similaridade **SHALL** mapear hard (`0.70–0.92`), medium (`0.40–0.70`) e easy (`<0.40`) até calibração posterior. |
| **M23-13** | P2 | Spec | Pending | O processo **SHALL** manter seed reprodutível para comparações de benchmark. |
| **M23-14** | P2 | Spec | Pending | O sampler **SHALL** emitir telemetria mínima de composição dos buckets por época/run. |
| **M23-15** | P2 | Spec | Pending | Quando ID tower / embedding de identidade estiver ativo, o dataset **SHALL** preservar negativos intra-categoria quando disponíveis. |
| **M23-16** | P3 | Spec | Pending | Benchmark de M23 **SHALL** incluir métricas de ranking além de `precisionAtK` (mínimo: `NDCG@K`, `MRR`, `pairwise accuracy within category` ou equivalente documentado). |
| **M23-17** | P3 | Spec | Pending | A avaliação **SHALL** incluir métrica de cold start/top-N após primeira interação (ou proxy equivalente documentado). |
| **M23-18** | P3 | Spec | Pending | A comparação `legacy` vs `stratified` **SHALL** repetir cada configuração em pelo menos `2` execuções no mesmo protocolo para controlar variância. |
| **M23-19** | P3 | Spec | Pending | Rollout **SHALL** ser gated por flag e por comparação contra baseline no mesmo protocolo de validação; rollback **SHALL** usar baseline `model/version` preservado ou protocolo documentado de retreino legacy. |
| **M23-20** | P3 | Spec | Pending | Documentação operador **SHALL** cobrir ativação, rollback e leitura dos indicadores de risco/qualidade. |
| **M23-21** | Cross | Spec | Verified | O marco M23 **SHALL** referenciar a RFC canónica antes de abrir design/tasks. |
| **M23-22** | Cross | Spec | Verified | M23 **SHALL NOT** revogar automaticamente M21/M22; integra-se como melhoria de estratégia de treino. |

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 22 total (**M23-01**…**M23-22**); P1 = 5, P2 = 10, P3 = 5, Cross = 2.

---

## Success Criteria

- [ ] Com modo legacy ativo, comportamento e métricas permanecem alinhados ao baseline (sem regressão inesperada).
- [ ] Com modo estratificado ativo, há ganho consistente em pelo menos um eixo de ranking real (`NDCG@K`/`MRR`/`pairwise accuracy within category`/top-N pós-primeira interação) sem degradação crítica.
- [ ] O protocolo de comparação repete cada configuração em pelo menos `2` runs e documenta a variância observada antes de decidir promoção.
- [ ] Distribuição de scores apresenta redução de colapso em zero (ou efeito equivalente documentado).
- [ ] Quando ID tower estiver ativo, a avaliação confirma que a generalização intra-categoria não foi substituída por memorização cega.
- [ ] Operação possui playbook de ativação/rollback e evidência mínima de validação multi-run.

---

## References

- [RFC M23](./rfc.md)
- [M21 spec](../m21-ranking-evolution-committee-decisions/spec.md)
- [M21 design](../m21-ranking-evolution-committee-decisions/design.md)
- [M22 spec](../m22-hybrid-dual-item-tower-cold-start/spec.md)
- [ROADMAP](../../project/ROADMAP.md)
- [STATE](../../project/STATE.md)
