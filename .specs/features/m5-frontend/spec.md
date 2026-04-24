# M5 Frontend Specification

## Problem Statement

O sistema possui backend completo (API Spring Boot + AI Service TypeScript) mas nenhuma interface visual. Recrutadores e avaliadores precisam enxergar o sistema funcionando sem ler código ou fazer chamadas curl. O objetivo deste milestone é uma UI demo funcional que exibe catálogo, perfil de clientes, recomendações e chat RAG — tudo conectado a dados reais dos serviços.

## Goals

- [ ] Qualquer pessoa consegue clonar, rodar `docker compose up` e interagir com o sistema em < 10 minutos
- [ ] Os 4 painéis exibem dados reais dos serviços (sem mocks)
- [ ] O painel de recomendações demonstra visivelmente a diferença entre "sem IA" e "com IA"
- [ ] O chat RAG responde em linguagem natural com contexto explícito (explainability)

## Out of Scope

| Feature | Reason |
| -------------------------------- | -------------------------------------------------------------------- |
| Autenticação / login | Demo público, credenciais adicionam complexidade sem valor de portfólio |
| Gerenciamento de produtos (CRUD) | API já expõe POST /products; frontend é read-mostly para demo |
| Histórico persistente de chat | Estado de sessão é suficiente; persistência é pós-MVP |
| Dark mode / temas | Escopo visual é demonstração, não produto |
| Internacionalização (i18n) | UI em pt-BR com campos em inglês aceitável; bilingual README cobre isso |
| Paginação server-side no catálogo | Catálogo tem ~50 produtos; paginação client-side é suficiente |
| Testes E2E (Playwright/Cypress) | Cobertura de testes fica em M6 |

---

## User Stories

### P1: Catálogo de Produtos ⭐ MVP

**User Story**: Como avaliador, quero visualizar todos os produtos em grade com filtros e busca semântica para entender o catálogo e validar a pipeline de embeddings.

**Why P1**: Entrada principal do sistema; valida M1 (dados) + M3 (busca semântica) em uma tela.

**Acceptance Criteria**:

1. WHEN a página carrega THEN sistema SHALL exibir todos os produtos em grade com: imagem placeholder por categoria, nome, categoria, fornecedor, país (badges), preço
2. WHEN usuário seleciona filtro de categoria THEN sistema SHALL filtrar os cards em tempo real (client-side)
3. WHEN usuário seleciona filtro de país THEN sistema SHALL filtrar os cards combinando com filtro de categoria ativo
4. WHEN usuário seleciona filtro de fornecedor THEN sistema SHALL filtrar os cards combinando com filtros ativos
5. WHEN usuário digita na barra de busca e submete (Enter ou botão) THEN sistema SHALL chamar `POST /api/v1/search/semantic` no AI Service e exibir produtos ordenados por score de similaridade
6. WHEN busca semântica retorna resultados THEN sistema SHALL exibir badge de score de similaridade em cada card (ex: `96% match`)
7. WHEN usuário clica em um card de produto THEN sistema SHALL abrir modal com: nome completo, descrição, categoria, fornecedor, países disponíveis, preço, SKU
8. WHEN busca semântica retorna zero resultados THEN sistema SHALL exibir mensagem "Nenhum produto encontrado para sua busca"
9. WHEN AI Service está indisponível durante busca semântica THEN sistema SHALL exibir erro inline sem quebrar a página

**Independent Test**: Abrir `/`, digitar "bebidas sem açúcar" na busca, verificar que produtos ranqueados por similaridade aparecem com badge de score.

**Requirement IDs**: M5-01 a M5-09

---

### P1: Perfil do Cliente e Disparo de Recomendações ⭐ MVP

**User Story**: Como avaliador, quero selecionar um cliente, ver seu histórico e disparar recomendações para demonstrar o motor híbrido neural + semântico.

**Why P1**: Este painel é o coração da demo — é onde o diferencial técnico (M4 neural + M3 semântico) fica visível.

**Acceptance Criteria**:

1. WHEN usuário acessa o painel de cliente THEN sistema SHALL exibir dropdown com todos os clientes seedados (nome + país)
2. WHEN usuário seleciona um cliente THEN sistema SHALL exibir: segmento, país, total de pedidos, últimos 5 produtos comprados
3. WHEN usuário clica em "Obter Recomendações" THEN sistema SHALL chamar `POST /api/v1/recommend` via API Service e exibir estado de loading
4. WHEN recomendações retornam THEN sistema SHALL exibir os produtos no Painel de Recomendações (P1 abaixo)
5. WHEN API Service retorna fallback (AI Service indisponível) THEN sistema SHALL exibir badge "Fallback — Top Sellers" no painel de recomendações
6. WHEN usuário troca de cliente THEN sistema SHALL limpar as recomendações anteriores

**Independent Test**: Selecionar cliente "Miguel Santos" (BR), clicar "Obter Recomendações", verificar que o painel de recomendações exibe produtos com scores.

**Requirement IDs**: M5-10 a M5-15

---

### P1: Painel de Recomendações ⭐ MVP

**User Story**: Como avaliador, quero ver os produtos recomendados lado a lado com e sem IA para perceber visivelmente o impacto do modelo.

**Why P1**: A comparação "sem IA vs com IA" é a prova visual mais direta do valor técnico do projeto.

**Acceptance Criteria**:

1. WHEN recomendações são carregadas THEN sistema SHALL exibir dois painéis lado a lado: "Sem IA" (mesmos produtos em ordem aleatória) e "Com IA" (ranqueados por score híbrido)
2. WHEN produto é exibido no painel "Com IA" THEN sistema SHALL mostrar: nome, score final (0–1 com 2 casas decimais), badge de tipo (`semantic` / `neural` / `hybrid`)
3. WHEN usuário passa o mouse sobre o score THEN sistema SHALL exibir tooltip com breakdown: `neuralScore: X.XX`, `semanticScore: X.XX`
4. WHEN recomendações estão carregando THEN sistema SHALL exibir skeleton cards no lugar dos produtos
5. WHEN nenhum cliente foi selecionado THEN sistema SHALL exibir estado vazio com instrução "Selecione um cliente para ver recomendações"

**Independent Test**: Após disparar recomendações, verificar que coluna "Com IA" e coluna "Sem IA" exibem os mesmos 10 produtos em ordens diferentes, com scores visíveis na coluna direita.

**Requirement IDs**: M5-16 a M5-20

---

### P1: Chat RAG ⭐ MVP

**User Story**: Como avaliador, quero fazer perguntas em linguagem natural sobre o catálogo e ver as fontes usadas pelo modelo para entender o mecanismo de RAG.

**Why P1**: Demonstra diretamente M3 (RAG pipeline) de forma interativa e acessível a não-técnicos.

**Acceptance Criteria**:

1. WHEN usuário digita uma pergunta e envia (Enter ou botão) THEN sistema SHALL chamar `POST /api/v1/rag/query` no AI Service e exibir estado de loading no chat
2. WHEN resposta RAG retorna THEN sistema SHALL exibir a resposta em bolha de chat com timestamp
3. WHEN resposta RAG retorna THEN sistema SHALL exibir seção colapsável "Contexto recuperado" com os chunks de produtos usados (nome + score de similaridade)
4. WHEN a página carrega THEN sistema SHALL exibir 3 prompts de exemplo clicáveis: "Quais produtos sem açúcar estão disponíveis no México?", "Show me cleaning products from Unilever available in Netherlands", "Quais bebidas estão disponíveis no Brasil?"
5. WHEN usuário clica em prompt de exemplo THEN sistema SHALL preencher o input e enviar automaticamente
6. WHEN AI Service retorna erro THEN sistema SHALL exibir mensagem de erro na bolha de chat sem quebrar a página
7. WHEN histórico de chat cresce THEN sistema SHALL fazer scroll automático para a última mensagem

**Independent Test**: Clicar no prompt "Quais produtos sem açúcar estão disponíveis no México?", verificar que o chat exibe resposta em pt-BR com seção de contexto mostrando produtos recuperados.

**Requirement IDs**: M5-21 a M5-27

---

### P2: Layout e Navegação

**User Story**: Como avaliador, quero navegar entre os painéis de forma intuitiva para explorar todas as funcionalidades sem ler documentação.

**Why P2**: Estrutura necessária para conectar os 4 painéis P1; sem isso a UX não existe. Prioridade P2 porque os painéis podem ser prototipados em uma única página primeiro.

**Acceptance Criteria**:

1. WHEN usuário acessa a aplicação THEN sistema SHALL exibir layout com: header (logo + nome do projeto), tabs ou nav lateral com os 4 painéis, área de conteúdo principal
2. WHEN usuário navega entre painéis THEN sistema SHALL preservar o cliente selecionado e as recomendações carregadas
3. WHEN aplicação carrega THEN sistema SHALL verificar saúde dos serviços (API Service `/actuator/health`, AI Service `/ready`) e exibir status badges no header

**Independent Test**: Navegar entre todos os 4 painéis; o cliente selecionado e as recomendações persistem ao voltar para o painel de cliente.

**Requirement IDs**: M5-28 a M5-30

---

### P3: Polish Visual

**User Story**: Como avaliador, quero que a interface tenha aparência profissional para que o projeto transmita qualidade de engenharia.

**Why P3**: Não bloqueia a demo funcional, mas impacta a percepção de qualidade do portfólio.

**Acceptance Criteria**:

1. WHEN a grade de produtos renderiza THEN sistema SHALL exibir ícones de categoria distintos (beverage 🥤, food 🍎, etc.) como placeholder de imagem
2. WHEN componentes carregam dados THEN sistema SHALL usar skeleton screens (não spinners genéricos)
3. WHEN badges de país são exibidos THEN sistema SHALL usar código de bandeira emoji (🇧🇷, 🇲🇽, 🇨🇴, 🇳🇱, 🇷🇴)

**Requirement IDs**: M5-31 a M5-33

---

## Edge Cases

- WHEN API Service está indisponível THEN sistema SHALL exibir banner de status no header ("API Service offline") sem quebrar os outros painéis
- WHEN AI Service está indisponível THEN sistema SHALL desabilitar busca semântica e chat RAG com mensagem inline
- WHEN cliente não tem histórico de compras THEN sistema SHALL exibir "Sem pedidos registrados" no perfil
- WHEN modelo neural não foi treinado (status `untrained`) THEN sistema SHALL exibir aviso no painel de recomendações: "Modelo não treinado — execute POST /api/v1/model/train"
- WHEN resposta RAG demora > 15s THEN sistema SHALL manter loading visível (o modelo Mistral 7B free pode ter alta latência)
- WHEN usuário submete busca vazia THEN sistema SHALL ignorar a submissão sem chamar a API

---

## Requirement Traceability

| Requirement ID | Story                          | Phase  | Status  |
| -------------- | ------------------------------ | ------ | ------- |
| M5-01          | P1: Catálogo — grid inicial    | Design | Pending |
| M5-02          | P1: Catálogo — filtro categoria | Design | Pending |
| M5-03          | P1: Catálogo — filtro país     | Design | Pending |
| M5-04          | P1: Catálogo — filtro fornecedor | Design | Pending |
| M5-05          | P1: Catálogo — busca semântica | Design | Pending |
| M5-06          | P1: Catálogo — badge de score  | Design | Pending |
| M5-07          | P1: Catálogo — modal de detalhe | Design | Pending |
| M5-08          | P1: Catálogo — zero resultados | Design | Pending |
| M5-09          | P1: Catálogo — AI Service indisponível | Design | Pending |
| M5-10          | P1: Cliente — dropdown         | Design | Pending |
| M5-11          | P1: Cliente — perfil           | Design | Pending |
| M5-12          | P1: Cliente — disparo recomendações | Design | Pending |
| M5-13          | P1: Cliente — exibir recomendações | Design | Pending |
| M5-14          | P1: Cliente — fallback badge   | Design | Pending |
| M5-15          | P1: Cliente — limpar ao trocar | Design | Pending |
| M5-16          | P1: Recomendações — lado a lado | Design | Pending |
| M5-17          | P1: Recomendações — score e badge | Design | Pending |
| M5-18          | P1: Recomendações — tooltip breakdown | Design | Pending |
| M5-19          | P1: Recomendações — skeleton   | Design | Pending |
| M5-20          | P1: Recomendações — estado vazio | Design | Pending |
| M5-21          | P1: Chat RAG — envio e loading | Design | Pending |
| M5-22          | P1: Chat RAG — bolha de resposta | Design | Pending |
| M5-23          | P1: Chat RAG — contexto colapsável | Design | Pending |
| M5-24          | P1: Chat RAG — prompts de exemplo | Design | Pending |
| M5-25          | P1: Chat RAG — clique em prompt | Design | Pending |
| M5-26          | P1: Chat RAG — erro AI Service | Design | Pending |
| M5-27          | P1: Chat RAG — auto-scroll     | Design | Pending |
| M5-28          | P2: Layout — estrutura geral   | -      | Pending |
| M5-29          | P2: Layout — preservar estado  | -      | Pending |
| M5-30          | P2: Layout — status badges     | -      | Pending |
| M5-31          | P3: Polish — ícones de categoria | -     | Pending |
| M5-32          | P3: Polish — skeleton screens  | -      | Pending |
| M5-33          | P3: Polish — badges de bandeira | -     | Pending |

**Coverage:** 33 total, 27 mapeados para Design (P1+P2), 6 pendentes (P3) ⚠️

---

## Stack Constraints

O diretório `/frontend` já existe no monorepo com Next.js (criado em M1). A spec deve seguir:

- **Framework:** Next.js 14+ (App Router, já configurado em M1)
- **UI:** Tailwind CSS (já no projeto) + shadcn/ui (se não instalado, instalar durante Design)
- **Estado:** `useState` / `useReducer` + React Context para cliente selecionado (sem Redux — escopo não justifica)
- **HTTP:** `fetch` nativo do Next.js (sem Axios — dependência desnecessária)
- **Serviços chamados pelo frontend:**
  - API Service: `http://api-service:8080` (interno Docker) / `http://localhost:8080` (dev local)
  - AI Service: `http://ai-service:3000` (interno Docker) / `http://localhost:3000` (dev local)
  - Chamadas ao AI Service feitas via Next.js API Routes (proxy) para evitar CORS

---

## Success Criteria

- [ ] `docker compose up` sobe o frontend junto com os demais serviços sem erros
- [ ] Todos os 4 painéis exibem dados reais (nenhum mock)
- [ ] Busca semântica retorna resultados ranqueados por similaridade
- [ ] Painel de recomendações exibe scores e breakdown corretamente
- [ ] Chat RAG exibe resposta com contexto colapsável
- [ ] Comparação "Sem IA vs Com IA" é visualmente clara
- [ ] Avaliador consegue usar todos os painéis sem ler documentação
