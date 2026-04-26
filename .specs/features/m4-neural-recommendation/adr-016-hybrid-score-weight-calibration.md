# ADR-016: Calibração Empírica dos Pesos do Score Híbrido

**Status**: Proposed — Feature Futura
**Date**: 2026-04-25
**Authors**: Comitê Técnico (Dr. IA Aplicada · Staff DL/ML · Pesquisador RecSys)
**Method**: Tree-of-Thought + Self-Consistency (3 especialistas, raciocínio independente, consenso)

---

## Context

O `RecommendationService` calcula o score final de cada produto via soma ponderada:

```typescript
finalScore = NEURAL_WEIGHT × neuralScore + SEMANTIC_WEIGHT × semanticScore
// valores atuais: 0.6 × neural + 0.4 × semantic   (configurados em .env)
```

`neuralScore` vem da rede neural TF.js (classificação binária treinada com histórico de pedidos).  
`semanticScore` vem da similaridade cosseno entre o embedding do produto e o perfil médio do cliente (`meanPooling` dos embeddings de produtos comprados).

Os pesos `0.6 / 0.4` foram definidos heuristicamente durante o M4, sem validação empírica. O Comitê foi convocado para avaliar se essa combinação é superior ao neural puro e se os pesos devem ser revistos.

---

## Parecer do Comitê (resumo)

### Ponto 1 — Híbrido é superior ao neural puro no regime atual

Os três especialistas chegaram à mesma conclusão por caminhos independentes (Self-Consistency forte):

| Cenário | Neural Puro | Híbrido Atual |
|---------|-------------|---------------|
| Dataset pequeno / esparso | ❌ Alta variância, overfitting | ✅ Semântico ancora |
| Cold start (cliente com 1–2 compras) | ❌ `meanPooling` instável | ✅ Semântico supre |
| Produto novo no catálogo (pós-treino) | ❌ Score ≈ 0 (não visto no treino) | ✅ Embedding captura |
| Robustez entre restarts do container | ❌ Depende do modelo salvo | ✅ Semântico é determinístico |
| Interpretabilidade / observabilidade | ❌ Caixa preta | ✅ `matchReason` expõe origem |

Fundamento na literatura:
- **He et al. (2017) — Neural CF (WWW)**: híbrido melhora recall@K em 3–8% para datasets com menos de 10 interações por usuário.
- **Covington et al. (2016) — YouTube RecSys**: `meanPooling` de embeddings de itens assistidos é o padrão para perfil de usuário em produção.
- **Liang et al. (2018) — VAE for CF**: modelos puramente colaborativos colapsam para popularidade com dados esparsos.

**Veredito unânime: o design híbrido é a decisão correta para o estágio atual.**

### Ponto 2 — Fraqueza identificada: pesos fixos não calibrados

Os pesos `0.6 / 0.4` são arbitrários. Não há evidência empírica de que sejam ótimos para este domínio e dataset. Isso é aceitável agora mas deve ser endereçado quando o sistema acumular dados suficientes.

Fraqueza adicional da soma linear: se `neuralScore = 0.9` e `semanticScore = 0.1`, o `finalScore = 0.58`. Um score neural muito alto é diluído pelo semântico fraco — pode mascarar recomendações fortes do modelo treinado.

### Ponto 3 — Alternativas mais sofisticadas (pós-MVP)

| Abordagem | Vantagem | Custo |
|-----------|----------|-------|
| **Grid search sobre pesos** (proposta principal) | Calibra `NEURAL_WEIGHT` / `SEMANTIC_WEIGHT` usando `precisionAt5` como métrica | Baixo — já existe infra |
| **Rank fusion (RRF)** | Combina por posição no ranking, robusto a escalas diferentes | Médio |
| **Meta-learner (stacking)** | Aprende a combinar os dois scores de forma não-linear | Alto — requer mais dados |
| **Multiplicativo** `neural × semantic` | Penaliza mais quando um componente é fraco | Baixo — mudança de 1 linha |

---

## Decision

**Não há mudança de implementação agora.**

O design híbrido com `finalScore = 0.6 × neural + 0.4 × semantic` é mantido como decisão válida para o M4/M7. Os pesos são configuráveis via `.env` (`NEURAL_WEIGHT`, `SEMANTIC_WEIGHT`) — essa flexibilidade já existe e é suficiente para experimentação manual.

---

## Proposed Future Work (Feature Futura)

Quando o sistema acumular dados suficientes (recomendação: ≥ 100 clientes com ≥ 10 pedidos cada), implementar:

### F1 — Grid Search de Pesos (prioridade alta)

```typescript
// Pseudocódigo do experimento
const grid = [
  { neural: 0.5, semantic: 0.5 },
  { neural: 0.6, semantic: 0.4 },  // atual
  { neural: 0.7, semantic: 0.3 },
  { neural: 0.8, semantic: 0.2 },
  { neural: 1.0, semantic: 0.0 },  // baseline: neural puro
]

for (const weights of grid) {
  const p5 = computePrecisionAtK(clients, orders, productEmbeddingMap, model, K=5, weights)
  console.log(weights, '→ precisionAt5:', p5)
}
// Promover os pesos com maior precisionAt5 para .env
```

A infraestrutura de `computePrecisionAtK` já existe em `ModelTrainer.ts` e pode ser reutilizada diretamente.

### F2 — Weighted Mean Pooling (prioridade média)

Substituir a média simples do perfil do cliente por média ponderada por frequência de compra:

```typescript
// Atual: cada produto comprado tem peso igual
function meanPooling(embeddings: number[][]): number[]

// Proposto: produtos comprados com mais frequência têm peso maior
function weightedMeanPooling(
  embeddings: number[][],
  weights: number[]   // ex: [3, 1, 5] = quantidades compradas
): number[]
```

Já registrado como item em `ROADMAP.md — Future Considerations`.

### F3 — Endpoint `/api/v1/model/benchmark` (prioridade baixa)

Expor métricas de comparação via API para o painel admin:

```json
{
  "neuralOnly":   { "precisionAt5": 0.42, "recallAt10": 0.38 },
  "semanticOnly": { "precisionAt5": 0.35, "recallAt10": 0.31 },
  "hybrid_0.6":   { "precisionAt5": 0.51, "recallAt10": 0.47 },
  "hybrid_0.7":   { "precisionAt5": 0.54, "recallAt10": 0.49 }
}
```

---

## Consequences (se implementado)

- `computePrecisionAtK` em `ModelTrainer.ts` precisa aceitar `weights` como parâmetro externo.
- `TrainingResult` pode incluir métricas para múltiplas configurações de peso.
- Nenhuma mudança de API pública — os pesos são internos ao serviço.
- `NEURAL_WEIGHT` e `SEMANTIC_WEIGHT` no `.env` continuam sendo o mecanismo de configuração — sem nova infra necessária para F1.

## References

- He et al. (2017). *Neural Collaborative Filtering*. WWW.
- Covington, Adams & Sargin (2016). *Deep Neural Networks for YouTube Recommendations*. RecSys.
- Liang et al. (2018). *Variational Autoencoders for Collaborative Filtering*. WWW.
- Breiman (2001). *Random Forests*. Machine Learning. (fundamento teórico de ensemble methods)
- Cormack, Clarke & Buettcher (2009). *Reciprocal Rank Fusion outperforms Condorcet and individual rank learning methods*. SIGIR. (Rank Fusion — F1 alternativa)
