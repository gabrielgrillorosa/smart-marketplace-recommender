# ADR-017: FLIP Animation sem flushSync no ReorderableGrid

**Status**: Accepted
**Date**: 2026-04-26

## Context

O componente `<ReorderableGrid>` precisa animar cards trocando de posição no grid quando `ordered` muda de `false` para `true` (e vice-versa). A técnica FLIP (First-Last-Invert-Play) é o padrão React para animação de lista reordenável sem biblioteca externa: medir posições antes da mudança de layout, aplicar `transform` inverso para cancelar o movimento, e deixar o CSS `transition` animar para a posição zero.

A implementação ingênua do FLIP usa `flushSync` dentro de `useLayoutEffect` para forçar uma renderização síncrona intermediária (capturar o snapshot "First"). No React 18 com Concurrent Features e `StrictMode`, `flushSync` dentro de um efeito causa double-render, warnings no console e comportamento imprevisível durante o commit phase.

## Decision

Implementar FLIP usando o padrão `prevPositionsRef` com dois `useLayoutEffect` em ciclos consecutivos — sem `flushSync`:

1. **Ciclo N (antes da mudança)**: `useLayoutEffect` captura as posições atuais de todos os items em um `prevPositionsRef: Map<key, DOMRect>` antes de qualquer mudança de `ordered`.
2. **Ciclo N+1 (após a mudança)**: quando `ordered` muda, `useLayoutEffect` lê o `prevPositionsRef`, mede as novas posições, calcula o delta, aplica `transform` inverso instantaneamente (sem transition), e no frame seguinte remove o transform para deixar o CSS `transition: transform 300ms ease-out` animar para `transform: none`.
3. `requestAnimationFrame` separa a aplicação do transform inverso (síncrona) da remoção do transform (frame seguinte), garantindo que o browser registre dois estados visuais distintos.

```typescript
// Sketch do padrão — não código completo
const prevPositionsRef = useRef<Map<string, DOMRect>>(new Map());

useLayoutEffect(() => {
  // Captura posições ANTES do próximo render
  itemRefs.current.forEach((el, key) => {
    if (el) prevPositionsRef.current.set(key, el.getBoundingClientRect());
  });
});

useLayoutEffect(() => {
  // Após render com `ordered` novo — aplica FLIP
  itemRefs.current.forEach((el, key) => {
    const prev = prevPositionsRef.current.get(key);
    if (!el || !prev) return;
    const curr = el.getBoundingClientRect();
    const dx = prev.left - curr.left;
    const dy = prev.top - curr.top;
    if (dx === 0 && dy === 0) return;
    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    requestAnimationFrame(() => {
      el.style.transition = 'transform 300ms ease-out';
      el.style.transform = '';
    });
  });
}, [ordered, sortedItems]);
```

## Alternatives considered

- **`flushSync` dentro de `useLayoutEffect`**: força snapshot "First" síncrono antes do re-render. Eliminado por ser anti-pattern React 18 — causa double-render em StrictMode, warnings de console, e comportamento imprevisível com Concurrent Features (Principal SW Architect, High severity).
- **Framer Motion `layout` prop**: delegaria toda a lógica FLIP ao Framer Motion. Eliminado por ser dependência nova de ~45KB; STATE.md Deferred Ideas registra Framer Motion como deferred para pós-M8 até que CSS transitions revelem limitação.
- **CSS Grid `order` property**: `order` não é propriedade animável pelo browser — cards teleportam sem transição. Eliminado em Phase 2 (Node C, High severity).

## Consequences

- `<ReorderableGrid>` usa apenas `transform` + `opacity` (GPU-composited) — zero layout thrashing durante a animação.
- `@media (prefers-reduced-motion: reduce)` é suportado via `motion-safe:transition-transform` no Tailwind — quando ativo, `transition: none` é aplicado e os cards reordenam instantaneamente.
- O padrão `prevPositionsRef` adiciona ~30 linhas de lógica ao componente, mas toda ela está encapsulada no `<ReorderableGrid>` — os consumidores (M8 catálogo, M9 demo buy) não veem essa complexidade.
- `itemRefs` requer que cada item renderizado por `renderItem` receba uma `ref` — implementado via `React.cloneElement` com ref callback ou via wrapper `<div ref={...}>` no `ReorderableGrid`.
