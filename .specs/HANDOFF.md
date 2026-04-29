# Handoff

**Date:** 2026-04-27T22:36:00-03:00
**Feature:** M11 validation context - pesos `1:4` + negative sampling
**Task:** Validacao manual concluida + contexto persistido em `STATE.md`

## Completed ✓

- Rodado teste focal do `ai-service`: `src/services/training-utils.test.ts` com `13/13` testes passando.
- Confirmado que o treino continua usando `classWeight: { 0: 1.0, 1: 4.0 }`.
- Executado experimento manual com o cliente `Supermercado Familia BR`.
- Usada cesta homogenea `snacks/Nestle`: `Nestle Wafer Chocolate 3-pack`, `Nestle Baton Dark Chocolate 16g`, `Nestle Passatempo Cookies 130g`.
- Capturados baseline, fase `Com Demo`, retreino e `Pos-Retreino`.
- Gerados artefatos em `frontend/e2e/screenshots/manual-validation/`.
- Registrado contexto persistente em `.specs/project/STATE.md` via `AD-036`, `L-006` e `L-007`.

## In Progress

- Nenhuma implementacao ativa no momento; o trabalho desta sessao foi encerrado em estado consistente.
- Localizacao principal para retomada: `frontend/e2e/screenshots/manual-validation/experiment-output.json`

## Pending

- Repetir o protocolo de validacao M11 com um segundo cluster homogeneo (`personal_care/Unilever` ou `beverages/Nestle`).
- Decidir se os resultados do experimento devem ser incorporados ao `README.md` ou a outra documentacao de entrega.

## Blockers

- Nenhum blocker tecnico ativo.

## Context

- Branch: `main`
- HEAD: `4e31f22 feat(m12): validate self-healing model startup end to end`
- Uncommitted:
  - `.specs/project/STATE.md`
  - `README.md`
  - `frontend/e2e/screenshots/manual-validation/`
- Resultado principal do experimento:
  - `precisionAt5`: `0.6 -> 0.6` (estavel)
  - `trainingSamples`: `1363 -> 1378` (`+15`, coerente com `3 x (1 positivo + 4 negativos)`)
  - cluster correlato subiu de `5/6/8/9` para `2/3/4/6`
  - veredito: `pipeline aprovado` com `sucesso parcial`
- Observacao importante:
  - produtos comprados podem sumir do ranking por design, porque o recomendador exclui itens ja comprados dos candidatos; o sinal correto e a subida dos correlatos do mesmo cluster
- Related decisions:
  - `AD-036` em `.specs/project/STATE.md`
  - `AD-031` e `AD-032` em `.specs/project/STATE.md`
  - `L-006` e `L-007` em `.specs/project/STATE.md`
