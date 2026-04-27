# ADR-032: Exclusão de Soft Negatives por Similaridade Coseno (ANCE Simplificado)

**Status**: Accepted
**Date**: 2026-04-27

## Context

O ADR-031 introduziu exclusão de soft negatives por (categoria + supplierName), resolvendo o caso mais severo de False Negative Contamination (queda de 64% → 32% no Knorr Pasta Sauce após compras demo food/Unilever). Porém, a exclusão por heurística determinística de marca não cobre produtos de outros suppliers na mesma categoria que sejam semanticamente próximos no espaço de embedding.

Exemplo concreto: após ADR-031, o Nestlé Condensed Milk (food/Nestlé) e o Maggi Cream of Mushroom Soup (food/Nestlé) continuam elegíveis como negativos quando o cliente comprou produtos food/Unilever. Como o modelo `sentence-transformers/all-MiniLM-L6-v2` agrupa produtos por similaridade semântica de descrição (não por supplier), produtos food/Nestlé têm embeddings próximos de produtos food/Unilever — especialmente itens culinários como caldos, molhos e sopas. Esses produtos ainda recebem gradiente negativo amplificado pelo `classWeight: {0:1.0, 1:4.0}`, causando penalização residual de ~5–15 pontos de score pós-retreino.

O Comitê de IA (4 personas, 2026-04-27) debateu a questão e identificou que a solução matematicamente correta para False Negative Contamination é exclusão por proximidade no espaço de embedding — formalmente equivalente ao que o **ANCE (Approximate Nearest Neighbor Negative Contrastive Estimation)** realiza com índice ANN. Com 52 produtos e embeddings já em memória no `productEmbeddingMap`, o custo é O(n × p) onde n=produtos e p=positivos do cliente — trivial, sem necessidade de índice aproximado.

O Arquiteto de IA consolidou: os dois filtros são **aditivos e complementares**. ADR-031 cobre a heurística determinística (mesma marca + categoria, zero hiperparâmetro). ADR-032 cobre a exclusão semântica (qualquer produto próximo no espaço latente, independente de supplier). Um produto só entra no `negativePool` se passar em ambos os filtros.

## Decision

Adicionar exclusão de soft negatives por **similaridade coseno** ao `buildTrainingDataset`. Para cada candidato negativo, calcular a similaridade coseno máxima com todos os positivos do cliente. Se `maxCosineSimilarity > SOFT_NEGATIVE_SIM_THRESHOLD`, o produto é excluído do pool — tratado como "desconhecido", não como negativo explícito.

O threshold `SOFT_NEGATIVE_SIM_THRESHOLD` é lido do ambiente via `process.env.SOFT_NEGATIVE_SIM_THRESHOLD`, com default `0.65`. Valor configurável para permitir ajuste sem mudança de código e para demonstrar pedagogicamente que hiperparâmetros de qualidade de dados têm impacto equivalente a hiperparâmetros de modelo.

O filtro de similaridade é aplicado **após** o filtro ADR-031 (categoria + supplier) — os dois são aditivos:

```typescript
// ADR-031: exclusão determinística por (categoria + supplier)
const softPositiveIdsByBrand = new Set(/* ... ADR-031 logic ... */)

// ADR-032: exclusão por similaridade coseno
const threshold = parseFloat(process.env.SOFT_NEGATIVE_SIM_THRESHOLD ?? '0.65')
const candidatesAfterBrandFilter = productsWithEmbeddings.filter(
  p => !purchasedIds.has(p.id) && !softPositiveIdsByBrand.has(p.id)
)
const softPositiveIdsBySimilarity = new Set(
  candidatesAfterBrandFilter
    .filter(p => {
      const pEmb = productEmbeddingMap.get(p.id)!
      return positiveProducts.some(pos => {
        const posEmb = productEmbeddingMap.get(pos.id)!
        return cosineSimilarity(pEmb, posEmb) > threshold
      })
    })
    .map(p => p.id)
)

const negativePool = candidatesAfterBrandFilter.filter(
  p => !softPositiveIdsBySimilarity.has(p.id)
)
```

`cosineSimilarity` implementada como função pura local — sem dependência externa.

## Alternatives Considered

- **Threshold fixo hardcoded (0.65 ou 0.7)** — simples mas sem flexibilidade para calibração; descartado pois o threshold ideal depende do modelo de embedding usado e da distribuição do dataset. Arquiteto de IA recomendou env var.
- **Exclusão apenas por categoria (sem cosine)** — heurística grosseira; produtos de categorias distintas com descrições semelhantes seriam incorretamente incluídos; Prof. DL rejeitou por ser menos preciso que o cosine.
- **ANCE completo com índice ANN** — correto em produção com milhares de produtos; over-engineering para 52 produtos; Staff Engineer rejeitou por desproporcionalidade de escopo.
- **Soft labels (label=0.2 para produtos próximos ao invés de exclusão)** — alternativa válida mas incompatível com `classWeight` do TF.js sem implementação custom de loss; descartado por complexidade.
- **Substituir ADR-031 por ADR-032** — os dois filtros são complementares; ADR-031 é O(1) por produto (lookup em Set) e zero hiperparâmetro — mantê-lo como primeiro filtro é mais eficiente e mais determinístico; não há motivo para substituir.

## Consequences

- Produtos semanticamente próximos dos positivos (ex: food/Nestlé após compras food/Unilever) deixam de receber gradiente negativo — penalização residual eliminada.
- `negativePool` reduz adicionalmente. Com threshold=0.65 e dataset de 52 produtos com categorias bem separadas semanticamente (`food`, `cleaning`, `beverages`, `personal_care`, `snacks`), a redução estimada é ~3-8 produtos por cliente. `negativeSamplingRatio: 4` existente compensa via hard negative mining.
- `SOFT_NEGATIVE_SIM_THRESHOLD` como env var permite demonstrar em aula o impacto de diferentes thresholds: 0.5 (agressivo — exclui muito), 0.65 (default — balanceado), 0.8 (conservador — exclui pouco).
- Custo computacional O(n × p) por cliente — com n=52 e p≤5 positivos por cliente, ~260 operações de dot product 384-dim por cliente. Negligível.
- ADR-031 e ADR-032 são aditivos: um produto é excluído se satisfizer **qualquer um** dos dois critérios — a união dos soft positive sets.
- Comportamento sem `productEmbeddingMap` para um candidato: produto é incluído no pool (comportamento conservador — mesma regra do ADR-031).
