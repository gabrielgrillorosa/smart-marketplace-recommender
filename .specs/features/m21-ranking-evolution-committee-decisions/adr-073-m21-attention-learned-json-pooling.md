# ADR-073: Modo `attention_learned` — logits com `w·e + b` e recência, artefacto JSON

- **Data**: 2026-05-01
- **Estado**: Aceite
- **Relaciona com:** [ADR-072](./adr-072-m21-profile-pooling-defer-learned-attention-logits.md) (adiamento genérico); [ADR-065](../m17-phased-recency-ranking-signals/adr-065-m17-p2-shared-profile-pooling-and-temporal-alignment.md)

## Contexto

O comité tinha adiado parâmetros **aprendidos** no pooling sem pipeline claro ([ADR-072](./adr-072-m21-profile-pooling-defer-learned-attention-logits.md)). A equipa pretende **agora** um modo **opt-in** e **separado** de `attention_light`: **`attention_learned`**, com `w`, `b` e `λ` opcional carregados de **ficheiro JSON** no arranque (fail-fast), mantendo `attention_light` **apenas recência** (sem `w`/`b`).

## Decisão

1. **`PROFILE_POOLING_MODE`** aceita **`attention_learned`** além de `mean` \| `exp` \| `attention_light`.
2. Com **`attention_learned`**, **`PROFILE_POOLING_ATTENTION_LEARNED_JSON_PATH`** é **obrigatório** e aponta para JSON `{ "w": number[], "b": number, "lambda"?: number }` com `len(w)` igual à dimensão do embedding de compra (validado na primeira agregação).
3. **Logits** (temperatura finita \(T>0\)): \(\ell_j = (w\cdot e_j + b) - \lambda \Delta_j/\tau\); pesos = **softmax**(\(\ell / T\)). Temperatura vazia / `inf` ⇒ pesos uniformes (média na janela), igual filosofia a `attention_light`.
4. **`attention_light`** permanece **inalterado** em semântica (sem termo `w·e`).
5. **`rankingConfig`** expõe `profilePoolingAttentionLearned: true` quando o modo é `attention_learned` (sem enviar o vector `w` no JSON).

## Consequências

- Operadores podem escolher **produção** entre `attention_light` e `attention_learned` sem misturar ramos.
- O JSON é **artefacto operacional** (versionar no deploy, rollback trocando ficheiro + restart).
- **Não** há treino automático deste `w` no `ModelTrainer` nesta ADR — valores vêm de processo externo (offline) escrito no ficheiro.

## Ligações

- [spec M21](./spec.md), [tasks](./tasks.md)
- Implementação: `src/profile/clientProfileAggregation.ts`, `src/profile/attentionParamsJson.ts`, `src/config/profilePoolingEnv.ts`
