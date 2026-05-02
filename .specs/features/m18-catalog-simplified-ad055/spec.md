# M18 — Catálogo simplificado & contrato de payload (AD-055) — Especificação

**Status:** **IMPLEMENTED** — 2026-04-30. **Design:** [design.md](./design.md). **Tasks:** [tasks.md](./tasks.md) (T1…T9). **Extensão (2026-05-01):** reordenação do catálogo com carrinho após «Ordenar por IA» — [ADR-073](./adr-073-catalog-live-reorder-with-cart.md).

**Roadmap:** [.specs/project/ROADMAP.md](../../project/ROADMAP.md) — **M18**. **Nota:** política de treino (checkout vs manual) não é M18 — ver [M20 / ADR-067](../m20-manual-retrain-metrics-pos-retreino/adr-067-manual-retrain-metrics-showcase-pos-retreino.md).

---

## Source documents

- **[STATE.md — AD-055](../../project/STATE.md#state-ad-055)** — pedido de produto (verbatim + implicações).
- [M16 spec](../m16-neural-first-didactic-ranking-catalog-density/spec.md) — `NFD-01..38` baseline; M18 é **delta** explícito.
- [ADR-055](../m16-neural-first-didactic-ranking-catalog-density/adr-055-eligibility-enriched-recommendation-contract.md) — *Accepted* hoje (payload merged com todos os inelegíveis); M18 **altera** a decisão de inclusão de linhas (ver § Contrato HTTP).
- [ADR-056](../m16-neural-first-didactic-ranking-catalog-density/adr-056-view-mode-zustand-flag-catalog-view-mode-hook.md) — *Accepted*; M18 remove o toggle `vitrine` ↔ `ranking` (ver § Frontend).
- [ADR-058](../m16-neural-first-didactic-ranking-catalog-density/adr-058-early-eligibility-prefetch-on-client-select.md) — *Accepted*; M18 reavalia prefetch face ao novo contrato (ver § Pré-fetch).
- [ADR-062](../m17-phased-recency-ranking-signals/adr-062-phased-recency-ranking-signals.md) — ortogonal: sinais de recência no `ai-service` **não** são revertidos por M18.
- [ADR-073](./adr-073-catalog-live-reorder-with-cart.md) — *Accepted* (2026-05-01): com «Ordenar por IA» activo, alterações no carrinho **actualizam** o ranking via `POST .../recommend/from-cart` (debounce, abort, mesma semântica que a coluna «Com Carrinho» no showcase).

---

## Problema

O [M16](../m16-neural-first-didactic-ranking-catalog-density/spec.md) entregou vitrine completa com **painel dedicado «Compras recentes»**, **toggle global Modo Vitrine / Modo Ranking IA** e resposta `POST /recommend` (e variantes) que inclui **todos** os produtos do catálogo país com metadados de elegibilidade, para badges (`no_embedding`, `in_cart`, `recently_purchased`, etc.).

**[AD-055](../../project/STATE.md#state-ad-055)** regista direcção nova: reduzir ruído visual e o tamanho do payload — **omitir** do JSON enviado ao cliente as linhas inelegíveis cuja razão **não** seja supressão temporal por compra recente; integrar apenas `recently_purchased` no **rodapé** da lista após **«Ordenar por IA»**; remover painel isolado e o toggle de modo.

---

## Goals

- [x] **Contrato HTTP:** respostas de recomendação ao cliente **não** incluem produtos inelegíveis com `eligibilityReason` fora do conjunto reservado a compra recente (hoje em código: `no_embedding`, `in_cart`; extensões futuras seguem a mesma regra até ADR explícito).
- [x] **Excepção:** manter no payload (para renderização) apenas inelegíveis com `eligibilityReason === 'recently_purchased'`, com `eligible`, `reason` e `suppressionUntil` coerentes com [NFD-03](../m16-neural-first-didactic-ranking-catalog-density/spec.md) *para essas linhas*.
- [x] **Ranking:** bloco principal ordenado por IA (elegíveis); bloco final com cabeçalho fixo **—— Fora do ranking nesta janela ——** agrupando só `recently_purchased`.
- [x] **UX:** remover `RecentPurchasesPanel` (ou equivalente) e copy isolada de «Retorno ao ranking» no topo; remover toggle **Modo Vitrine / Modo Ranking IA**.
- [x] **Catálogo antes de IA:** a listagem base de produtos (filtros de país/categoria) pode continuar a vir da fonte já usada pelo frontend (ex. API de catálogo); o que muda é **não** depender da resposta de recomendação para mostrar inelegíveis não-recentes. Badges para `no_embedding` / `in_cart` **no grid pré-«Ordenar por IA»** ficam **opcionais** — se o produto não vier do endpoint enriquecido, a UI **não** inventa motivos (degradação silenciosa aceite por AD-055).
- [x] **E2E:** [`m18-catalog-ad055`](../../../frontend/e2e/tests/m18-catalog-ad055.spec.ts) — fluxo sem painel/toggle M16.
- [x] **Documentação:** actualizar ADR-055 (e ADR-056 / ADR-058 conforme decisão de implementação) para estado *Superseded* ou *Amended* com referência a este `spec.md`.

---

## Fora de escopo (M18)

| Item | Motivo |
|------|--------|
| Alterar `RECENT_PURCHASE_WINDOW_DAYS`, pooling de perfil, ou fórmula de `finalScore` / boost M17 | Eixos M16/M17; apenas consumir comportamento existente |
| Mudar seed, métricas `precisionAt5`, gates M16 P2 (`NFD-34..38`) | Fora do delta AD-055 |
| Novo endpoint público separado só para elegibilidade | Opcional em `design`; não obrigatório para cumprir AD-055 |
| Tradução i18n do literal **—— Fora do ranking nesta janela ——** | Copy fixa PT conforme comité; i18n é melhoria futura |

---

## User stories

### P1: Payload de recomendação omite inelegíveis excepto compra recente ⭐ MVP

**User Story:** Como integrador do frontend, quero receber na resposta de recomendação apenas elegíveis + inelegíveis por `recently_purchased`, para montar uma lista única sem serializar dezenas de linhas só para badge.

**Acceptance Criteria:**

1. WHEN `POST /recommend` (ou rota proxy equivalente) serializar o corpo para o cliente THEN o array **não** SHALL conter itens com `eligible === false` e `eligibilityReason` ∈ {`no_embedding`, `in_cart`} (e qualquer novo código não-`recently_purchased` até ADR alargar a excepção).
2. WHEN existirem produtos `recently_purchased` dentro da janela THEN eles SHALL aparecer no payload com `eligible: false`, `eligibilityReason: 'recently_purchased'` e `suppressionUntil` quando aplicável.
3. WHEN `eligibilityOnly: true` (ou caminho equivalente) for usado THEN o sistema SHALL aplicar a **mesma** política de omissão **ou** SHALL ser removido/substituído por decisão documentada em `design.md` (evitar que o cliente receba de novo o mapa completo de inelegíveis se AD-055 for estrito).
4. WHEN o modelo ou ranking interno precisar de candidatos completos THEN essa expansão SHALL permanecer **interna** ao `ai-service`; a serialização HTTP ao cliente SHALL aplicar o filtro CSL-01.
5. WHEN nenhum produto for elegível mas existirem `recently_purchased` THEN a resposta SHALL ser serializável como lista só de recentes + mensagem/estrutura de «zero elegíveis» já existente ou documentada no `design` (sem regressão de HTTP 500).

**Independent Test:** Cliente fixture com itens `in_cart`, `no_embedding` e `recently_purchased` — inspeccionar JSON: apenas elegíveis + recentes; contagens batendo com `RecommendationService` interno.

---

### P1: Uma única experiência de catálogo + «Ordenar por IA» com secção de rodapé ⭐ MVP

**User Story:** Como avaliador, quero clicar em **«Ordenar por IA»** e ver de imediato o ranking IA seguido da secção **—— Fora do ranking nesta janela ——**, sem alternar modo global nem painel extra de compras recentes.

**Acceptance Criteria:**

1. WHEN o utilizador **não** tiver activado «Ordenar por IA» THEN a grade SHALL mostrar o catálogo conforme fonte de dados de produtos (filtros actuais), **sem** toggle **Modo Vitrine / Modo Ranking IA**.
2. WHEN o utilizador clicar em **«Ordenar por IA»** THEN o sistema SHALL solicitar recomendação, ordenar elegíveis pelo critério documentado (incl. M17 `rankScore` quando activo) e SHALL anexar, no fim da lista, os itens `recently_purchased` devolvidos pelo backend, sob o cabeçalho visual exacto **—— Fora do ranking nesta janela ——** (travessões e capitalização conforme AD-055).
3. WHEN não houver compras recentes na janela THEN a secção de rodapé SHALL não ocupar espaço com cabeçalho órfão **ou** SHALL mostrar estado vazio mínimo definido em `design` (preferência: omitir secção).
4. WHEN o cliente seleccionado mudar THEN o estado de ordenação IA / scores SHALL resetar de forma consistente com o comportamento actual de mudança de cliente (sem stale).
5. WHEN um item estiver em `recently_purchased` THEN o card SHALL continuar a cumprir [NFD-18](../m16-neural-first-didactic-ranking-catalog-density/spec.md) (sem badge de score como se ranqueado no bloco principal).

**Independent Test:** E2E: seleccionar cliente com supressão recente → «Ordenar por IA» → ausência de painel «Compras recentes» e de toggle de modo; presença do cabeçalho de rodapé e ordem correcta.

---

### P1: Remoção de estado `viewMode` e painel dedicado ⭐ MVP

**User Story:** Como mantenedor, quero remover `viewMode` (`vitrine` \| `ranking`) e o painel de compras recentes, para alinhar o código ao AD-055 e reduzir ramos mortos.

**Acceptance Criteria:**

1. WHEN o código for compilado / testado THEN **não** SHALL existir componente `RecentPurchasesPanel` (ou renomeado) montado no fluxo do catálogo.
2. WHEN o Zustand `catalogSlice` for inspeccionado THEN **não** SHALL persistir `viewMode` + `setViewMode` + `toggleViewMode` para o propósito M16; qualquer flag residual SHALL ser justificada em `design.md` ou removida.
3. WHEN `useCatalogViewMode` existir THEN SHALL ser removido ou reduzido a no-op deprecado removido no mesmo PR — preferência única: **remoção**.
4. WHEN `clientSlice` resetar catálogo THEN SHALL manter apenas invariantes necessários pós-M18 (documentar diff face ao reset M16).

**Independent Test:** `grep`/testes de fumo: zero referências a strings de UI do toggle M16 e ao painel removido.

---

## Edge cases

- WHEN `eligibilityOnly` for ainda necessário para UX mínima (ex. só datas de retorno) THEN o contrato SHALL devolver apenas subconjunto admitido por AD-055 — **não** reintroduzir lista completa de inelegíveis por omissão.
- WHEN o frontend precisar de `in_cart` para desactivar «Adicionar ao carrinho» THEN SHALL usar estado de carrinho já obtido via `getCart` (ou equivalente), **não** a lista omitida da recomendação.
- WHEN `no_embedding` afectar um produto visível no catálogo API THEN o card pode não mostrar badge «sem embedding» até haver outra fonte — aceite; **não** mostrar score IA fictício.
- WHEN falhar a chamada de recomendação após «Ordenar por IA» THEN o sistema SHALL degradar com mensagem de erro existente ou melhorada em `design`, sem listar produtos como ordenados por IA.

---

## Contrato HTTP (normativo para implementação)

**Prefixo de requisitos:** `CSL-*` (Catálogo Simplificado). Estados: Pending → In Design → In Tasks → Implementing → Verified.

| Campo / regra | M16 (ADR-055 original) | M18 (AD-055) |
|----------------|------------------------|--------------|
| Linhas `eligible: false`, `recently_purchased` | Incluídas | **Incluídas** (metadados obrigatórios por linha) |
| Linhas `eligible: false`, `no_embedding` / `in_cart` | Incluídas | **Omitidas** da resposta ao cliente |
| Linhas elegíveis ranqueadas | Incluídas | **Incluídas** (inalterado semanticamente) |
| Ordem no JSON | Documentado M16 | **Recomendado:** bloco ranqueado primeiro, depois `recently_purchased` — detalhe em `design.md` se a ordem for só dever de UI |

**Nota:** Códigos `EligibilityReasonCode` actuais no `ai-service` estão em `ai-service/src/types/index.ts` (`eligible`, `recently_purchased`, `no_embedding`, `in_cart`). Qualquer extensão futura do enum deve classificar-se como «omitida» ou «excepção AD-055» em ADR.

---

## Requirement traceability

| ID | Story / regra | Status |
|----|----------------|--------|
| CSL-01 | Payload ao cliente omite `no_embedding` e `in_cart` | Verified |
| CSL-02 | Payload inclui `recently_purchased` com NFD-03 por linha | Verified |
| CSL-03 | `eligibilityOnly` alinhado ou removido (sem mapa completo silencioso) | Verified |
| CSL-04 | Serialização interna ≠ serialização HTTP documentada | Verified |
| CSL-05 | UI: sem `RecentPurchasesPanel` | Verified |
| CSL-06 | UI: sem toggle Modo Vitrine / Modo Ranking IA | Verified |
| CSL-07 | UI: «Ordenar por IA» → ranking + secção **—— Fora do ranking nesta janela ——** | Verified |
| CSL-08 | Reset consistente ao mudar cliente | Verified |
| CSL-09 | NFD-18 para itens fora do ranking | Verified |
| CSL-10 | E2E `m18-catalog-ad055` | Verified |
| CSL-11 | ADR-055 / 056 / 058 actualizados (Amended/Superseded + link) | Verified |
| CSL-12 | Catálogo pós-«Ordenar por IA»: ranking **cart-aware** quando o carrinho tem itens ([ADR-073](./adr-073-catalog-live-reorder-with-cart.md)) | Verified |

---

## Reconciliação com `NFD-*` (M16)

M18 **não** revoga o núcleo de elegibilidade/ranking neural-first; altera **superfície HTTP** e **UX**. Tabela de impacto:

| ID | Título (resumido) | Relação M18 |
|----|-------------------|-------------|
| NFD-01..09 | Janela, supressão, precedência, sem boost no score | **Mantém-se** |
| NFD-10 | UI oferecia dois modos explícitos | **Supersedido por CSL-06** — um fluxo; sem toggle |
| NFD-11 | Modo vitrine: catálogo completo com inelegíveis visíveis | **Amendado** — «completo» via fonte de catálogo; inelegíveis **não** vêm da resposta de recomendação excepto `recently_purchased` após IA |
| NFD-12 | Modo ranking separava elegíveis / inelegíveis | **Supersedido por CSL-07** — mesma separação **dentro** de uma vista pós-«Ordenar por IA» |
| NFD-13 | Badges compra recente | **Mantém-se** nos cards `recently_purchased`; **não** exige painel separado |
| NFD-14 | Badges outros motivos | **Amendado** — apenas onde dados ainda existirem (carrinho API, etc.); **não** obrigatório via payload recommend |
| NFD-15 | Painel Compras recentes | **Supersedido por CSL-05** — informação integrada no rodapé pós-IA ou inferida localmente só se `design` mantiver mini-resumo |
| NFD-16 | Painel vazio | **Supersedido** com remoção do painel |
| NFD-17 | Sem stale | **Mantém-se** (critério a rever se prefetch mudar) |
| NFD-18 | Sem score enganoso | **Mantém-se** (CSL-09) |
| NFD-19 | Explicação em detalhe | **Mantém-se** onde aplicável |
| NFD-20..26 | Neural-first, copy explicativa | **Mantém-se** |
| NFD-27..33 | Seed / densidade | **Mantém-se** |
| NFD-34..38 | Métricas P2 | **Mantém-se** (fora escopo M18) |

---

## Non-goals explícitos

- Reintroduzir painel «Compras recentes» ou toggle M16 sem novo AD.
- Devolver ao cliente lista completa de inelegíveis «para debug» numa flag não autenticada em produção.

---

## Verificação de fecho (checklist)

- [x] Testes unitários/integration `ai-service` para forma do payload.
- [x] Testes de componente/E2E frontend para CSL-05..07.
- [x] README ou `ai-service/README.md` com exemplo JSON antes/depois.
- [x] ADRs referenciados actualizados e ligados a este ficheiro.
