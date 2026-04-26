# ADR-024: Progress bar via transform scaleX (GPU-composited) em vez de width

**Status**: Accepted
**Date**: 2026-04-26

## Context

A `TrainingProgressBar` precisa animar o progresso de 0% a 100% à medida que o polling retorna `epoch/totalEpochs`. A abordagem mais intuitiva é animar a propriedade CSS `width` de uma div fill (ex: `style={{ width: `${pct}%` }}`). Porém, animar `width` aciona o pipeline de layout do browser (layout → paint → composite) a cada atualização — o que é especialmente problemático no contexto do M9-B onde polls a cada 1–2s geram mudanças de valor frequentes. O Staff UI Designer identificou isso como High severity no Phase 4.

## Decision

A barra de progresso usa uma div fill em `width: 100%` com `transform-origin: left` e `transform: scaleX(fraction)` onde `fraction = epoch / totalEpochs`. A transição CSS anima apenas `transform`, que é GPU-composited (layout não é recalculado). No modo indeterminado (`totalEpochs === 0`), uma animação CSS keyframe de `scaleX` pulsante substitui o valor fixo.

```tsx
// Implementação de referência
<div className="relative h-2 overflow-hidden rounded-full bg-gray-200">
  <div
    className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-blue-600 motion-safe:transition-transform duration-300 ease-out"
    style={{ transform: `scaleX(${fraction})` }}
    role="progressbar"
    aria-valuenow={Math.round(fraction * 100)}
    aria-valuemin={0}
    aria-valuemax={100}
  />
</div>
```

## Alternatives considered

- **`width: X%` animada**: Triggers layout recalculation em cada update — layout thrashing. Eliminado (Staff UI Designer, High severity, Phase 4).
- **`<progress>` HTML nativo**: Acessibilidade nativa (`role=progressbar` implícito) mas estilização cross-browser inconsistente; shadcn/ui não fornece componente `<progress>` — requereria CSS customizado por vendor. Acessibilidade equivalente alcançável com `role="progressbar"` + `aria-valuenow` na div customizada.

## Consequences

- `transform: scaleX()` não afeta o layout — o overflow é cortado pelo `overflow-hidden` do container.
- `motion-safe:transition-transform` respeita `prefers-reduced-motion: reduce` automaticamente via Tailwind — sem transição para usuários com essa preferência (Tensão de acessibilidade resolvida).
- `aria-valuenow` deve ser atualizado a cada poll para que screen readers anunciem o progresso — sincronizado via `Math.round(fraction * 100)`.
