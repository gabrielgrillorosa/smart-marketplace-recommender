# ADR-025: useRetrainJob com jobIdRef para evitar stale closure no polling interval

**Status**: Accepted
**Date**: 2026-04-26

## Context

`useRetrainJob` usa `setInterval` para fazer polling de `GET /model/train/status/{jobId}`. O `jobId` é obtido do response do `POST /model/train` e armazenado em `useState`. O callback passado para `setInterval` captura o valor de `jobId` no momento da criação do interval (closure). Se o componente re-renderiza (ex: pelo próprio update de estado) antes do interval disparar, o callback ainda aponta para o `jobId` da closure anterior — potencialmente `null` se o estado ainda não foi propagado.

O Staff Engineering identificou este risco como High severity no Phase 4, com evidência do mesmo padrão problemático em `useServiceHealth.ts` (que usa `AbortSignal` diretamente em vez de interval).

## Decision

`useRetrainJob` mantém um `jobIdRef = useRef<string | null>(null)` sincronizado com o state `jobId` via um `useEffect([jobId])` dedicado. O callback do `setInterval` lê `jobIdRef.current` (sempre o valor mais recente) em vez de `jobId` do closure.

```ts
// Padrão de referência
const [jobId, setJobId] = useState<string | null>(null);
const jobIdRef = useRef<string | null>(null);

useEffect(() => { jobIdRef.current = jobId; }, [jobId]);

// Dentro do setInterval:
const id = jobIdRef.current;
if (!id) return;
const data = await pollTrainStatus(id); // usa ref, não closure
```

## Alternatives considered

- **Closure direta sobre `jobId` de useState**: Stale closure — interval callback lê `null` se o React batch update não propagou ainda. High severity, eliminado.
- **`useCallback` com dependência em `jobId`**: Recria o callback a cada mudança de `jobId`, o que exige `clearInterval` + `setInterval` a cada update — complexidade desnecessária que não resolve o race window.

## Consequences

- `jobIdRef` deve ser sincronizado **antes** do interval poder disparar — o `useEffect([jobId])` roda síncronamente após o commit, antes do próximo tick do timer. Seguro.
- Padrão bem estabelecido em React (ref para valores estáveis em closures de timers) — documentado em React docs como "escape hatch".
- Cleanup `clearInterval(intervalRef.current)` no return do `useEffect` que inicia o polling garante cancellamento correto no unmount (M9B-21).
