# ADR-023: AnalysisPanel always-mounted para preservar estado do retrain entre tabs

**Status**: Accepted
**Date**: 2026-04-26

## Context

A spec M9-B exige que as métricas do último retreinamento permaneçam visíveis ao navegar para outra aba e voltar (M9B-22). O estado de progresso e métricas é volátil por design (não persiste no reload — M9B-23), mas deve sobreviver a troca de tabs dentro da sessão. Em `page.tsx`, `AnalysisPanel` é renderizado condicionalmente via `{activeTab === 'analysis' && <AnalysisPanel />}`, o que destrói o componente e todo o seu estado local ao sair da aba.

Três abordagens foram avaliadas no Phase 1–3:
- **Node A**: `useRetrainJob` com estado local, mantendo render condicional — falha exatamente no problema descrito.
- **Node B**: Zustand slice não-persist para o estado do job — stale closure no setInterval dentro de action Zustand + Rule of Three falha.
- **Node C**: `AnalysisPanel` always-mounted com visibilidade controlada por CSS — padrão estabelecido em AD-018 (RAGDrawer).

## Decision

`AnalysisPanel` é renderizado incondicionalmente em `page.tsx`. Visibilidade é controlada via classe Tailwind `hidden`/`block` na div container. O container recebe `aria-hidden={activeTab !== 'analysis'}` para remover elementos escondidos da árvore de acessibilidade e do tab order de screen readers.

## Alternatives considered

- **Node A (render condicional + estado local)**: Destruiria `useRetrainJob` state ao sair da aba — viola M9B-22 diretamente. Eliminado na Phase 2.
- **Node B (Zustand non-persist slice)**: `setInterval` dentro de Zustand action cria stale closure sobre `jobId`; Rule of Three falha (sem evidência de reuso do slice). Eliminado na Phase 2.

## Consequences

- `AnalysisPanel` renderiza no DOM desde o primeiro load — custo de DOM adicional. Mitigado: o painel é reativo (sem I/O no mount) e apenas `ClientProfileCard` + grid vazio são renderizados até o usuário interagir.
- `aria-hidden` deve ser sincronizado com `activeTab` no `page.tsx` — adiciona um prop ao container, mas é o mecanismo correto para ocultar conteúdo interativo de assistive technologies.
- Padrão consistente com AD-018 (`RAGDrawer` always-mounted) — qualquer engenheiro futuro já conhece a convenção.
