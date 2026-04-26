# M9-B — Deep Retrain Showcase — Specification

## Problem Statement

O avaliador do portfólio consegue simular compras individuais via Demo Buy (M9-A) e ver o motor reagir em ~300ms via mean-pooling incremental. Mas o sistema não demonstra o processo de *retreinamento completo da rede neural* — a parte mais técnica e diferenciadora do projeto. Atualmente, `POST /model/train` existe (M7) e suporta 202 + polling, mas não há nenhuma experiência visual na UI que mostre o progresso epoch por epoch, nem uma comparação de métricas antes/depois do treino. O M9-B preenche esse gap: o avaliador clica "Retreinar Modelo", acompanha a barra de progresso ao vivo, e vê as métricas de qualidade mudarem na aba "Análise".

## Goals

- [ ] Avaliador consegue disparar um retreinamento completo da rede neural com um clique e acompanhar o progresso epoch por epoch via barra de progresso ao vivo
- [ ] Métricas do modelo anterior (`precisionAt5`, `loss`, `epoch`, timestamp) ficam visíveis ao lado das métricas do novo modelo, permitindo comparação direta "antes/depois"
- [ ] A aba "Análise" integra organicamente o painel de retrain com a comparação "Sem IA vs Com IA" já existente (AD-020), sem quebrar o layout atual
- [ ] O botão de retrain fica protegido pelo header `X-Admin-Key` existente (M7) — nenhuma mudança de segurança necessária

## Out of Scope

| Feature | Reason |
|---------|--------|
| Online learning via `model.trainOnBatch()` | Rejeitado (catastrophic forgetting + thread safety) — ver AD-013 |
| Agendamento manual do cron de retreinamento | Cron diário já existe (M7); este milestone é apenas a UI de demo |
| Rollback manual para versão anterior do modelo | VersionedModelStore existe (M7) mas UI de rollback não é necessária para o demo |
| Múltiplos treinos simultâneos | `TrainingJobRegistry` (M7) já serializa jobs; a UI deve refletir isso desabilitando o botão |
| Alteração da arquitetura do modelo neural | Parâmetros de treino são os mesmos do M4/M7 |
| Histórico completo de versões do modelo | Apenas a comparação "anterior vs atual" é necessária para o demo |
| Autenticação com login/logout na UI | `X-Admin-Key` via env var já cobre o caso de uso |

---

## User Stories

### P1: Disparar retreinamento e acompanhar progresso ao vivo ⭐ MVP

**User Story**: Como avaliador do portfólio, quero clicar "🔄 Retreinar Modelo" na aba "Análise" e ver uma barra de progresso que avança epoch por epoch, para que eu entenda que o sistema é capaz de retreinar a rede neural com os dados mais recentes.

**Why P1**: É o coração do M9-B — sem isso o milestone não existe. Toda a infra de polling e progresso serve esta experiência central.

**Acceptance Criteria**:

1. WHEN usuário acessa a aba "Análise" THEN sistema SHALL exibir o painel "Retreinar Modelo" com botão "🔄 Retreinar Modelo" habilitado (quando nenhum job está em andamento)
2. WHEN usuário clica "🔄 Retreinar Modelo" THEN sistema SHALL chamar `POST /api/v1/model/train` com header `X-Admin-Key` e exibir imediatamente a barra de progresso com status "Aguardando início..."
3. WHEN polling `GET /model/train/status/{jobId}` retorna `{ status: "running", epoch, totalEpochs, loss }` THEN barra de progresso SHALL avançar para `epoch / totalEpochs * 100%` e exibir texto "Epoch N / M — Loss: X.XXXX"
4. WHEN polling retorna `status: "done"` THEN barra de progresso SHALL atingir 100%, exibir "Retreinamento concluído ✅", e o painel de métricas SHALL atualizar com os dados do novo modelo
5. WHEN job está em andamento THEN botão "🔄 Retreinar Modelo" SHALL ficar desabilitado com label "Retreinando..." para evitar múltiplos disparos
6. WHEN polling retorna `status: "failed"` THEN sistema SHALL exibir mensagem de erro e restaurar botão ao estado habilitado

**Independent Test**: Clicar "🔄 Retreinar Modelo" → confirmar que barra de progresso aparece e avança → confirmar que botão fica desabilitado → aguardar conclusão → confirmar 100% e métricas atualizadas

---

### P1: Comparação "Antes / Depois" de métricas do modelo ⭐ MVP

**User Story**: Como avaliador do portfólio, quero ver lado a lado as métricas do modelo anterior e do novo modelo após o retreinamento, para que eu possa comparar quantitativamente a qualidade antes e depois do treino.

**Why P1**: Sem a comparação, o retreinamento é uma caixa preta. A comparação de métricas é o principal argumento técnico do M9-B.

**Acceptance Criteria**:

1. WHEN painel de retrain é exibido pela primeira vez THEN sistema SHALL chamar `GET /api/v1/model/status` para buscar as métricas do modelo atual e exibi-las como "Modelo Atual" com: `precisionAt5`, `loss`, `epoch`, `trainedAt`
2. WHEN retreinamento conclui THEN sistema SHALL exibir as métricas do novo modelo ao lado das métricas anteriores, com as colunas "Antes" e "Depois" claramente rotuladas
3. WHEN `precisionAt5` novo > `precisionAt5` anterior THEN sistema SHALL exibir badge verde "↑ Melhora" ao lado da métrica
4. WHEN `precisionAt5` novo ≤ `precisionAt5` anterior THEN sistema SHALL exibir badge amarelo "→ Igual" ou badge vermelho "↓ Regressão" conforme o caso (VersionedModelStore do M7 previne troca automática em caso de regressão — a UI apenas informa)
5. WHEN `GET /model/status` retorna que não há modelo treinado ainda THEN painel SHALL exibir "Nenhum modelo treinado — clique em Retreinar Modelo para começar"

**Independent Test**: Verificar métricas "Antes" antes do clique → retreinar → verificar que coluna "Depois" aparece com valores diferentes e badge de comparação correto

---

### P1: Layout integrado na aba "Análise" ⭐ MVP

**User Story**: Como avaliador, quero que o painel de retrain conviva organicamente com a comparação "Sem IA vs Com IA" já existente na aba "Análise", sem que o layout quebre em desktop ou mobile.

**Why P1**: A aba "Análise" já existe (AD-020). Invadir o layout sem planejamento quebraria o M8 — a integração é parte do MVP.

**Acceptance Criteria**:

1. WHEN aba "Análise" é exibida em tela grande (≥ 1024px) THEN comparação "Sem IA vs Com IA" SHALL ocupar a metade esquerda e painel de retrain SHALL ocupar a metade direita, em layout de duas colunas
2. WHEN aba "Análise" é exibida em mobile (< 1024px) THEN layout SHALL empilhar os dois painéis em tabs internas: "📊 Comparação" (padrão) e "🔄 Retreinar" — conforme Tensão T3 registrada em AD-012
3. WHEN `npm run build` é executado após M9-B THEN build SHALL completar sem erros TypeScript ou warnings ESLint
4. WHEN ClientProfileCard existente na aba "Análise" (M-CF scope) está presente THEN painel de retrain SHALL ser adicionado sem remover ou modificar o ClientProfileCard

**Independent Test**: Abrir aba "Análise" em viewport 1280px → confirmar layout de duas colunas → redimensionar para 375px → confirmar tabs internas "Comparação" / "Retreinar"

---

### P2: Polling automático com intervalo inteligente

**User Story**: Como sistema, quero que o polling do status do job use intervalo crescente (backoff) para não sobrecarregar o ai-service durante treinos longos.

**Why P2**: Com os dados sintéticos atuais (~20 clientes, ~50 produtos), o treino dura ~3–10s. Mas com datasets maiores o treino pode durar minutos. Polling a cada 500ms seria desnecessariamente agressivo.

**Acceptance Criteria**:

1. WHEN job está `status: "queued"` THEN sistema SHALL fazer polling a cada 1s
2. WHEN job está `status: "running"` E progresso < 50% THEN sistema SHALL fazer polling a cada 1s
3. WHEN job está `status: "running"` E progresso ≥ 50% THEN sistema SHALL fazer polling a cada 2s
4. WHEN job atinge `status: "done"` ou `status: "failed"` THEN polling SHALL parar imediatamente
5. WHEN componente é desmontado durante polling ativo THEN polling SHALL ser cancelado via cleanup do `useEffect` para evitar memory leak

**Independent Test**: Inspecionar Network tab → confirmar que requests ao `/model/train/status` cessam após "done" + verificar que o componente não gera requests após unmount

---

### P2: Estado persistente do último retreinamento na sessão

**User Story**: Como avaliador, quero que as métricas do último retreinamento permaneçam visíveis se eu navegar para outra aba e voltar para "Análise", para que eu não precise retreinar novamente para mostrar os resultados.

**Why P2**: Sem persistência de sessão, o avaliador perderia os resultados ao clicar em outra aba durante uma apresentação.

**Acceptance Criteria**:

1. WHEN retreinamento conclui e usuário navega para outra aba THEN métricas do novo modelo SHALL ser preservadas em estado React (não no Zustand persist) enquanto a sessão estiver ativa
2. WHEN usuário retorna para aba "Análise" THEN painel SHALL exibir resultado do último retreinamento sem novo fetch ao `/model/status`
3. WHEN usuário faz reload da página THEN estado do último retreinamento SHALL ser perdido (volátil por design — não persistir em localStorage)

**Independent Test**: Retreinar → navegar para aba "Catálogo" → voltar para "Análise" → confirmar que métricas do retreinamento ainda estão visíveis

---

### P3: Estimativa de tempo restante (ETA)

**User Story**: Como avaliador, quero ver uma estimativa de "tempo restante" ao lado da barra de progresso durante o retreinamento, para que eu possa calibrar minha expectativa durante a demonstração.

**Why P3**: Qualidade-de-vida. Não bloqueia o MVP. Depende do campo `eta` já retornado pelo endpoint `GET /model/train/status/{jobId}` (M7).

**Acceptance Criteria**:

1. WHEN polling retorna `eta` em segundos THEN sistema SHALL exibir "~Xs restantes" ao lado do texto de progresso
2. WHEN `eta` é `null` ou não disponível THEN sistema SHALL omitir a estimativa sem quebrar o layout
3. WHEN `eta` ≤ 3s THEN sistema SHALL exibir "Finalizando..." em vez do número

**Independent Test**: Verificar que texto "~Xs restantes" aparece durante treino e desaparece ao concluir

---

## Edge Cases

- WHEN `POST /model/train` retorna `409 Conflict` (job já em andamento, ex: cron diário disparou ao mesmo tempo) THEN UI SHALL exibir toast "Retreinamento já em andamento — acompanhe o progresso abaixo" e iniciar polling do `jobId` existente (se disponível no response body)
- WHEN `POST /model/train` retorna `401 Unauthorized` (ADMIN_API_KEY não configurada no env do frontend) THEN UI SHALL exibir toast de erro "Chave de admin não configurada — verifique a variável NEXT_PUBLIC_ADMIN_API_KEY" e não exibir barra de progresso
- WHEN polling falha 3x consecutivamente com erro de rede THEN sistema SHALL parar o polling, exibir "Erro de conexão com o serviço — tente novamente" e restaurar o botão
- WHEN usuário abre a aba "Análise" enquanto um job de retreinamento já está em andamento (disparado pelo cron diário, por exemplo) THEN `GET /model/status` retornará o `currentJobId` em andamento — UI SHALL detectar isso e iniciar polling automaticamente, exibindo progresso sem novo disparo manual
- WHEN `totalEpochs` é `0` ou `null` no response de status THEN barra de progresso SHALL exibir modo indeterminado (animação contínua) em vez de percentual
- WHEN ai-service está fora do ar ao clicar "Retreinar Modelo" THEN UI SHALL exibir toast de erro e manter botão habilitado para nova tentativa

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---------------|-------|-------|--------|
| M9B-01 | P1: Painel retrain visível na aba "Análise" com botão habilitado | Design | Pending |
| M9B-02 | P1: Clique chama POST /model/train com X-Admin-Key | Design | Pending |
| M9B-03 | P1: Barra de progresso exibida imediatamente após disparo | Design | Pending |
| M9B-04 | P1: Polling atualiza barra com epoch/totalEpochs e loss | Design | Pending |
| M9B-05 | P1: Barra atinge 100% e exibe "Concluído ✅" ao status "done" | Design | Pending |
| M9B-06 | P1: Botão desabilitado com label "Retreinando..." durante job ativo | Design | Pending |
| M9B-07 | P1: Erro de job (status "failed") restaura botão e exibe mensagem | Design | Pending |
| M9B-08 | P1: GET /model/status busca métricas do modelo atual no load | Design | Pending |
| M9B-09 | P1: Métricas "Antes" exibidas: precisionAt5, loss, epoch, trainedAt | Design | Pending |
| M9B-10 | P1: Métricas "Depois" exibidas lado a lado após treino concluir | Design | Pending |
| M9B-11 | P1: Badge verde "↑ Melhora" quando precisionAt5 novo > anterior | Design | Pending |
| M9B-12 | P1: Badge amarelo/vermelho "→ Igual" / "↓ Regressão" para piora | Design | Pending |
| M9B-13 | P1: Mensagem "Nenhum modelo treinado" quando status retorna vazio | Design | Pending |
| M9B-14 | P1: Layout duas colunas em ≥ 1024px (comparação | retrain) | Design | Pending |
| M9B-15 | P1: Tabs internas "Comparação" / "Retreinar" em < 1024px | Design | Pending |
| M9B-16 | P1: npm run build sem erros após M9-B | Design | Pending |
| M9B-17 | P1: ClientProfileCard existente não é removido nem quebrado | Design | Pending |
| M9B-18 | P2: Polling a 1s quando queued ou running < 50% | Design | Pending |
| M9B-19 | P2: Polling a 2s quando running ≥ 50% | Design | Pending |
| M9B-20 | P2: Polling para ao receber done/failed | Design | Pending |
| M9B-21 | P2: Polling cancelado no cleanup do useEffect | Design | Pending |
| M9B-22 | P2: Métricas do retrain preservadas ao navegar entre abas | Design | Pending |
| M9B-23 | P2: Estado volátil — não persiste após reload de página | Design | Pending |
| M9B-24 | P3: ETA "~Xs restantes" exibida quando campo eta disponível | Design | Pending |
| M9B-25 | P3: ETA omitida sem quebrar layout quando eta é null | Design | Pending |
| M9B-26 | P3: "Finalizando..." quando eta ≤ 3s | Design | Pending |
| M9B-27 | Edge: 409 Conflict → toast + polling do job existente | Design | Pending |
| M9B-28 | Edge: 401 Unauthorized → toast com instrução de configuração | Design | Pending |
| M9B-29 | Edge: 3 falhas consecutivas de polling → parar + mensagem de erro | Design | Pending |
| M9B-30 | Edge: Job em andamento no load → polling automático sem novo disparo | Design | Pending |
| M9B-31 | Edge: totalEpochs null/0 → barra de progresso indeterminada | Design | Pending |
| M9B-32 | Edge: ai-service fora do ar → toast + botão habilitado para retry | Design | Pending |

**Coverage:** 32 total, 0 mapped to tasks, 32 unmapped ⚠️

---

## Contexto Técnico Relevante (para Design)

### Decisões já tomadas

- **AD-012 (Tensão T3)**: Aba "Análise" absorve tanto a comparação "Sem IA vs Com IA" (M8) quanto os controles de Deep Retrain (M9-B). Layout: comparação à esquerda, retrain à direita em tela grande; tabs internas empilhadas em mobile.
- **AD-020**: Aba "Análise" foi criada no post-M8 nav fix fundindo `ClientProfileCard` + comparação. O M9-B adiciona o painel de retrain sem remover nada.
- **M7**: `POST /api/v1/model/train` retorna `202 Accepted` com `{ jobId, status: "queued" }`. `GET /api/v1/model/train/status/{jobId}` retorna `{ status, epoch, totalEpochs, loss, eta }`. `GET /api/v1/model/status` retorna histórico das últimas 5 versões do modelo com métricas.
- **M7 (segurança)**: `POST /model/train` exige header `X-Admin-Key`. O frontend deve ler `NEXT_PUBLIC_ADMIN_API_KEY` do ambiente e incluir no header.

### Endpoints existentes a consumir (sem alteração no backend)

| Endpoint | Uso no M9-B |
|----------|-------------|
| `POST /api/v1/model/train` | Disparar retreinamento — retorna `{ jobId }` |
| `GET /api/v1/model/train/status/{jobId}` | Polling de progresso epoch por epoch |
| `GET /api/v1/model/status` | Buscar métricas do modelo atual (precisionAt5, loss, epoch, trainedAt, versionHistory) |

### Componentes existentes reutilizáveis

| Componente / Hook | Localização | Como reutilizar no M9-B |
|-------------------|-------------|------------------------|
| Aba "Análise" | `frontend/src/app/page.tsx` (TabNav) | Adicionar painel de retrain à direita da comparação existente |
| `useRecommendations()` | domain hook Zustand | Reler recomendações após treino concluir (refetch com cliente atual) |
| `sonner` toasts | já instalado (M8) | Toasts de erro para 409, 401, falhas de rede |
| `ClientProfileCard` | `frontend/src/components/` | Não modificar — apenas coexistir no layout |
| `ShuffledColumn` + `RecommendedColumn` | aba "Análise" existente | Não modificar — apenas coexistir no layout |

### Novos componentes a criar

| Componente | Responsabilidade |
|------------|-----------------|
| `<RetrainPanel>` | Container do painel de retrain: botão + barra de progresso + métricas antes/depois |
| `<TrainingProgressBar>` | Barra de progresso com epoch/totalEpochs, loss e ETA |
| `<ModelMetricsComparison>` | Tabela/grid de métricas "Antes" vs "Depois" com badges de comparação |
| `useRetrainJob` | Hook que encapsula disparo + polling + estado do job (sem Zustand — estado local do componente) |

### Variáveis de ambiente necessárias

```
NEXT_PUBLIC_ADMIN_API_KEY=     # já documentada no .env.example (M7)
```

Nenhuma nova variável de ambiente é necessária no backend.

---

## Success Criteria

- [ ] Avaliador consegue clicar "🔄 Retreinar Modelo", ver a barra de progresso avançar epoch por epoch, e ver as métricas "Antes/Depois" ao concluir — fluxo completo sem erros
- [ ] Layout da aba "Análise" não quebra em desktop (≥ 1024px) nem em mobile (< 1024px)
- [ ] Botão fica desabilitado durante o treino e é restaurado ao concluir ou falhar
- [ ] `ClientProfileCard` e comparação "Sem IA vs Com IA" permanecem funcionais após a adição do painel de retrain
- [ ] `tsc --noEmit` sem erros, `npm run build` ✓, ESLint ✓ 0 warnings no frontend
- [ ] Todos os testes Vitest existentes no ai-service continuam passando (nenhuma mudança de backend neste milestone)
