# M1 — Foundation Tasks

**Spec**: `.specs/features/m1-foundation/spec.md`
**Design**: `.specs/features/m1-foundation/design.md`
**Status**: Draft

**MCPs disponíveis:**
- `context7` — documentação atualizada de libs (Spring Boot, Fastify, Next.js, neo4j-driver, pg, Docker Compose)
- `filesystem` — leitura/escrita de arquivos no projeto (escopo: `smart-marketplace-recommender/`)
- `github` — operações GitHub (requer `GITHUB_PERSONAL_ACCESS_TOKEN` preenchido no `~/.cursor/mcp.json`)

---

## Execution Plan

### Phase 1: Monorepo Skeleton (Sequential)

Root scaffolding that all other tasks depend on. Must be done first, in order.

```
T1 → T2 → T3 → T4 → T5
```

### Phase 2: Infra Files (Parallel OK)

With the skeleton in place, these files are independent and can be authored in parallel.

```
T5 complete, then:

    ├── T6  [P]   infra/postgres/init.sql
    ├── T7  [P]   infra/neo4j/init.cypher
    ├── T8  [P]   .env.example
    └── T9  [P]   .gitignore
```

### Phase 3: Service Scaffolds (Parallel OK)

Each service scaffold is independent once the root structure exists.

```
T5 complete (+ T6/T7/T8/T9 complete), then:

    ├── T10 [P]   api-service scaffold (Spring Boot skeleton + Dockerfile)
    ├── T11 [P]   ai-service scaffold (Node.js/Fastify skeleton + Dockerfile)
    └── T12 [P]   frontend scaffold (Next.js skeleton + Dockerfile)
```

### Phase 4: Docker Compose (Sequential)

Depends on all service scaffolds existing.

```
T10 + T11 + T12 complete, then:

T13 → T14
```

### Phase 5: Seed Data + Script (Sequential)

Seed data files first, then the seed script that imports them.

```
T6 complete (schema reference), then:

T15 → T16 → T17 → T18 → T19 → T20
```

### Phase 6: Integration Verification (Sequential)

Final end-to-end check after all prior phases complete.

```
T13 + T20 complete:

T21
```

---

## Task Breakdown

### T1: Create monorepo root directory structure

**What**: Create the top-level directories (`api-service/`, `ai-service/`, `frontend/`, `infra/postgres/`, `infra/neo4j/`) and empty placeholder `README.md` at the repo root.
**Where**: `smart-marketplace-recommender/` (repo root)
**Depends on**: None
**Reuses**: Nothing — greenfield
**Requirement**: M1-08

**Tools**:
- MCP: `filesystem` (criar diretórios e README)
- Skill: NONE

**Done when**:
- [ ] Directories `api-service/`, `ai-service/`, `frontend/`, `infra/postgres/`, `infra/neo4j/` exist at repo root
- [ ] `README.md` placeholder exists at repo root (single line: `# Smart Marketplace Recommender`)
- [ ] `ls -la` at repo root confirms all required directories and files (M1-08)

**Tests**: none
**Gate**: verify

**Commit**: `chore(monorepo): initialize directory structure`

---

### T2: Create api-service Maven project skeleton

**What**: Create a minimal valid Maven project for `api-service` with `pom.xml` (Spring Boot 3.3, Java 21, spring-boot-starter-web, spring-boot-starter-actuator, spring-boot-starter-data-jpa, postgresql driver, springdoc-openapi) and `src/main/java/com/smartmarketplace/` + `src/test/java/com/smartmarketplace/` directory trees with a minimal `ApiServiceApplication.java` entry point.
**Where**: `api-service/pom.xml`, `api-service/src/main/java/com/smartmarketplace/ApiServiceApplication.java`, `api-service/src/test/java/com/smartmarketplace/`
**Depends on**: T1
**Reuses**: Nothing — standard Spring Boot initializr structure
**Requirement**: M1-09

**Tools**:
- MCP: `context7` (Spring Boot 3.3 deps), `filesystem` (escrever pom.xml e source files)
- Skill: NONE

**Done when**:
- [ ] `api-service/pom.xml` exists with `<groupId>com.smartmarketplace</groupId>`, Spring Boot 3.3 parent, Java 21 source/target, and required dependencies
- [ ] `api-service/src/main/java/com/smartmarketplace/ApiServiceApplication.java` exists with `@SpringBootApplication` and `main()` method
- [ ] `api-service/src/test/java/com/smartmarketplace/` directory exists
- [ ] `cat api-service/pom.xml` shows valid Maven POM (M1-09)

**Tests**: none
**Gate**: verify

**Commit**: `chore(api-service): scaffold Maven project with Spring Boot 3.3`

---

### T3: Create ai-service Node.js project skeleton

**What**: Create a minimal valid Node.js 22 project for `ai-service` with `package.json` (Fastify, `@langchain/community`, `@langchain/openai`, `@xenova/transformers`, `neo4j-driver`, `pg`, TypeScript dev dependencies) and `tsconfig.json` and `src/index.ts` (Fastify app entry with `/health` route returning `{"status":"ok"}`).
**Where**: `ai-service/package.json`, `ai-service/tsconfig.json`, `ai-service/src/index.ts`
**Depends on**: T1
**Reuses**: `exemplo-13-embeddings-neo4j-rag` package structure (Fastify + LangChain + neo4j-driver pattern)
**Requirement**: M1-10

**Tools**:
- MCP: `context7` (Fastify, LangChain docs), `filesystem` (escrever package.json, tsconfig, index.ts)
- Skill: NONE

**Done when**:
- [ ] `ai-service/package.json` exists with `fastify`, `@langchain/community`, `@langchain/openai`, `@xenova/transformers`, `neo4j-driver`, `pg` as dependencies; TypeScript + ts-node as devDependencies; `"start": "ts-node src/index.ts"` and `"seed": "ts-node src/seed/seed.ts"` scripts
- [ ] `ai-service/tsconfig.json` exists with `target: ES2022`, `module: commonjs`, `strict: true`
- [ ] `ai-service/src/index.ts` exists with Fastify app, `GET /health` route returning `{"status":"ok"}`, and `listen` call on `AI_SERVICE_PORT`
- [ ] `cat ai-service/package.json` shows Fastify and LangChain dependencies (M1-10)

**Tests**: none
**Gate**: verify

**Commit**: `chore(ai-service): scaffold Node.js 22 Fastify project`

---

### T4: Create frontend Next.js project skeleton

**What**: Create a minimal valid Next.js 14 project for `frontend` with `package.json` (next, react, react-dom, tailwindcss), `next.config.js`, and `app/page.tsx` placeholder (returns HTTP 200 at `/`).
**Where**: `frontend/package.json`, `frontend/next.config.js`, `frontend/app/page.tsx`, `frontend/app/layout.tsx`
**Depends on**: T1
**Reuses**: Standard Next.js 14 App Router structure
**Requirement**: M1-11

**Tools**:
- MCP: `context7` (Next.js 14 App Router), `filesystem` (escrever package.json, next.config.js, app/)
- Skill: NONE

**Done when**:
- [ ] `frontend/package.json` exists with `next`, `react`, `react-dom`, `tailwindcss` dependencies; `"dev": "next dev"` and `"build": "next build"` scripts
- [ ] `frontend/next.config.js` exists (minimal valid config)
- [ ] `frontend/app/page.tsx` exists with a placeholder component that renders without errors
- [ ] `frontend/app/layout.tsx` exists with root layout
- [ ] `cat frontend/package.json` shows Next.js dependency (M1-11)

**Tests**: none
**Gate**: verify

**Commit**: `chore(frontend): scaffold Next.js 14 project with App Router`

---

### T5: Create infra directory init files (placeholders)

**What**: Create empty placeholder files `infra/postgres/init.sql` and `infra/neo4j/init.cypher` so the directory structure satisfies M1-12 and Docker volume mounts don't fail. Real content is added in T6 and T7.
**Where**: `infra/postgres/init.sql`, `infra/neo4j/init.cypher`
**Depends on**: T1
**Reuses**: Nothing
**Requirement**: M1-12

**Tools**:
- MCP: `filesystem` (criar arquivos placeholder)
- Skill: NONE

**Done when**:
- [ ] `infra/postgres/init.sql` exists (may be empty or contain a single comment line)
- [ ] `infra/neo4j/init.cypher` exists (may be empty or contain a single comment line)
- [ ] `ls infra/postgres/ infra/neo4j/` shows both files (M1-12)

**Tests**: none
**Gate**: verify

**Commit**: `chore(infra): create init script placeholders`

---

### T6: Write PostgreSQL schema DDL (`infra/postgres/init.sql`) [P]

**What**: Write the complete DDL for all 7 tables (`suppliers`, `countries`, `products`, `product_countries`, `clients`, `orders`, `order_items`) with constraints, foreign keys, CHECK constraints, and performance indexes as specified in the design.
**Where**: `infra/postgres/init.sql`
**Depends on**: T5
**Reuses**: DDL from design.md (`/infra/postgres/init.sql` section)
**Requirement**: M1-14

**Tools**:
- MCP: `filesystem` (escrever init.sql)
- Skill: NONE

**Done when**:
- [ ] All 7 tables defined: `suppliers`, `countries`, `products`, `product_countries`, `clients`, `orders`, `order_items`
- [ ] `products.description` has `CHECK (char_length(description) >= 30)`
- [ ] `products.category` has `CHECK (category IN ('beverages','food','personal_care','cleaning','snacks'))`
- [ ] `clients.segment` has `CHECK (segment IN ('retail','food_service','wholesale'))`
- [ ] All 5 performance indexes from design created (`idx_products_category`, `idx_products_supplier`, `idx_clients_country`, `idx_order_items_product`, `idx_order_items_order`)
- [ ] All UUIDs use `DEFAULT gen_random_uuid()`
- [ ] File is syntactically valid SQL (no parse errors)

**Tests**: none (verified by container startup in T14/T21)
**Gate**: verify

**Commit**: `feat(infra): PostgreSQL schema DDL with all 7 tables and indexes`

---

### T7: Write Neo4j constraint script (`infra/neo4j/init.cypher`) [P]

**What**: Write the 5 `CREATE CONSTRAINT IF NOT EXISTS` statements for `Product.id`, `Client.id`, `Category.name`, `Supplier.name`, `Country.code` as specified in the design. No vector index (M3 responsibility).
**Where**: `infra/neo4j/init.cypher`
**Depends on**: T5
**Reuses**: Cypher from design.md (`/infra/neo4j/init.cypher` section)
**Requirement**: M1-19

**Tools**:
- MCP: `filesystem` (escrever init.cypher)
- Skill: NONE

**Done when**:
- [ ] 5 `CREATE CONSTRAINT IF NOT EXISTS` statements present for all node types
- [ ] No vector index defined (M3 scope — explicitly excluded)
- [ ] Syntax uses Neo4j 5.x `FOR (n:Label) REQUIRE n.prop IS UNIQUE` form

**Tests**: none (verified by Neo4j startup in T14/T21)
**Gate**: verify

**Commit**: `feat(infra): Neo4j uniqueness constraints for all 5 node types`

---

### T8: Write `.env.example` [P]

**What**: Create the complete `.env.example` file documenting all environment variables consumed by all services, grouped by service section, with safe defaults for infrastructure variables and empty values with explanatory comments for secrets.
**Where**: `.env.example` (repo root)
**Depends on**: T5
**Reuses**: `.env.example` content from design.md
**Requirement**: M1-23, M1-24

**Tools**:
- MCP: `filesystem` (escrever .env.example)
- Skill: NONE

**Done when**:
- [ ] File contains ≥15 environment variables (M1-23)
- [ ] Variables grouped by service section with comments
- [ ] `OPENROUTER_API_KEY=` (empty) with comment directing to openrouter.ai
- [ ] All infrastructure variables have safe local defaults (postgres, neo4j, ports)
- [ ] `cat .env.example | grep -c '='` returns ≥15 (M1-23)

**Tests**: none
**Gate**: verify

**Commit**: `chore(env): add .env.example with all service variables documented`

---

### T9: Write `.gitignore` [P]

**What**: Create the `.gitignore` at repo root covering all three runtimes (Java/Maven, Node.js, Next.js) plus Docker data volumes (Neo4j data, PostgreSQL data) and secrets (`.env`).
**Where**: `.gitignore` (repo root)
**Depends on**: T5
**Reuses**: Standard patterns for Java + Node.js + Next.js monorepos
**Requirement**: M1-13

**Tools**:
- MCP: `filesystem` (escrever .gitignore)
- Skill: NONE

**Done when**:
- [ ] `.env` excluded
- [ ] `target/` (Maven build output) excluded
- [ ] `node_modules/` excluded
- [ ] `.next/` (Next.js build cache) excluded
- [ ] `neo4j/data/` excluded
- [ ] `postgres/data/` excluded
- [ ] `cat .gitignore | grep -E '^\.env$'` returns `.env` (M1-13)

**Tests**: none
**Gate**: verify

**Commit**: `chore(root): add .gitignore for Java, Node.js, Next.js, and Docker volumes`

---

### T10: Write `api-service/Dockerfile` (multi-stage) [P]

**What**: Write the multi-stage Dockerfile for `api-service`: stage 1 uses `maven:3.9-eclipse-temurin-21` to compile and package the JAR; stage 2 uses `eclipse-temurin:21-jre-alpine` as the slim runtime image. Copies only the packaged JAR into the runtime stage.
**Where**: `api-service/Dockerfile`
**Depends on**: T2
**Reuses**: Multi-stage Java Dockerfile pattern
**Requirement**: M1-27, M1-28

**Tools**:
- MCP: `filesystem` (escrever Dockerfile)
- Skill: NONE

**Done when**:
- [ ] Stage 1: `FROM maven:3.9-eclipse-temurin-21 AS build` — runs `mvn package -DskipTests`
- [ ] Stage 2: `FROM eclipse-temurin:21-jre-alpine` — copies JAR from stage 1
- [ ] `EXPOSE 8080` in runtime stage
- [ ] `CMD ["java", "-jar", "app.jar"]` or equivalent entry point
- [ ] `cat api-service/Dockerfile` shows two `FROM` statements (M1-27)

**Tests**: none (image size verified in T21)
**Gate**: verify

**Commit**: `feat(api-service): multi-stage Dockerfile with Alpine JRE runtime`

---

### T11: Write `ai-service/Dockerfile` [P]

**What**: Write the Dockerfile for `ai-service` using `node:22-alpine`. Install dependencies with `npm ci`, copy source, and use `ts-node` (or compiled JS) as entry point. Expose port `3001`.
**Where**: `ai-service/Dockerfile`
**Depends on**: T3
**Reuses**: `exemplo-13-embeddings-neo4j-rag` Dockerfile patterns
**Requirement**: M1-10

**Tools**:
- MCP: `filesystem` (escrever Dockerfile)
- Skill: NONE

**Done when**:
- [ ] `FROM node:22-alpine` as base
- [ ] `WORKDIR /app`, `COPY package*.json ./`, `RUN npm ci` for dependency caching
- [ ] Source files copied and entry point set to start the Fastify server
- [ ] `EXPOSE 3001`

**Tests**: none
**Gate**: verify

**Commit**: `feat(ai-service): Dockerfile with node:22-alpine`

---

### T12: Write `frontend/Dockerfile` [P]

**What**: Write the Dockerfile for `frontend` using `node:22-alpine`. Uses Next.js standalone output mode for a smaller production image. Exposes port `3000`.
**Where**: `frontend/Dockerfile`
**Depends on**: T4
**Reuses**: Next.js standalone Docker pattern
**Requirement**: M1-11

**Tools**:
- MCP: `context7` (Next.js standalone Docker output), `filesystem` (escrever Dockerfile e atualizar next.config.js)
- Skill: NONE

**Done when**:
- [ ] `FROM node:22-alpine` as base
- [ ] Build stage runs `npm run build` (Next.js compilation)
- [ ] Runtime stage copies `.next/standalone` output
- [ ] `EXPOSE 3000`
- [ ] `next.config.js` updated with `output: 'standalone'` if needed for the Dockerfile pattern used

**Tests**: none
**Gate**: verify

**Commit**: `feat(frontend): Dockerfile with Next.js standalone output`

---

### T13: Write `docker-compose.yml`

**What**: Write the complete `docker-compose.yml` orchestrating all 5 services (`postgres`, `neo4j`, `api-service`, `ai-service`, `frontend`) with health checks, `depends_on` conditions, port mappings, volume mounts for init scripts, and environment variable bindings from `.env`.
**Where**: `docker-compose.yml` (repo root)
**Depends on**: T10, T11, T12
**Reuses**: Design patterns from design.md (`docker-compose.yml` section and ADR-002 for Neo4j healthcheck)
**Requirement**: M1-01, M1-02, M1-03, M1-04, M1-05, M1-06, M1-07

**Tools**:
- MCP: `context7` (Docker Compose health check syntax), `filesystem` (escrever docker-compose.yml)
- Skill: NONE

**Done when**:
- [ ] `postgres` service: `image: postgres:16-alpine`, `healthcheck` using `pg_isready`, volume mount for `infra/postgres/init.sql` → `/docker-entrypoint-initdb.d/init.sql` (M1-14)
- [ ] `neo4j` service: `image: neo4j:5`, `healthcheck` using `cypher-shell "RETURN 1"` (ADR-002), `NEO4J_server_memory_heap_max__size: 512m`, Bolt thread pool cap, volume mount for `infra/neo4j/init.cypher` (M1-19)
- [ ] `api-service` service: `depends_on: postgres: condition: service_healthy` (M1-02), port `8080:8080`
- [ ] `ai-service` service: `depends_on: neo4j: condition: service_healthy` (M1-03), port `3001:3001`
- [ ] `frontend` service: port `3000:3000` (M1-04)
- [ ] All services reference `.env` via `env_file: .env` or explicit `environment:` blocks
- [ ] All 5 service port bindings match spec: 5432, 7474/7687, 8080, 3001, 3000 (M1-07)

**Tests**: none (full verification in T21)
**Gate**: verify

**Commit**: `feat(infra): docker-compose.yml with all 5 services and health checks`

---

### T14: Smoke-test Docker Compose startup (infrastructure services only)

**What**: Copy `.env.example` to `.env`, run `docker compose up postgres neo4j -d`, wait for health checks to pass, and verify both services reach `healthy` status. Confirms the Compose file syntax, health check configuration, init script mounting, and environment variable wiring are correct before building application images.
**Where**: Verification step — no code changes; may fix `docker-compose.yml`, `infra/postgres/init.sql`, or `infra/neo4j/init.cypher` if errors are found.
**Depends on**: T6, T7, T8, T13
**Reuses**: —

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `cp .env.example .env` succeeds
- [ ] `docker compose up postgres neo4j -d` exits 0
- [ ] `docker compose ps postgres neo4j` shows both services with status `healthy` within 3 minutes (M1-01 partial, M1-24)
- [ ] `docker exec postgres psql -U postgres -d marketplace -c "\dt"` lists the 7 tables from `init.sql` (M1-14)
- [ ] Neo4j Browser accessible at `http://localhost:7474` (HTTP 200) (M1-07)
- [ ] `docker compose down -v` cleans up all volumes cleanly (edge case from spec)

**Tests**: none
**Gate**: verify

**Commit**: `chore(infra): verify docker compose db services start healthy`

---

### T15: Write seed data — `countries.ts` and `suppliers.ts`

**What**: Create static seed data files for the 5 countries (BR, MX, CO, NL, RO) and 3 suppliers in the `ai-service/src/seed/data/` directory.
**Where**: `ai-service/src/seed/data/countries.ts`, `ai-service/src/seed/data/suppliers.ts`
**Depends on**: T3 (ai-service project must exist), T6 (schema reference for field names)
**Reuses**: Field names from `infra/postgres/init.sql`
**Requirement**: M1-15

**Tools**:
- MCP: `filesystem` (escrever countries.ts e suppliers.ts)
- Skill: NONE

**Done when**:
- [ ] `countries.ts` exports an array of 5 country objects with `code` and `name` properties: BR, MX, CO, NL, RO
- [ ] `suppliers.ts` exports an array of 3 supplier objects with `id` (UUID v4 literals), `name`, `country_code`
- [ ] All IDs in `suppliers.ts` are valid UUID v4 strings (not placeholders)
- [ ] TypeScript types are defined and data matches the schema field names exactly

**Tests**: none
**Gate**: verify

**Commit**: `feat(seed): add countries and suppliers static data`

---

### T16: Write seed data — `products.ts` (52 products)

**What**: Create the static product data file with exactly 52 products distributed across the 5 categories (≥8 per category: `beverages`, `food`, `personal_care`, `cleaning`, `snacks`) with rich descriptions ≥30 chars (typically 80–150 chars) following the design's description quality pattern.
**Where**: `ai-service/src/seed/data/products.ts`
**Depends on**: T15
**Reuses**: Field names from schema; description pattern from design.md (`"[Product name] is a [category] [type]..."`)
**Requirement**: M1-15, M1-17

**Tools**:
- MCP: `filesystem` (escrever products.ts)
- Skill: NONE

**Done when**:
- [ ] Exports an array of exactly 52 product objects
- [ ] Each product has: `id` (UUID v4 literal), `sku` (unique string), `name`, `description`, `category`, `price`, `supplier_id` (references a supplier from `suppliers.ts`)
- [ ] Category distribution: ≥8 products per each of the 5 categories (M1-15)
- [ ] All descriptions are ≥30 chars — TypeScript runtime validation throws if any is shorter (M1-17, edge case from spec)
- [ ] Each product includes `available_in` field (array of country codes, 1–4 countries) for `product_countries` junction seeding (M1-18)
- [ ] `sku` values are unique across all 52 products

**Tests**: none
**Gate**: verify

**Commit**: `feat(seed): add 52 products with rich descriptions across 5 categories`

---

### T17: Write seed data — `clients.ts` (20 clients)

**What**: Create the static client data file with exactly 20 clients distributed across the 3 segments (`retail`, `food_service`, `wholesale`) and 5 countries, each with a `country_code` that matches one of the 5 seeded countries.
**Where**: `ai-service/src/seed/data/clients.ts`
**Depends on**: T15
**Reuses**: Country codes from `countries.ts`
**Requirement**: M1-15

**Tools**:
- MCP: `filesystem` (escrever clients.ts)
- Skill: NONE

**Done when**:
- [ ] Exports an array of exactly 20 client objects
- [ ] Each client has: `id` (UUID v4 literal), `name`, `segment` (one of: `retail`, `food_service`, `wholesale`), `country_code` (one of: BR, MX, CO, NL, RO)
- [ ] All 3 segments represented; all 5 countries represented (at least 1 client per country)
- [ ] `created_at` field present as ISO 8601 string

**Tests**: none
**Gate**: verify

**Commit**: `feat(seed): add 20 clients across 5 countries and 3 segments`

---

### T18: Write seed data — `orders.ts` (generator function)

**What**: Create the `orders.ts` generator that produces ≥100 orders with ≥2 items each. Each order references a valid `client_id` (from `clients.ts`) and each order item references a `product_id` that is available in the client's country (cross-referenced via the `available_in` field from `products.ts`).
**Where**: `ai-service/src/seed/data/orders.ts`
**Depends on**: T16, T17
**Reuses**: `clients.ts` and `products.ts` data
**Requirement**: M1-15, M1-18

**Tools**:
- MCP: `filesystem` (escrever orders.ts)
- Skill: NONE

**Done when**:
- [ ] Exports a generator function `generateOrders(clients, products)` that returns an array of order objects
- [ ] Each order has: `id` (UUID v4), `client_id`, `order_date`, `total` (computed), `items: [{id, product_id, quantity, unit_price}]`
- [ ] Each order has ≥2 items (M1-15)
- [ ] Each order item references only products available in the client's country (M1-18 — edge case from spec)
- [ ] Total orders generated ≥100 (each client generates 5–15 orders per design)
- [ ] `total` field is computed as `sum(quantity * unit_price)` for each order

**Tests**: none
**Gate**: verify

**Commit**: `feat(seed): add order generator with country-scoped product selection`

---

### T19: Write `seed.ts` — main seed script

**What**: Write the main seed orchestrator `ai-service/src/seed/seed.ts` that connects to both PostgreSQL and Neo4j, seeds all entities in the correct order using `ON CONFLICT DO NOTHING` (PostgreSQL) and `UNWIND MERGE` (Neo4j), logs structured progress, runs cross-count verification, and exits with code 0 (success) or 1 (failure). Implements all observability requirements (M1-25, M1-26).
**Where**: `ai-service/src/seed/seed.ts`
**Depends on**: T15, T16, T17, T18
**Reuses**: Execution flow from design.md (7-step flow); `exemplo-13` patterns for neo4j-driver and pg driver; L-001 lessons (always `await`, use `MERGE` not `CREATE`)
**Requirement**: M1-16, M1-20, M1-21, M1-22, M1-25, M1-26

**Tools**:
- MCP: `context7` (neo4j-driver, pg driver APIs), `filesystem` (escrever seed.ts)
- Skill: NONE

**Done when**:
- [ ] Connects to PostgreSQL via `pg` driver using env vars (`POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`)
- [ ] Connects to Neo4j via `neo4j-driver` Bolt using env vars (`NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`)
- [ ] Seeds PostgreSQL in order: countries → suppliers → products → product_countries → clients → orders → order_items; all inserts use `ON CONFLICT DO NOTHING RETURNING id` (M1-16)
- [ ] Seeds Neo4j using `UNWIND $list AS item MERGE` pattern for all 5 node types (M1-22); creates all 4 relationship types: `[:BOUGHT]`, `[:BELONGS_TO]`, `[:SUPPLIED_BY]`, `[:AVAILABLE_IN]` (M1-21)
- [ ] Cross-count verification: compares `SELECT COUNT(*) FROM products` vs `MATCH (p:Product) RETURN count(p)` and `SELECT COUNT(*) FROM order_items` vs `MATCH ()-[r:BOUGHT]->() RETURN count(r)`; exits 1 if mismatch (M1-20)
- [ ] Startup log: `[seed] Starting — target: postgres:${POSTGRES_HOST}:${POSTGRES_PORT}, neo4j:${NEO4J_URI}` with timestamp (M1-25)
- [ ] Per-entity log: `[seed] Products: N inserted, M skipped` (M1-25)
- [ ] Completion log: total elapsed time and record counts per database (M1-25)
- [ ] On connection error: logs `[seed] ERROR: Cannot connect to PostgreSQL — ECONNREFUSED` and exits with code 1 (M1-26)
- [ ] All `await` calls on async operations (L-001 lesson applied)

**Tests**: none (verified in T20)
**Gate**: verify

**Commit**: `feat(seed): implement seed.ts with dual-DB seeding and cross-count verification`

---

### T20: Run seed against live databases and verify counts

**What**: With databases running (from T14), run `docker compose run --rm ai-service npm run seed` (or `ts-node src/seed/seed.ts` locally with env vars), verify all counts match spec, then run a second time to confirm idempotency (zero duplicates).
**Where**: Verification step — may fix `seed.ts`, `orders.ts`, or data files if counts are wrong.
**Depends on**: T14, T19
**Reuses**: —
**Requirement**: M1-15, M1-16, M1-20

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] First seed run exits 0 with structured progress logs
- [ ] `SELECT category, COUNT(*) FROM products GROUP BY category` shows 5 categories each with ≥8 products (M1-15)
- [ ] `SELECT COUNT(*) FROM orders` returns ≥100 (M1-15)
- [ ] `SELECT COUNT(*) FROM clients` returns 20 (M1-15)
- [ ] Neo4j `MATCH (n) RETURN labels(n), count(n) ORDER BY count(n) DESC` shows all 5 node types (M1-20)
- [ ] Neo4j `MATCH ()-[r]->() RETURN type(r), count(r)` shows all 4 relationship types (M1-21)
- [ ] Second seed run exits 0 with same counts (idempotency — M1-16)
- [ ] Neo4j `MATCH (p:Product) RETURN count(p)` equals `SELECT COUNT(*) FROM products` (M1-20)

**Tests**: none
**Gate**: verify

**Commit**: `chore(seed): verify idempotent seeding — all counts match spec`

---

### T21: Full `docker compose up` end-to-end health verification

**What**: Run `docker compose down -v` (clean state), then `docker compose up -d`, wait for all 5 services to reach healthy status, and verify each acceptance criterion from M1-01 through M1-07. This is the phase-end build gate for M1.
**Where**: Verification step — may fix any service's Dockerfile, `docker-compose.yml`, or health check configuration.
**Depends on**: T13, T20
**Reuses**: —
**Requirement**: M1-01, M1-02, M1-03, M1-04, M1-05, M1-06, M1-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `docker compose down -v && docker compose up -d` completes without error
- [ ] `docker compose ps` shows ALL 5 services with status `healthy` within 5 minutes (M1-01)
- [ ] `curl http://localhost:8080/actuator/health` returns `{"status":"UP"}` (M1-05)
- [ ] `curl http://localhost:3001/health` returns `{"status":"ok"}` (M1-06)
- [ ] `curl http://localhost:3000` returns HTTP 200 (M1-04)
- [ ] Neo4j Browser accessible at `http://localhost:7474` (M1-07)
- [ ] `docker images | grep smart-marketplace` shows `api-service` image under 300MB (M1-28)
- [ ] `docker compose down -v` removes all volumes cleanly; re-running `docker compose up -d` re-seeds correctly (edge case from spec)
- [ ] **Build gate**: all 5 services healthy, all endpoints respond, counts verified = M1 complete

**Tests**: none (infrastructure-level verification)
**Gate**: build (full M1 end-to-end)

**Commit**: `chore(m1): all 5 services healthy — M1 Foundation complete`

---

## Pre-Approval Validation

### Check 1: Task Granularity

| Task | Scope | Status |
|---|---|---|
| T1: Create monorepo root directories | 1 directory structure, 1 file | ✅ Granular |
| T2: Create api-service Maven skeleton | 1 project scaffold (pom.xml + entry point) | ✅ Granular |
| T3: Create ai-service Node.js skeleton | 1 project scaffold (package.json + index.ts) | ✅ Granular |
| T4: Create frontend Next.js skeleton | 1 project scaffold (package.json + app/) | ✅ Granular |
| T5: Create infra placeholder files | 2 placeholder files, same directory, trivially coupled | ✅ Granular (2-file init, cohesive) |
| T6: Write init.sql DDL | 1 file, 1 concept (PostgreSQL schema) | ✅ Granular |
| T7: Write init.cypher constraints | 1 file, 1 concept (Neo4j constraints) | ✅ Granular |
| T8: Write .env.example | 1 file | ✅ Granular |
| T9: Write .gitignore | 1 file | ✅ Granular |
| T10: Write api-service Dockerfile | 1 file | ✅ Granular |
| T11: Write ai-service Dockerfile | 1 file | ✅ Granular |
| T12: Write frontend Dockerfile | 1 file | ✅ Granular |
| T13: Write docker-compose.yml | 1 file (orchestrates all services) | ✅ Granular |
| T14: Smoke-test DB services | 1 verification step (DB only) | ✅ Granular |
| T15: Seed data — countries + suppliers | 2 small static data files, tightly coupled (countries referenced by suppliers) | ✅ Granular (cohesive pair) |
| T16: Seed data — products.ts | 1 file, 52 products | ✅ Granular |
| T17: Seed data — clients.ts | 1 file, 20 clients | ✅ Granular |
| T18: Seed data — orders.ts | 1 file, 1 generator function | ✅ Granular |
| T19: Write seed.ts main script | 1 file, 1 orchestrator | ✅ Granular |
| T20: Seed verification (live) | 1 verification step (seed run × 2) | ✅ Granular |
| T21: Full compose health verification | 1 verification step (all services) | ✅ Granular |

**Result:** ✅ All 21 tasks are atomic.

---

### Check 2: Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
|---|---|---|---|
| T1 | None | Start of Phase 1 | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T1 | T1 → T3 | ✅ Match |
| T4 | T1 | T1 → T4 | ✅ Match |
| T5 | T1 | T1 → T5 | ✅ Match |
| T6 [P] | T5 | T5 → T6 (parallel branch) | ✅ Match |
| T7 [P] | T5 | T5 → T7 (parallel branch) | ✅ Match |
| T8 [P] | T5 | T5 → T8 (parallel branch) | ✅ Match |
| T9 [P] | T5 | T5 → T9 (parallel branch) | ✅ Match |
| T10 [P] | T2 | T2 → T10 (parallel branch Phase 3) | ✅ Match |
| T11 [P] | T3 | T3 → T11 (parallel branch Phase 3) | ✅ Match |
| T12 [P] | T4 | T4 → T12 (parallel branch Phase 3) | ✅ Match |
| T13 | T10, T11, T12 | T10 + T11 + T12 → T13 | ✅ Match |
| T14 | T6, T7, T8, T13 | T6 + T7 + T8 + T13 → T14 | ✅ Match |
| T15 | T3, T6 | T3 + T6 → T15 (Phase 5 start) | ✅ Match |
| T16 | T15 | T15 → T16 | ✅ Match |
| T17 | T15 | T15 → T17 | ✅ Match |
| T18 | T16, T17 | T16 + T17 → T18 | ✅ Match |
| T19 | T15, T16, T17, T18 | T15–T18 → T19 | ✅ Match |
| T20 | T14, T19 | T14 + T19 → T20 | ✅ Match |
| T21 | T13, T20 | T13 + T20 → T21 | ✅ Match |

**Result:** ✅ All arrows match task body dependencies. No circular dependencies. Parallel tasks have no cross-dependencies within phases.

---

### Check 3: Test Co-location Validation

> Note: No TESTING.md exists (greenfield project). M1 is pure infrastructure — all code is configuration files, DDL, static data, and a seed script. There is no application business logic requiring unit or integration tests at this milestone. Test gates are shell verification commands (`docker compose ps`, `curl`, `psql` queries, Cypher queries). This is consistent with the spec's "Independent Test" sections which are all shell commands, not automated test suites.

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
|---|---|---|---|---|
| T1–T9 | Config files, DDL, infra scripts | none (no TESTING.md; infra scope) | none | ✅ OK |
| T10–T12 | Dockerfiles | none (infra scope) | none | ✅ OK |
| T13 | docker-compose.yml | none (infra scope) | none | ✅ OK |
| T14 | Verification step | none | none | ✅ OK |
| T15–T18 | Static data files (TypeScript) | none (no business logic; pure data) | none | ✅ OK |
| T19 | seed.ts (TypeScript script) | none (script, not application layer) | none | ✅ OK |
| T20 | Verification step | none | none | ✅ OK |
| T21 | Verification step (build gate) | none | none | ✅ OK |

**Result:** ✅ No TESTING.md violations. Test type `none` is appropriate for all M1 tasks since the milestone is exclusively infrastructure scaffolding, and all verification is done via Docker health checks and shell/database queries as defined in spec acceptance criteria.

---

## Requirement Traceability

| Req ID | Task(s) | Status |
|---|---|---|
| M1-01 | T13, T21 | Pending |
| M1-02 | T13, T21 | Pending |
| M1-03 | T13, T21 | Pending |
| M1-04 | T12, T13, T21 | Pending |
| M1-05 | T2, T10, T13, T21 | Pending |
| M1-06 | T3, T11, T13, T21 | Pending |
| M1-07 | T13, T21 | Pending |
| M1-08 | T1 | Pending |
| M1-09 | T2 | Pending |
| M1-10 | T3, T11 | Pending |
| M1-11 | T4, T12 | Pending |
| M1-12 | T5 | Pending |
| M1-13 | T9 | Pending |
| M1-14 | T6, T14 | Pending |
| M1-15 | T16, T17, T18, T20 | Pending |
| M1-16 | T19, T20 | Pending |
| M1-17 | T16 | Pending |
| M1-18 | T16, T18 | Pending |
| M1-19 | T7, T14 | Pending |
| M1-20 | T19, T20 | Pending |
| M1-21 | T19, T20 | Pending |
| M1-22 | T19 | Pending |
| M1-23 | T8 | Pending |
| M1-24 | T8, T14 | Pending |
| M1-25 | T19 | Pending |
| M1-26 | T19 | Pending |
| M1-27 | T10 | Pending |
| M1-28 | T10, T21 | Pending |

**Coverage:** 28/28 requirements mapped ✅
