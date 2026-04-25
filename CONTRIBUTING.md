# Contributing to Smart Marketplace Recommender

## Estrutura do Monorepo / Monorepo Structure

```
smart-marketplace-recommender/
├── api-service/          # Spring Boot 3.3 (Java 21) — domain API
├── ai-service/           # Fastify + TensorFlow.js (Node.js 20) — AI/ML
├── frontend/             # Next.js 14 (React, TypeScript) — UI
├── infra/
│   └── postgres/         # init.sql — schema + baseline seed
├── docker-compose.yml
├── .env.example
└── README.md
```

## Setup Local / Local Development

### Pré-requisitos / Prerequisites

- Docker + Docker Compose (for the full stack)
- Java 21 (for api-service development)
- Node.js 20 (for ai-service and frontend development)
- Maven 3.9+ (or use `./mvnw` wrapper inside `api-service/`)

### Rodando cada serviço individualmente / Running each service individually

#### api-service (Spring Boot)

```bash
cd api-service

# Compile and run
./mvnw spring-boot:run

# Or build JAR and run
./mvnw package -DskipTests
java -jar target/*.jar
```

Requires PostgreSQL running locally or set environment variables:
```bash
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5433   # see .env.example
export POSTGRES_DB=marketplace
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=postgres
```

#### ai-service (Fastify + TensorFlow.js)

```bash
cd ai-service

npm install
npm run dev   # ts-node src/index.ts
```

Requires Neo4j running and env vars set (see `.env.example`).

#### frontend (Next.js)

```bash
cd frontend

npm install
npm run dev   # Next.js dev server on :3000
```

## Comandos de Teste / Test Commands

### AI Service (Vitest)

```bash
cd ai-service
npm test                # run once
npm run test:watch      # watch mode
```

### API Service (JUnit 5 + Testcontainers)

```bash
cd api-service
./mvnw test             # unit tests only (fast)
./mvnw verify           # unit + integration tests + JaCoCo coverage
```

Integration tests require Docker to be running (Testcontainers pulls `postgres:16-alpine`).

### Frontend (ESLint)

```bash
cd frontend
npm run lint
npm run build           # includes TypeScript check
```

### Full verification suite

From the monorepo root:

```bash
./mvnw verify -pl api-service && npm test --prefix ai-service && npm run lint --prefix ai-service && npm run lint --prefix frontend
```

## Convenção de Commits / Commit Convention

Este projeto usa [Conventional Commits](https://www.conventionalcommits.org/):

| Type | When to use |
|------|-------------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `chore:` | Build, CI, tooling, dependencies |
| `docs:` | Documentation only |
| `test:` | Adding or updating tests |
| `refactor:` | Code change that neither fixes a bug nor adds a feature |
| `style:` | Formatting, missing semicolons, no logic change |
| `perf:` | Performance improvement |

Examples:
```
feat(ai-service): add hybrid scoring with configurable weights
fix(api-service): handle null country code in client entity
test(ai-service): add vitest suite with buildApp factory and DI mocks
chore(m6): quality & publication — tests, dockerfiles, docs complete
```

Scope (optional): service name or milestone — `(api-service)`, `(ai-service)`, `(frontend)`, `(m6)`.

## Pull Request Guidelines

1. Branch from `main`: `git checkout -b feat/my-feature`
2. Keep PRs focused — one logical change per PR
3. All tests must pass: `./mvnw verify -pl api-service && npm test --prefix ai-service`
4. No linting warnings: `npm run lint --prefix ai-service && npm run lint --prefix frontend`
5. Update `README.md` if the change affects the public API or quickstart flow
6. Reference the task ID in the PR description (e.g., `Implements T11-T12 from M6 tasks.md`)
