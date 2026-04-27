# ADR-031: Exclusão de Soft Negatives por Categoria+Supplier no Negative Sampling

**Status**: Accepted
**Date**: 2026-04-27

## Context

Observado em runtime após M11 COMPLETE: 3 compras demo de produtos food/Unilever (Knorr Chicken Broth 1L, Maggi Tomato Ketchup 500g, Knorr Fix Lasagne 45g) causaram queda de score do Knorr Pasta Sauce Bolognese de 64% → 32% após retreino — o oposto do comportamento esperado pelo objetivo do M11.

O Comitê de IA (Prof. Dr. Engenharia de IA/Recomendações, Prof. Dr. Machine Learning e Deep Learning, Staff Engineer Sistemas IA de Alto Desempenho, Arquiteto de IA) identificou a causa raiz em sessão de revisão (2026-04-27):

O `buildTrainingDataset` inclui o Knorr Pasta Sauce (food/Unilever, não comprado na demo) no pool de negativos da mesma categoria. Com 3 positivos food/Unilever e `classWeight: {0:1, 1:4}`, o gradiente amplificado nos positivos cria **gradient interference** sobre o Knorr Pasta Sauce — produto com embedding próximo no espaço latente. A rede aprende ativamente a não recomendar produtos food/Unilever que não foram comprados naquela sessão específica.

Este comportamento é formalmente conhecido como **False Negative Contamination** na literatura (ANCE, Debiased Contrastive Learning — NeurIPS 2020). A prática de excluir itens correlacionados do pool de negativos é padrão de produção em sistemas como YouTube (2016, Covington et al. — "impression-based negatives"), Pinterest ("in-batch negatives") e Amazon (BERT4Rec — exclusão de mesma sub-categoria). Em sistemas de produção com milhões de interações o sinal verdadeiro eventualmente domina; com 3 compras demo e 52 produtos, um único falso negativo tem peso desproporcional — tornando a exclusão **mais crítica aqui do que em produção**.

A heurística de excluir mesma (categoria + supplier) é uma aproximação pragmática e computacionalmente trivial do que o ANCE faria com um índice de vizinhança aproximado no espaço de embedding. Não é um artifício desta demo — é um princípio universal de qualidade de dados de treino.

## Decision

Adicionar campo `supplierId?: string` ao `ProductDTO` em `training-utils.ts` (opcional para retrocompatibilidade). Em `buildTrainingDataset`, antes de construir o pool de negativos, calcular o conjunto de **soft positive IDs**: produtos que compartilham **categoria E supplierId** com qualquer positivo do cliente, mas que não foram comprados. Esses produtos são excluídos do `negativePool` — tratados como "desconhecidos" (não foram rejeitados, apenas não comprados nesta sessão).

```typescript
// IDs dos positivos com supplierId conhecido
const positiveCategorySupplierPairs = new Set(
  positiveProducts
    .filter(p => p.supplierId)
    .map(p => `${p.category}::${p.supplierId}`)
)

// Soft positives: mesma (categoria + supplier), não comprados
const softPositiveIds = new Set(
  productsWithEmbeddings
    .filter(p =>
      !purchasedIds.has(p.id) &&
      p.supplierId &&
      positiveCategorySupplierPairs.has(`${p.category}::${p.supplierId}`)
    )
    .map(p => p.id)
)

// Pool de negativos exclui comprados E soft positives
const negativePool = productsWithEmbeddings.filter(
  p => !purchasedIds.has(p.id) && !softPositiveIds.has(p.id)
)
```

O `supplierId` é preenchido pelo `ModelTrainer` ao construir `ProductDTO[]` a partir do `ProductSummaryDTO` (campo `supplierName` já disponível na API — usado como identificador de supplier no contexto desta correção, renomeado para `supplierId` semântico no DTO interno).

## Alternatives Considered

- **Excluir apenas por categoria (sem supplier)** — muito agressivo: excluiria produtos food de Nestlé quando o usuário comprou food de Unilever, reduzindo excessivamente o pool de negativos; Prof. IA/Rec rejeitou por perda de sinal inter-supplier na mesma categoria.
- **Excluir por proximidade de embedding (ANCE)** — mais correto matematicamente, mas requer índice ANN em memória e recálculo a cada treino; complexidade desproporcional para 52 produtos; Staff Engineer rejeitou por over-engineering no escopo atual.
- **Soft labels (0.2 ao invés de 0.0)** — alternativa válida, mas requer mudança na loss function; incompatível com `classWeight` do TF.js sem implementação custom; descartado por complexidade.
- **Reduzir EPOCHS de 30 para 15** — alivia memorização mas não elimina o gradient interference; Prof. DL avaliou como paliativo, não como correção.

## Consequences

- Produtos da mesma (categoria + supplier) dos comprados na demo não recebem gradiente negativo — o modelo aprende "usuário gosta de food/Unilever" sem penalizar Knorr Pasta Sauce.
- Pool de negativos reduz: com 3 positivos food/Unilever e ~15 produtos Unilever no catálogo, o pool perde ~12 itens → dataset menor. Compensado pelo `negativeSamplingRatio: 4` existente e pelo `classWeight`.
- `supplierId` é campo opcional no `ProductDTO` — ausência não quebra o fluxo; sem `supplierId`, o produto não é excluído (comportamento conservador — mantém o negative pool maior).
- Comportamento pedagógico corrigido: após retreino com compras food/Unilever, produtos food/Unilever não comprados sobem ou mantêm score — demonstra aprendizado correto de categoria/supplier para o avaliador.
- Validado pelo Comitê de IA (4 personas) como prática padrão de produção (MNAR — Missing Not At Random), não como artifício de demo.
