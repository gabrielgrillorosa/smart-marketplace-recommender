# ADR-069: Rótulos distintos — «Fixar novo normal» (ADR-067) vs limpar showcase

**Status:** Accepted  
**Data:** 2026-05-01

## Context

Em `AnalysisPanel` existe um controlo `↺ Reiniciar` ligado a `resetAnalysis()` que **zera** fases e snapshots. A ADR-067 §6 introduz uma acção **«Reiniciar»** semântica diferente: **promover** o ranking Pos-Retreino para tornar-se o novo **Com IA**, terminando a comparação transitória **sem** obrigar a seleccionar cliente de novo. Reutilizar o mesmo rótulo gera erro categorial de utilizador e falhas de QA difíceis de reproduzir verbalmente.

## Decision

Manter **dois** controlos com copy **não ambígua**: (1) **«Fixar novo normal»** (ou «Aplicar Pos-Retreino ao Com IA») — executa a promoção de estado do showcase descrita na ADR-067; (2) **«Limpar showcase»** ou **«Recomeçar análise»** — continua a chamar `resetAnalysis()`. O segundo pode manter o ícone ↺; o primeiro usa estilo primário/outline conforme hierarquia em `design.md`. `data-testid` distintos: `showcase-apply-post-retrain`, `showcase-reset-analysis`.

## Alternatives considered

- **Um único botão com menu** — descartado: mais complexidade A11y e mobile para ganho pedagógico marginal.
- **Só renomear o existente para «Limpar» e usar «Reiniciar» para ADR-067** — descartado: «Reiniciar» já está gravado em E2E e hábito de utilizador; migração de testes seria mais barata com novo verbo para a acção nova.

## Consequences

- **Positivos:** Critérios PR-067-09 testáveis; narrativa alinhada ao formador.
- **Negativos:** Actualização obrigatória de `m13-cart-async-retrain.spec.ts`, `m15-*`, e strings assertadas.
- **Mitigação:** Documentar os dois fluxos no rodapé do showcase em texto `text-xs`.
