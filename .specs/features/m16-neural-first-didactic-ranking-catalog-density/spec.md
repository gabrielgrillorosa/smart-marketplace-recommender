# M16 — Neural-First Didactic Ranking & Catalog Density — Especificação

**Status:** SPECIFIED — consolidado em 2026-04-29 a partir do AD-054. O milestone transforma a direção `neural-first` em requisitos acionáveis para candidate pool, contrato de recomendação, UX didática do catálogo, seed sintético e re-baseline de métricas. Próximo passo: `design feature`.

## Problema

O fluxo principal `Carrinho -> Pedido -> Treino` já está consolidado, mas o showcase ainda falha exatamente no momento em que deveria ficar mais convincente para o avaliador:

1. O `ai-service` ainda exclui produtos comprados de forma praticamente vitalícia do candidate pool, então itens "somem" sem explicação visível.
2. O seed atual é pequeno e quase uniforme, então 3-4 compras na mesma categoria já esgotam rápido demais o pool de candidatos inéditos por país/categoria.
3. O frontend ainda não separa com clareza `vitrine completa` de `ranking elegível`, nem expõe por produto se ele está fora do ranking por compra recente, país, ausência de embedding ou outro filtro determinístico.
4. Sem essa separação, o avaliador pode atribuir o movimento do ranking a fórmulas escondidas, heurísticas manuais ou até bugs, em vez do comportamento neural real do sistema.

O `M16` corrige esse gap didático: compras recentes deixam de provocar desaparecimento silencioso, a vitrine passa a explicar elegibilidade versus ranking, o ranking continua puramente `neural + semantic`, e o dataset ganha densidade suficiente para a afinidade de categoria emergir do modelo sem boost artificial.

## Goals

- [ ] Substituir a exclusão vitalícia por **suppression temporal** via `RECENT_PURCHASE_WINDOW_DAYS`, mantendo o produto visível no catálogo
- [ ] Tornar explícita na UI a diferença entre `Modo Vitrine` e `Modo Ranking IA`, com badges e painel de `Compras recentes`
- [ ] Preservar o contrato `neural-first`: `finalScore` continua vindo apenas dos sinais `neuralScore` + `semanticScore`
- [ ] Expandir o seed sintético para densidade suficiente em `beverages` e `food`, evitando esgotamento precoce do candidate pool
- [ ] Recalcular e documentar o baseline de métricas após o refresh do dataset

## Fora de Escopo

| Feature | Motivo |
|---|---|
| Lane separada de recompra (`Buy Again`, `Repor mix`, replenishment) | Deferido; `M16` só torna a recência explícita no ranking principal |
| Boost manual por categoria, supplier, marca, segmento ou recência no `finalScore` | Viola a direção `neural-first` aprovada no AD-054 |
| Migração do seed do `ai-service` para o `api-service` | Continua rastreada separadamente em ADR-053 como débito/spike |
| Substituir polling de `/model/status` por SSE/WebSocket | Fora do escopo do milestone atual |
| Grid search dos pesos `NEURAL_WEIGHT` / `SEMANTIC_WEIGHT` e endpoint `/benchmark` | Continua como consideração futura/ADR-016 |
| Voltar a esconder produtos inelegíveis do catálogo principal | Contrário ao objetivo didático do milestone |

---

## User Stories

### P1: Compra recente vira elegibilidade explícita, não desaparecimento silencioso ⭐ MVP

**User Story:** Como avaliador, quero que produtos comprados recentemente continuem visíveis, mas temporariamente fora do ranking principal com motivo e data de retorno, para entender por que certos itens não aparecem no topo sem interpretar isso como bug.

**Por que P1:** Esse é o núcleo do `M16`. Sem ele, o showcase continua mascarando a regra operacional mais importante e impedindo a leitura correta da recomendação.

**Acceptance Criteria:**

1. WHEN o sistema monta o candidate pool para `recommend`, `recommendFromCart` ou fluxo equivalente de ranking THEN ele SHALL aplicar uma janela de compras recentes (`RECENT_PURCHASE_WINDOW_DAYS`) em vez de excluir todo o histórico comprado indefinidamente
2. WHEN o produto foi comprado dentro da janela ativa THEN ele SHALL permanecer visível na vitrine, mas SHALL ficar fora do conjunto elegível ranqueado por IA
3. WHEN um produto é suprimido por compra recente THEN o contrato de recomendação SHALL expor metadados determinísticos por produto, incluindo ao menos `eligible = false`, `reason = recent_purchase` e `suppressionUntil`
4. WHEN a compra confirmada mais recente de um produto estiver fora da janela THEN o produto SHALL voltar a ser elegível sem exigir limpeza manual de dados
5. WHEN o sistema avalia compras recentes THEN a fonte de verdade SHALL ser pedido confirmado, não intenção de carrinho nem edge legado `is_demo`
6. WHEN outros filtros determinísticos também tornarem um produto inelegível THEN o contrato SHALL distinguir essas razões de elegibilidade da lógica de ranking do modelo
7. WHEN não houver itens elegíveis para o ranking, mas ainda houver catálogo visível THEN a resposta/UI SHALL comunicar "sem itens elegíveis no ranking" em vez de parecer que o catálogo está vazio
8. WHEN múltiplas razões de inelegibilidade atingirem o mesmo produto THEN o sistema SHALL expor uma razão primária determinística e MAY expor razões secundárias sem ambiguidade
9. WHEN a janela de compra recente remove itens do ranking THEN o sistema SHALL não compensar isso com boost manual em outros itens para simular aprendizado

**Independent Test:** Selecionar um cliente com compra recente confirmada -> chamar recomendações -> validar que o produto comprado continua visível na vitrine, aparece como `recent_purchase`/inelegível e tem `suppressionUntil`; simular compra antiga fora da janela -> validar que o item volta a ser elegível.

---

### P1: Catálogo separa `Modo Vitrine` de `Modo Ranking IA` com painel de compras recentes e badges ⭐ MVP

**User Story:** Como avaliador, quero navegar entre uma vitrine completa e uma visão ranqueada por IA, vendo badges e explicações de elegibilidade por produto, para entender claramente o que foi filtrado versus o que foi ranqueado.

**Por que P1:** O valor didático do showcase depende de ver o catálogo completo sem desaparecimentos silenciosos e entender por que cada item está ou não no ranking principal.

**Acceptance Criteria:**

1. WHEN um cliente estiver selecionado THEN o frontend SHALL oferecer modos explícitos `Modo Vitrine` e `Modo Ranking IA`
2. WHEN o usuário estiver em `Modo Vitrine` THEN a grade SHALL mostrar todo o catálogo filtrado atual, incluindo itens elegíveis e inelegíveis, sem remoção silenciosa
3. WHEN o usuário estiver em `Modo Ranking IA` THEN os itens elegíveis SHALL ser ordenados por score de IA, enquanto os itens inelegíveis SHALL permanecer visíveis com separação/estilo que deixe claro que estão fora do ranking principal
4. WHEN um produto estiver inelegível por compra recente THEN seu card SHALL exibir badges como `comprado recentemente` e `fora do ranking nesta janela`, com data de retorno quando disponível
5. WHEN um produto estiver inelegível por outra regra operacional relevante THEN o card SHALL expor badges/motivos explícitos, incluindo casos como `fora do país`, `sem embedding` ou contexto `demo`/legado quando aplicável
6. WHEN o cliente tiver compras dentro da janela recente THEN um painel no topo chamado `Compras recentes` SHALL listar produto, data da última compra e data prevista de retorno ao ranking
7. WHEN o cliente não tiver compras recentes THEN o painel `Compras recentes` SHALL mostrar estado vazio explícito
8. WHEN cliente, filtros ou contexto do catálogo mudarem THEN painel e badges SHALL ser recalculados sem estados stale de elegibilidade
9. WHEN um item estiver inelegível THEN a UI SHALL evitar renderizar badge de score como se ele tivesse sido ranqueado normalmente
10. WHEN o usuário abrir detalhe ou superfície comparativa relacionada a um item suprimido THEN a explicação de elegibilidade SHALL continuar acessível nesse fluxo

**Independent Test:** Selecionar cliente com compras recentes -> alternar entre `Modo Vitrine` e `Modo Ranking IA` -> validar painel `Compras recentes`, badges de elegibilidade e permanência visual dos itens fora do ranking.

---

### P1: Explicação do ranking permanece `neural-first` e separa filtros de comportamento do modelo ⭐ MVP

**User Story:** Como avaliador, quero entender que o movimento do ranking vem do modelo neural e da similaridade semântica, enquanto filtros operacionais aparecem separados, para confiar que o showcase não está escondendo regras de negócio no score.

**Por que P1:** O milestone só cumpre sua proposta se a emergência de afinidade por categoria puder ser atribuída ao modelo, não a heurísticas manuais disfarçadas.

**Acceptance Criteria:**

1. WHEN `finalScore` for calculado THEN ele SHALL continuar sendo exclusivamente a combinação ponderada de `neuralScore` e `semanticScore` já adotada pelo projeto
2. WHEN `M16` for implementado THEN categoria, supplier, marca, segmento, recência ou qualquer heurística manual SHALL NOT adicionar boost/penalidade ao `finalScore`
3. WHEN a UI explicar um movimento de ranking THEN ela SHALL separar claramente `filtros aplicados / elegibilidade` de `o que mudou no modelo`
4. WHEN um checkout resultar em `promoted`, `rejected`, `failed` ou `unknown` THEN o bloco explicativo SHALL atribuir o resultado a pedidos, versão, deltas e sinais do modelo, não a fórmulas escondidas
5. WHEN um item estiver fora do ranking por compra recente THEN a explicação SHALL tratá-lo como filtro operacional de elegibilidade, não como rejeição do modelo
6. WHEN o avaliador observar ganho de categoria após compras repetidas THEN ao menos uma superfície explicativa SHALL afirmar que esse efeito deve emergir do comportamento neural sobre dados mais densos, e não de boost manual
7. WHEN não houver mudança relevante do modelo após checkout THEN a UI SHALL explicitar ausência de mudança em vez de fabricar uplift

**Independent Test:** Executar um cenário homogêneo de 3-4 compras numa categoria central -> validar que a explicação separa filtros de elegibilidade e atribui a subida de novos itens correlatos ao comportamento do modelo, sem mencionar boosts manuais.

---

### P1: Refresh do seed cria densidade de catálogo suficiente para o cenário didático de repetição ⭐ MVP

**User Story:** Como engenheiro preparando a demo, quero um seed sintético mais denso e menos uniforme, para que o avaliador compre 3-4 itens da mesma categoria e ainda veja candidatos inéditos suficientes dessa categoria no ranking.

**Por que P1:** Sem densidade de dados, o `M16` vira apenas uma melhoria de UX. O objetivo do milestone exige que o dataset sustente o aprendizado visível de categoria.

**Acceptance Criteria:**

1. WHEN o seed sintético rodar THEN o catálogo total SHALL atingir o piso aceito de aproximadamente `85` SKUs, com alvo preferido em torno de `125` documentado pela implementação
2. WHEN as categorias centrais `beverages` e `food` forem inspecionadas THEN cada uma SHALL ter `20-25` produtos
3. WHEN os suppliers do seed forem contabilizados THEN a variedade SHALL ser maior que o baseline atual de `3` suppliers
4. WHEN clientes e pedidos sintéticos forem gerados THEN a distribuição SHALL refletir vieses por `segment x category` e padrões de recompra, em vez de uma rotação quase uniforme
5. WHEN o cenário canônico do showcase comprar `3-4` itens de uma categoria central THEN candidatos inéditos suficientes dessa mesma categoria/pais SHALL continuar disponíveis para o ranking principal
6. WHEN descrições, suppliers e disponibilidade geográfica forem ampliados THEN eles SHALL permanecer diversos o bastante para sustentar similaridade semântica e evitar colapso em quase-duplicatas
7. WHEN o seed refresh for aplicado THEN o projeto SHALL continuar reproduzível com `docker compose up` em volumes limpos, preservando o cold start zero-touch do portfólio

**Independent Test:** Contar SKUs/categorias/suppliers do seed renovado -> executar cenário seeded de compras repetidas em `beverages` ou `food` -> validar que ainda existem candidatos inéditos relevantes da mesma categoria no ranking.

---

### P2: Métricas e validação são re-baselined após o dataset denso

**User Story:** Como mantenedor do projeto, quero recalcular o baseline de qualidade e revisar hiperparâmetros após a expansão do seed, para que o showcase continue cientificamente defensável e comparável.

**Por que P2:** O dataset muda materialmente em `M16`. Sem re-baseline, qualquer melhora ou regressão aparente fica sem contexto.

**Acceptance Criteria:**

1. WHEN a densidade do seed mudar materialmente THEN o projeto SHALL recalcular e documentar um novo baseline de `precisionAt5`
2. WHEN a validação do showcase for atualizada THEN `recall@10` e `nDCG@10` SHALL ser avaliados como métricas auxiliares, sem substituir `precisionAt5` como métrica canônica de promoção
3. WHEN a nova distribuição de embeddings / negatives alterar o comportamento do treino THEN `SOFT_NEGATIVE_SIM_THRESHOLD` e `negativeSamplingRatio` SHALL ser revisados e recalibrados se necessário, com rationale documentado
4. WHEN o fluxo de promoção continuar após `M16` THEN `precisionAt5` SHALL permanecer como gate principal até nova decisão explícita de comitê
5. WHEN o cenário didático de compras repetidas for validado no seed denso THEN a evidência final SHALL combinar métricas quantitativas com observação qualitativa do ranking

**Independent Test:** Rodar treino/avaliação no seed renovado -> registrar novo baseline de `precisionAt5`, `recall@10` e `nDCG@10` -> validar qualitativamente o ranking no cenário de compras repetidas.

---

## Edge Cases

- WHEN um mesmo produto for comprado múltiplas vezes dentro da janela THEN a supressão SHALL usar a compra confirmada mais recente como referência para `suppressionUntil`
- WHEN a janela de recência expirar entre duas consultas THEN o próximo refresh do catálogo/ranking SHALL tornar o produto elegível novamente sem intervenção manual
- WHEN um produto estiver simultaneamente no carrinho e também dentro da janela de compra recente THEN a UI SHALL evitar badges conflitantes e manter precedência de motivo determinística
- WHEN o catálogo tiver itens visíveis, mas zero itens elegíveis para ranking THEN `Modo Ranking IA` SHALL continuar explicando a vitrine atual em vez de aparentar pane ou catálogo vazio
- WHEN um produto estiver sem embedding THEN ele SHALL permanecer explicável na vitrine, mas não SHALL aparecer como score válido no ranking
- WHEN o cliente não tiver compras recentes THEN o painel `Compras recentes` SHALL mostrar vazio verdadeiro, não loading permanente nem mensagem enganosa
- WHEN a expansão do seed aumentar custo de cold start e treino THEN o projeto SHALL preservar a narrativa "rodar localmente com um único compose" sem depender de intervenção manual pós-boot

---

## Traceabilidade de Requisitos

| Requirement ID | Story | Fase | Status |
|---|---|---|---|
| NFD-01 | P1: Aplicar janela `RECENT_PURCHASE_WINDOW_DAYS` no candidate pool | Design | Pending |
| NFD-02 | P1: Produto comprado recentemente permanece visível, mas fora do ranking | Design | Pending |
| NFD-03 | P1: Contrato expõe `eligible`, `reason` e `suppressionUntil` | Design | Pending |
| NFD-04 | P1: Produto volta a ficar elegível após expirar a janela | Design | Pending |
| NFD-05 | P1: Recência usa pedidos confirmados, não carrinho nem `is_demo` | Design | Pending |
| NFD-06 | P1: Outras razões determinísticas de inelegibilidade são distinguidas | Design | Pending |
| NFD-07 | P1: Zero elegíveis com catálogo visível é comunicado corretamente | Design | Pending |
| NFD-08 | P1: Múltiplas razões usam precedência determinística | Design | Pending |
| NFD-09 | P1: Sem boost compensatório por causa da supressão | Design | Pending |
| NFD-10 | P1: UI oferece `Modo Vitrine` e `Modo Ranking IA` | Design | Pending |
| NFD-11 | P1: `Modo Vitrine` mantém catálogo completo sem desaparecimento | Design | Pending |
| NFD-12 | P1: `Modo Ranking IA` separa elegíveis ranqueados de inelegíveis visíveis | Design | Pending |
| NFD-13 | P1: Cards mostram badges de compra recente e retorno ao ranking | Design | Pending |
| NFD-14 | P1: Cards mostram badges para `fora do país`, `sem embedding`, `demo` etc. | Design | Pending |
| NFD-15 | P1: Painel `Compras recentes` lista produto, data e retorno | Design | Pending |
| NFD-16 | P1: Painel `Compras recentes` tem estado vazio explícito | Design | Pending |
| NFD-17 | P1: Cliente/filtros recarregam painel e badges sem estado stale | Design | Pending |
| NFD-18 | P1: Item inelegível não exibe score enganoso | Design | Pending |
| NFD-19 | P1: Explicação de elegibilidade permanece acessível em detalhe/comparativo | Design | Pending |
| NFD-20 | P1: `finalScore` permanece restrito a `neuralScore + semanticScore` | Design | Pending |
| NFD-21 | P1: Sem boosts manuais por categoria/supplier/marca/segmento/recência | Design | Pending |
| NFD-22 | P1: UI separa `filtros aplicados` de `o que mudou no modelo` | Design | Pending |
| NFD-23 | P1: Pós-checkout explica resultado por pedidos/versão/deltas do modelo | Design | Pending |
| NFD-24 | P1: Supressão por compra recente é tratada como elegibilidade operacional | Design | Pending |
| NFD-25 | P1: Superfície explicativa reforça emergência neural sem boost manual | Design | Pending |
| NFD-26 | P1: Ausência de mudança do modelo é explicitada sem inventar uplift | Design | Pending |
| NFD-27 | P1: Seed atinge piso de ~85 SKUs e documenta alvo ~125 | Design | Pending |
| NFD-28 | P1: `beverages` e `food` atingem 20-25 produtos cada | Design | Pending |
| NFD-29 | P1: Seed supera baseline atual de 3 suppliers | Design | Pending |
| NFD-30 | P1: Pedidos sintéticos refletem vieses `segment x category` e recompra | Design | Pending |
| NFD-31 | P1: Cenário de 3-4 compras ainda preserva candidatos inéditos da categoria | Design | Pending |
| NFD-32 | P1: Descrições/disponibilidade permanecem diversas para semântica | Design | Pending |
| NFD-33 | P1: Seed denso preserva boot reprodutível com `docker compose up` | Design | Pending |
| NFD-34 | P2: Novo baseline de `precisionAt5` é recalculado e documentado | Design | Pending |
| NFD-35 | P2: `recall@10` e `nDCG@10` entram como métricas auxiliares | Design | Pending |
| NFD-36 | P2: `SOFT_NEGATIVE_SIM_THRESHOLD` e `negativeSamplingRatio` são revisitados | Design | Pending |
| NFD-37 | P2: `precisionAt5` continua gate principal até nova decisão | Design | Pending |
| NFD-38 | P2: Validação final combina métricas quantitativas e leitura qualitativa | Design | Pending |

**Total:** 38 requisitos | P1: 33 | P2: 5

---

## Contexto Técnico Relevante (para Design)

### Estado atual confirmado no código

- `ai-service/src/services/RecommendationService.ts` hoje passa `purchasedIds` / `excludedIds` diretamente para `getCandidateProducts()`, o que materializa a exclusão por histórico completo no caminho principal
- `ai-service/src/repositories/Neo4jRepository.ts` retorna apenas produtos com `embedding` e disponibilidade por país, mas ainda não expõe metadados de elegibilidade, compra recente ou datas de supressão
- `frontend/lib/types.ts` e `frontend/lib/adapters/recommend.ts` assumem um contrato focado em itens ranqueados; ainda não há envelope tipado para `eligible` vs `suppressed`
- `frontend/components/catalog/ProductCard.tsx` já suporta `ScoreBadge`, badge de `no carrinho` e motivo de ação desabilitada, sendo a extensão natural para badges de elegibilidade
- `frontend/components/client/ClientProfileCard.tsx` e `frontend/lib/hooks/useSelectedClientProfile.ts` já derivam produtos recentes de pedidos reais, o que oferece base para o painel `Compras recentes`
- `frontend/components/recommendations/AnalysisPanel.tsx`, `frontend/lib/hooks/useModelStatus.ts` e `frontend/components/analysis/PostCheckoutOutcomeNotice.tsx` já oferecem superfícies para explicar `o que mudou no modelo`
- `ai-service/src/seed/data/products.ts` e `ai-service/src/seed/data/orders.ts` confirmam um catálogo ainda pequeno e uma geração de pedidos bastante determinística/quase uniforme, coerente com o esgotamento precoce do pool descrito no AD-054

### Implicações para a próxima fase

- O design precisa decidir onde a recência de compra será materializada para consultas rápidas de ranking, sem quebrar o fluxo atual entre `api-service`, `ai-service` e Neo4j
- O contrato de recomendação precisa evoluir para carregar ranking e elegibilidade sem quebrar silenciosamente os adapters atuais do frontend
- A UI precisa definir agrupamento, copy e precedência visual entre múltiplas razões de inelegibilidade
- O refresh do seed vai exigir atualização de testes focados, smoke tests do boot e protocolo de validação qualitativa do showcase

---

## Critérios de Sucesso

- [ ] Após `3-4` compras na mesma categoria central, o avaliador continua vendo candidatos inéditos relevantes dessa categoria no ranking principal
- [ ] Produtos comprados recentemente deixam de sumir silenciosamente e passam a aparecer como itens visíveis, porém inelegíveis, com motivo e retorno ao ranking
- [ ] O catálogo e a análise deixam claro o que é filtro operacional versus o que é comportamento do modelo
- [ ] O `finalScore` continua sem boosts manuais de negócio, preservando a narrativa `neural-first`
- [ ] O seed renovado e o re-baseline de métricas deixam o showcase mais convincente sem quebrar o cold start reproduzível do projeto
