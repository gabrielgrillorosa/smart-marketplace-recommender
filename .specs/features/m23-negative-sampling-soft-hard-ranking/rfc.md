# RFC M23 — Redesenho de Negative Sampling (Soft + Hard) para Ranking

## 1) Header & Metadata

- **ID:** RFC-M23-NS-001
- **Título:** Adotar negative sampling estratificado (soft + hard) para aprendizagem de ranking entre itens semelhantes
- **Status:** DRAFT (ajustes mandatórios do comitê incorporados; aprovação pendente)
- **Tipo:** Technical / Architecture
- **Impacto:** HIGH
- **Data de criação:** 2026-05-04
- **Última revisão:** 2026-05-04
- **Driver:** Comitê de Arquitetura de IA (ranking e deep learning)
- **Approvers:** Doutor em Deep Learning (ênfase em classificação), Doutor em Engenharia de IA Aplicada (ênfase em ranking), Staff AI Architect
- **Contributors:** Equipe `ai-service`, frontend de análise, operadores de experimento
- **Prazo de decisão:** A definir (proposta: 2026-05-10)
- **Milestone relacionado:** M23

---

## 2) Background

O pipeline atual de treino reduz falsos negativos de forma conservadora, mas elimina exemplos com alto valor de aprendizagem para ranking. Em especial, candidatos semanticamente próximos e substitutos reais (mesma categoria/marca/fornecedor) são frequentemente removidos, o que empobrece o sinal de preferência intra-categoria.

No problema real de recomendação, o ganho de negócio vem de aprender a escolher entre alternativas semelhantes. A política atual favorece separação de extremos (fácil), mas não maximiza aprendizado de decisão sob ambiguidade (difícil e central para ranking).

O comitê técnico convergiu que a estratégia de negative sampling deve migrar de um filtro amplo de exclusão para um desenho estratificado que:

1. exclui apenas quase-duplicatas (controle de falso negativo),
2. promove negativos difíceis como sinal obrigatório de treino,
3. mantém cobertura de médios e fáceis para estabilidade.

---

## 3) Assumptions

1. **Embeddings atuais já capturam semântica útil para estratificação por cosine.**  
   **Confiança:** Alta.  
   **Invalida se:** distribuição de cosine mostrar baixa separação por categoria/marca.

2. **`precisionAt5` isolada não representa plenamente qualidade de ranking em cold start.**  
   **Confiança:** Alta.  
   **Invalida se:** correlação forte e estável entre `precisionAt5` e métricas de top-N pós-primeira interação.

3. **Existe capacidade operacional para rodar comparação A/B offline por pelo menos duas janelas de treino.**  
   **Confiança:** Média.  
   **Invalida se:** restrições de tempo/infra impedirem repetições com controle de variância.

4. **Mesmo categoria + fornecedor tende a representar substituto competitivo, não erro de rótulo por padrão.**  
   **Confiança:** Média.  
   **Invalida se:** amostragem manual indicar alta taxa de equivalência real nesses pares.

5. **Família de SKU está disponível ou pode ser derivada para parte relevante do catálogo.**  
   **Confiança:** Média.  
   **Invalida se:** os dados não permitirem identificar famílias de SKU com consistência suficiente.

---

## 4) Decision Criteria

Critérios definidos antes das opções (peso total = 100):

1. **Ganho de ranking real (35):** melhora em `NDCG@K`, `MRR`, entrada em top-N após 1ª interação e comportamento em cold start.
2. **Controle de falso negativo (25):** manter baixo erro de rótulo sem apagar o sinal informativo.
3. **Segurança de rollout (20):** capacidade de ativação gradual, rollback simples e observabilidade.
4. **Complexidade/custo (20):** esforço de implementação e manutenção no `ai-service` + protocolos de validação.

**Must-haves:**

- Estratégia deve ter modo legacy via env para rollback.
- Deve existir faixa explícita de exclusão para quase-duplicatas.
- Hard negatives **SHALL** ser amostrados com prioridade sobre medium/easy quando disponíveis.
- **At least one hard negative MUST be present per positive when available.**

---

## 5) Options Considered

### Opção A — Manter estratégia atual (status quo / do nothing)

Manter exclusões agressivas de negativos semelhantes e regra atual de limiares.

### Opção B — Ajuste mínimo de limiar sem estratificação

Subir limiar de exclusão semântica para reduzir falsos negativos (ex.: excluir só acima de `0.92`), mas sem distribuição formal hard/medium/easy.

### Opção C — Redesenho estratificado soft + hard (proposta)

Aplicar fase de limpeza restrita (quase-duplicatas) + fase de aprendizado por dificuldade:

- Soft cleanup: excluir apenas equivalências reais (`same product_id`, mesma família de SKU quando disponível, variações triviais documentadas, `cosine > 0.92` ou limiar documentado e justificável).
- Hard: mesma categoria/fornecedor/marca ou `0.70 <= cosine <= 0.92`.
- Medium: categoria relacionada ou `0.40 <= cosine < 0.70`.
- Easy: categoria distante e `cosine < 0.40`.
- Distribuição por positivo (`ratio=4`): `1 hard + 2 medium + 1 easy`.
- Hard negatives **SHALL** ser amostrados com prioridade sobre outros buckets.
- **At least one hard negative MUST be present per positive when available.**
- Na ausência de hard negatives, o sampler **SHALL** preencher a vaga com o candidato de maior similaridade dentro do bucket medium.

---

## 6) Relevant Data

- Evidência qualitativa recente indica queda de sinal neural em cenários com supressão excessiva de semelhantes.
- Histórico do projeto mostra sensibilidade a desenho de negativos (`ADR-031`, `ADR-032`) e melhora ao tratar contaminação de falso negativo.
- Meta de M23 é atacar o mesmo eixo com desenho mais explícito de dificuldade para ranking.
- O roadmap recente do projeto já introduz embedding opcional de identidade por `product_id` em M22; M23 precisa preservar generalização sem favorecer memorização cega.

### Guardrails obrigatórios de desenho

- Soft cleanup **SHALL** excluir apenas:
  - `same product_id`;
  - mesma família de SKU, quando disponível;
  - variações triviais explicitamente documentadas;
  - similaridade semântica extrema (`cosine > 0.92` ou limiar documentado e justificável).
- Hard negatives **SHALL** ser amostrados com prioridade sobre medium/easy.
- **At least one hard negative MUST be present per positive when available.**
- Quando não houver hard negatives disponíveis, o sampler **SHALL** selecionar o candidato de maior similaridade dentro do bucket medium.
- Quando embedding de identidade / ID tower estiver ativo, o dataset **SHALL** preservar negativos intra-categoria quando disponíveis, para evitar colapso em memorização e proteger generalização.

### Métricas obrigatórias de validação

- A avaliação **MUST** incluir pelo menos uma métrica explícita de ordenação entre itens semelhantes, preferencialmente `pairwise accuracy within category` ou equivalente documentado.
- A avaliação **SHALL** continuar reportando `NDCG@K`, `MRR`, métricas de entrada em top-N após primeira interação e distribuição de scores.

---

## 7) Pros and Cons

### Opção A — Status quo

**Prós**

- Menor esforço imediato.
- Métricas tradicionais podem permanecer estáveis no curto prazo.

**Contras**

- Mantém perda de sinal em decisões intra-categoria.
- Não resolve colapso de score em itens semanticamente próximos.
- Piora capacidade de cold start com poucas interações.

### Opção B — Ajuste mínimo de limiar

**Prós**

- Mudança pequena e de baixo risco operacional.
- Reduz remoção indevida de pares úteis.

**Contras**

- Sem estratificação formal, aprendizado segue subótimo para ranking.
- Dificuldade de governar proporção de exemplos informativos.

### Opção C — Estratificação soft + hard

**Prós**

- Alinha treino ao problema real de ranking (escolha entre semelhantes).
- Preserva controle de falso negativo em faixa estrita.
- Permite governança clara por buckets e ratio.

**Contras**

- Maior complexidade de implementação e validação.
- Pode haver queda inicial em AUC até recalibração.
- Requer monitoramento mais rico que `precisionAt5`.

---

## 8) Estimated Cost

- **Opção A:** ~0.5 dia (documentação/monitoramento mínimo).
- **Opção B:** ~1-2 dias (ajuste de threshold + testes básicos).
- **Opção C:** ~4-7 dias úteis (pipeline de sampling, testes, validação offline repetida, documentação operacional e rollout controlado).

Estimativa Opção C por macro-etapas:

1. Refatorar sampler e buckets (2-3 dias).
2. Testes unitários + integração de treino (1-2 dias).
3. Protocolo de benchmark e análise de métricas (1-2 dias).

---

## 9) Recommended Option

**Recomendação:** **Opção C — Redesenho estratificado soft + hard**.

Justificativa ligada aos critérios:

- **Ganho de ranking real (35):** melhor cobertura de casos difíceis.
- **Controle de falso negativo (25):** exclusão restrita para quase-duplicatas.
- **Segurança de rollout (20):** pode ser gated por env e executado em fases.
- **Complexidade/custo (20):** maior custo, porém proporcional ao impacto esperado no núcleo de ranking.

Condição de aprovação:

- Implementação com feature flag e fallback legacy.
- Avaliação com métricas de ranking e cold start, não apenas AUC.
- Inclusão explícita de métrica intra-categoria (`pairwise accuracy within category` ou equivalente).
- Guardrail para ID tower / embedding de identidade quando ativo.

---

## 10) Action Items

1. **Specify:** refinar/confirmar o `spec.md` do M23 com requisitos rastreáveis (`M23-01...`), incluindo critérios explícitos de exclusão (`product_id`, família SKU, `cosine > 0.92`), buckets hard/medium/easy, fallback e guardrails da ID tower.
2. **Design:** detalhar arquitetura de sampling e pontos de integração com `training-utils` / `ModelTrainer`, incluindo prioridade normativa de hard negatives.
3. **Tasks:** quebrar em tarefas atômicas com gate final de build, benchmark offline e telemetria mínima dos buckets.
4. **Validation:** executar 2+ runs por configuração (controle de variância), comparar com baseline legacy e medir `pairwise accuracy within category` (ou equivalente).
5. **Rollout:** ativar em staging com flags; promover somente com ganhos consistentes nas métricas alvo e rollback explícito.

---

## 11) Outcome

**Pendente de decisão em comitê.**

- Decisão final: `APPROVED | REJECTED | NEEDS_REVISION`
- Data:
- Observações: ajustes mandatórios do parecer técnico incorporados; aguarda deliberação final do comitê.
- Follow-up (TDD/spec/tasks): `spec.md` criado; pendentes `design.md` e `tasks.md`.

---

## Resources

- [M21 spec](../m21-ranking-evolution-committee-decisions/spec.md)
- [M21 design](../m21-ranking-evolution-committee-decisions/design.md)
- [M22 spec](../m22-hybrid-dual-item-tower-cold-start/spec.md)
- [M23 spec](./spec.md)
- [ROADMAP](../../project/ROADMAP.md)
- [STATE](../../project/STATE.md)
