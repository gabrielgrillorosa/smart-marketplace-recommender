# M1 — Foundation Specification

## Problem Statement

Before any AI feature can be built, the project needs a reproducible, zero-friction infrastructure baseline. Without a working `docker compose up`, a realistic dataset, and a defined graph schema in Neo4j, every subsequent milestone starts on sand. M1 establishes the monorepo structure, brings up all five services with health checks, seeds both databases with synthetic multi-tenant marketplace data, and defines the Neo4j graph model that the embedding and recommendation pipelines depend on.

## Goals

- [ ] Any engineer clones the repo and runs `docker compose up` — all five services are healthy within 5 minutes, no manual steps required.
- [ ] PostgreSQL contains 50+ products, 20+ clients, and realistic purchase orders across 5 countries and 3 suppliers.
- [ ] Neo4j contains Product, Client, Category, Supplier, and Country nodes with correct relationship edges and uniqueness constraints.
- [ ] Seed script is idempotent — running it twice produces the same dataset, no duplicates.
- [ ] `.env.example` documents every required environment variable with a description and safe default.

## Out of Scope

| Feature | Reason |
|---|---|
| Embedding generation on products | M3 responsibility — requires AI service fully wired |
| Neo4j vector index creation | M3 responsibility — depends on embeddings being present |
| Spring Boot application logic | M2 responsibility |
| AI service business logic | M3 responsibility |
| Frontend pages | M5 responsibility |
| Authentication / JWT | Explicitly excluded from project scope (see PROJECT.md) |
| Real Ambev / BEES ONE data | Proprietary; synthetic data only |

---

## User Stories

### P1: Monorepo Structure and Docker Compose ⭐ MVP

**User Story:** As a developer evaluating the portfolio project, I want to clone the repo and bring up the entire system with a single command so that I can inspect a working demo without any manual environment setup.

**Why P1:** This is the foundation for every other milestone. Without working infrastructure, nothing else can be demonstrated or developed.

**Acceptance Criteria:**

1. WHEN `docker compose up` is run from the repo root THEN all five services (`postgres`, `neo4j`, `api-service`, `ai-service`, `frontend`) SHALL start and reach healthy status within 5 minutes on a machine with Docker and at least 8GB RAM.
2. WHEN `api-service` starts THEN it SHALL wait for `postgres` to pass its health check before attempting DB connection (`depends_on: condition: service_healthy`).
3. WHEN `ai-service` starts THEN it SHALL wait for `neo4j` to pass its health check before attempting graph connection.
4. WHEN `frontend` starts THEN it SHALL be accessible at `http://localhost:3000` and return HTTP 200 on the root path.
5. WHEN `api-service` starts THEN it SHALL be accessible at `http://localhost:8080/actuator/health` and return `{"status":"UP"}`.
6. WHEN `ai-service` starts THEN it SHALL be accessible at `http://localhost:3001/health` and return `{"status":"ok"}`.
7. WHEN `neo4j` starts THEN Neo4j Browser SHALL be accessible at `http://localhost:7474`.
8. WHEN `.env.example` is copied to `.env` with no modifications THEN `docker compose up` SHALL succeed in a default local development setup (no secret values required for infrastructure to start).

**Independent Test:** Run `docker compose up -d && docker compose ps` — all services show status `healthy`. Open `http://localhost:8080/actuator/health` in browser — returns `{"status":"UP"}`.

---

### P1: Monorepo Directory Structure ⭐ MVP

**User Story:** As a developer contributing to or evaluating the project, I want a clearly organized monorepo directory structure so that I can navigate to any service without confusion.

**Why P1:** Structure communicates architecture. A well-organized monorepo is itself a portfolio signal of engineering discipline.

**Acceptance Criteria:**

1. WHEN the repo is cloned THEN the root directory SHALL contain exactly: `/api-service/`, `/ai-service/`, `/frontend/`, `/infra/`, `docker-compose.yml`, `.env.example`, `README.md`, `.gitignore`.
2. WHEN `/api-service/` is inspected THEN it SHALL be a valid Maven project with `pom.xml`, `src/main/java/`, `src/test/java/`, and `Dockerfile`.
3. WHEN `/ai-service/` is inspected THEN it SHALL be a valid Node.js project with `package.json`, `tsconfig.json`, `src/`, and `Dockerfile`.
4. WHEN `/frontend/` is inspected THEN it SHALL be a valid Next.js project with `package.json`, `next.config.js`, `app/`, and `Dockerfile`.
5. WHEN `/infra/` is inspected THEN it SHALL contain `postgres/init.sql` (schema DDL) and `neo4j/init.cypher` (constraints + indexes).
6. WHEN `.gitignore` is inspected THEN it SHALL exclude: `.env`, `target/` (Maven), `node_modules/`, `.next/`, `neo4j/data/`, `postgres/data/`.

**Independent Test:** `ls -la` at repo root shows all required directories and files. `cat api-service/pom.xml` shows valid Maven POM. `cat ai-service/package.json` shows Fastify and LangChain dependencies.

---

### P1: PostgreSQL Schema and Seed ⭐ MVP

**User Story:** As a developer running the project for the first time, I want the PostgreSQL database to be automatically populated with realistic marketplace data so that I can immediately see meaningful products, clients, and orders without manual data entry.

**Why P1:** An empty database makes it impossible to demo or develop M2 (API Service). The seed data is the raw material for all AI features in M3 and M4.

**Acceptance Criteria:**

1. WHEN `postgres` container starts THEN it SHALL automatically execute `/infra/postgres/init.sql`, creating tables: `suppliers`, `countries`, `products`, `product_countries`, `clients`, `orders`, `order_items`.
2. WHEN the seed script runs THEN PostgreSQL SHALL contain at least: 50 products, 3 suppliers, 5 countries (BR, MX, CO, NL, RO), 20 clients, 100+ orders with at least 2 items each.
3. WHEN the seed script runs a second time THEN it SHALL produce no duplicates — row counts SHALL be identical to the first run (idempotent via `ON CONFLICT DO NOTHING` or equivalent).
4. WHEN a product is inserted THEN it SHALL have all required fields non-null: `id` (UUID), `name`, `description` (min 30 chars, suitable for semantic embedding), `category` (one of: `beverages`, `food`, `personal_care`, `cleaning`, `snacks`), `price` (positive decimal), `sku` (unique string), `supplier_id` (FK to suppliers).
5. WHEN a client is inserted THEN it SHALL have: `id` (UUID), `name`, `segment` (one of: `retail`, `food_service`, `wholesale`), `country_code` (FK to countries), `created_at`.
6. WHEN an order is inserted THEN it SHALL reference a valid `client_id` and contain at least one `order_item` referencing a valid `product_id` available in the client's country.
7. WHEN products are seeded THEN each of the 5 categories SHALL have at least 8 products, and each product SHALL be available in at least 1 country and at most 4 countries.

**Independent Test:** Connect to PostgreSQL (`docker exec -it postgres psql -U postgres -d marketplace`) and run: `SELECT category, COUNT(*) FROM products GROUP BY category;` — shows 5 categories with ≥8 each. `SELECT COUNT(*) FROM orders;` — shows ≥100.

---

### P1: Neo4j Graph Schema and Seed ⭐ MVP

**User Story:** As a developer working on the AI pipeline, I want Neo4j to contain a rich graph of product relationships so that embeddings, similarity search, and graph traversal all have a meaningful structure to operate on.

**Why P1:** The Neo4j schema is the backbone of M3 (embeddings + RAG) and M4 (recommendations). If the schema is wrong, all downstream work breaks.

**Acceptance Criteria:**

1. WHEN `neo4j` container starts THEN it SHALL automatically execute `/infra/neo4j/init.cypher`, creating uniqueness constraints on: `Product.id`, `Client.id`, `Category.name`, `Supplier.name`, `Country.code`.
2. WHEN the seed script completes THEN Neo4j SHALL contain nodes matching PostgreSQL: same products as `Product` nodes, same clients as `Client` nodes, all categories as `Category` nodes, all suppliers as `Supplier` nodes, all countries as `Country` nodes.
3. WHEN a `Product` node is created THEN it SHALL have properties: `id`, `name`, `description`, `sku`, `price`, `category`.
4. WHEN a `Client` node is created THEN it SHALL have properties: `id`, `name`, `segment`, `country`.
5. WHEN relationships are created THEN Neo4j SHALL contain: `(:Client)-[:BOUGHT {quantity: int, order_date: string}]->(:Product)` for every order item; `(:Product)-[:BELONGS_TO]->(:Category)`; `(:Product)-[:SUPPLIED_BY]->(:Supplier)`; `(:Product)-[:AVAILABLE_IN]->(:Country)`.
6. WHEN `MATCH (p:Product) RETURN count(p)` is executed THEN it SHALL return the same count as `SELECT COUNT(*) FROM products` in PostgreSQL.
7. WHEN `MATCH (c:Client)-[:BOUGHT]->(p:Product) RETURN count(*)` is executed THEN it SHALL return the same total as `SELECT COUNT(*) FROM order_items` in PostgreSQL.

**Independent Test:** Open Neo4j Browser at `http://localhost:7474`, run `MATCH (n) RETURN labels(n), count(n) ORDER BY count(n) DESC` — shows all 5 node types with correct counts. Run `MATCH ()-[r]->() RETURN type(r), count(r)` — shows all 4 relationship types.

---

### P2: Environment Variable Documentation

**User Story:** As a developer setting up the project, I want a complete `.env.example` file so that I know exactly what variables to configure without reading source code.

**Why P2:** Essential for usability but the system works with defaults at this milestone. Becomes critical in M3 when `OPENROUTER_API_KEY` and `EMBEDDING_MODEL` are required.

**Acceptance Criteria:**

1. WHEN `.env.example` is inspected THEN it SHALL document every environment variable consumed by any service, grouped by service section.
2. WHEN a variable has a safe default for local development THEN `.env.example` SHALL include that default value.
3. WHEN a variable requires a secret (e.g., `OPENROUTER_API_KEY`) THEN `.env.example` SHALL show an empty value with a comment explaining where to obtain it.
4. WHEN `docker compose up` is run after `cp .env.example .env` with no edits THEN infrastructure services (`postgres`, `neo4j`) SHALL start successfully (AI features that require API keys will degrade gracefully, not crash).

**Independent Test:** `cp .env.example .env && docker compose up postgres neo4j -d` — both services reach healthy status. `cat .env.example | grep -c '='` — returns ≥15 (at least 15 variables documented).

---

### P2: Seed Script Observability

**User Story:** As a developer running the seed for the first time, I want clear progress output so that I can tell if seeding is working or stuck.

**Why P2:** Improves developer experience but does not block functionality.

**Acceptance Criteria:**

1. WHEN the seed script starts THEN it SHALL log a startup message with timestamp and the target environment (e.g., `[seed] Starting — target: postgres:5432, neo4j:7687`).
2. WHEN each entity type is seeded THEN it SHALL log the count inserted (e.g., `[seed] Products: 52 inserted, 0 skipped`).
3. WHEN the seed script completes successfully THEN it SHALL log a summary with total time elapsed and total records created in each database.
4. WHEN the seed script encounters a connection error THEN it SHALL log the error with enough context to diagnose (`[seed] ERROR: Cannot connect to PostgreSQL at postgres:5432 — ECONNREFUSED`) and exit with code 1.

**Independent Test:** Run `docker compose run --rm ai-service npm run seed` — terminal shows structured progress logs and a completion summary. Run again — output shows counts with `0 skipped` replaced by counts of existing records.

---

### P3: Docker Multi-Stage Builds

**User Story:** As a developer pushing this to GitHub, I want small Docker images so that the project demonstrates production-conscious engineering practices.

**Why P3:** Nice-to-have quality signal for portfolio. Does not block any functionality.

**Acceptance Criteria:**

1. WHEN `api-service` Dockerfile is inspected THEN it SHALL use a multi-stage build: `maven:3.9-eclipse-temurin-21` for build stage, `eclipse-temurin:21-jre-alpine` for runtime stage.
2. WHEN `ai-service` Dockerfile is inspected THEN it SHALL use a multi-stage build: `node:22-alpine` for both build and runtime (single stage acceptable given Node's smaller footprint).
3. WHEN `docker images` is run after `docker compose build` THEN `api-service` image SHALL be under 300MB and `ai-service` image SHALL be under 500MB (Transformers.js model cache excluded).

**Independent Test:** `docker compose build && docker images | grep smart-marketplace` — image sizes within limits.

---

## Edge Cases

- WHEN `docker compose up` is run without a `.env` file THEN Docker Compose SHALL fail with a clear error message listing the missing required variables, not a cryptic connection error deep in the application.
- WHEN the seed script targets a Neo4j instance with existing nodes THEN it SHALL use `MERGE` (not `CREATE`) for all node creation to guarantee idempotency.
- WHEN a product description is shorter than 30 characters THEN the seed script SHALL reject it and throw an error during seed generation — not at embedding time.
- WHEN `postgres` is not yet ready when `api-service` starts THEN Spring Boot SHALL retry connection via `depends_on: condition: service_healthy` (not crash-loop).
- WHEN `neo4j` container is given insufficient memory THEN it SHALL log a clear out-of-memory warning (configure `NEO4J_server_memory_heap_max__size=512m` in compose for machines with ≤8GB RAM).
- WHEN `docker compose down -v` is run THEN all data volumes SHALL be removed, and a subsequent `docker compose up` SHALL reseed from scratch cleanly.

---

## Requirement Traceability

| Requirement ID | Story | Description | Status |
|---|---|---|---|
| M1-01 | P1: Docker Compose | All 5 services start and reach healthy | Pending |
| M1-02 | P1: Docker Compose | `api-service` depends on postgres health | Pending |
| M1-03 | P1: Docker Compose | `ai-service` depends on neo4j health | Pending |
| M1-04 | P1: Docker Compose | Frontend accessible at :3000 | Pending |
| M1-05 | P1: Docker Compose | API health endpoint at :8080/actuator/health | Pending |
| M1-06 | P1: Docker Compose | AI service health at :3001/health | Pending |
| M1-07 | P1: Docker Compose | Neo4j Browser at :7474 | Pending |
| M1-08 | P1: Monorepo Structure | Root contains required dirs and files | Pending |
| M1-09 | P1: Monorepo Structure | `api-service` is valid Maven project with Dockerfile | Pending |
| M1-10 | P1: Monorepo Structure | `ai-service` is valid Node.js project with Dockerfile | Pending |
| M1-11 | P1: Monorepo Structure | `frontend` is valid Next.js project with Dockerfile | Pending |
| M1-12 | P1: Monorepo Structure | `/infra/` contains SQL and Cypher init scripts | Pending |
| M1-13 | P1: Monorepo Structure | `.gitignore` covers all 3 runtimes | Pending |
| M1-14 | P1: PostgreSQL Seed | init.sql creates all 7 tables on startup | Pending |
| M1-15 | P1: PostgreSQL Seed | Seed produces ≥50 products, ≥20 clients, ≥100 orders | Pending |
| M1-16 | P1: PostgreSQL Seed | Seed is idempotent (no duplicates on re-run) | Pending |
| M1-17 | P1: PostgreSQL Seed | Products have ≥30-char descriptions for embedding quality | Pending |
| M1-18 | P1: PostgreSQL Seed | Orders reference products available in client's country | Pending |
| M1-19 | P1: Neo4j Seed | init.cypher creates uniqueness constraints on all 5 node types | Pending |
| M1-20 | P1: Neo4j Seed | Node counts match PostgreSQL row counts | Pending |
| M1-21 | P1: Neo4j Seed | All 4 relationship types created correctly | Pending |
| M1-22 | P1: Neo4j Seed | MERGE used (not CREATE) for idempotency | Pending |
| M1-23 | P2: Env Vars | `.env.example` documents ≥15 variables with comments | Pending |
| M1-24 | P2: Env Vars | Infrastructure starts with default values (no secrets needed) | Pending |
| M1-25 | P2: Seed Observability | Seed logs progress and summary to stdout | Pending |
| M1-26 | P2: Seed Observability | Seed exits with code 1 on connection failure | Pending |
| M1-27 | P3: Docker Builds | Multi-stage Dockerfile for `api-service` (Alpine JRE runtime) | Pending |
| M1-28 | P3: Docker Builds | `api-service` image under 300MB | Pending |

**Coverage:** 28 requirements total, 0 mapped to tasks, 28 unmapped ⚠️

---

## Success Criteria

- [ ] `docker compose up` from a fresh clone completes with all services healthy — verified by `docker compose ps` showing no unhealthy or exited containers.
- [ ] `SELECT COUNT(*) FROM products` in PostgreSQL returns ≥50.
- [ ] `MATCH (p:Product) RETURN count(p)` in Neo4j returns the same number as PostgreSQL.
- [ ] `MATCH ()-[r:BOUGHT]->() RETURN count(r)` returns ≥100 (enough purchase history for M4 model training).
- [ ] Running `npm run seed` twice produces identical database state (idempotency verified by row count comparison before and after second run).
- [ ] `.env.example` file exists with ≥15 documented variables and the project starts with it copied as-is.
