# Smart Marketplace Recommender

[![Java](https://img.shields.io/badge/Java-21-blue)](https://openjdk.org/projects/jdk/21/) [![Spring Boot](https://img.shields.io/badge/Spring_Boot-3.3-green)](https://spring.io/projects/spring-boot) [![Node.js](https://img.shields.io/badge/Node.js-22-brightgreen)](https://nodejs.org/) [![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/) [![TensorFlow.js](https://img.shields.io/badge/TensorFlow.js-4.x-orange)](https://www.tensorflow.org/js) [![Neo4j](https://img.shields.io/badge/Neo4j-5-lightblue)](https://neo4j.com/) [![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)

A **production-grade hybrid AI recommendation system** for B2B marketplaces — combining a TensorFlow.js neural network with semantic embedding search and an LLM-based RAG pipeline. Fully Dockerized, zero-cost to run, and designed to demonstrate the complete machine learning lifecycle: dataset construction, training, inference, cart-driven profile updates, and visible retraining with before/after comparison.

---

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Quickstart](#quickstart)
- [Neural Network Architecture](#neural-network-architecture)
- [Neural architecture benchmark (CLI)](#neural-architecture-benchmark-cli)
- [Dataset Construction & Training Quality](#dataset-construction--training-quality)
- [Hybrid Scoring Engine](#hybrid-scoring-engine)
- [M17 — Recency-aware profile & ranking](#m17--recency-aware-profile--ranking)
- [RAG Pipeline](#rag-pipeline)
- [Service Communication Patterns](#service-communication-patterns)
- [Async Training: 202 + Polling Pattern](#async-training-202--polling-pattern)
- [Model Versioning & Rollback](#model-versioning--rollback)
- [Production-Grade Patterns](#production-grade-patterns)
- [Frontend: 4-State AI Learning Showcase](#frontend-4-state-ai-learning-showcase)
- [State Management](#state-management)
- [API Reference](#api-reference)
- [Model Observability](#model-observability)
- [Tech Stack Decision Summary](#tech-stack-decision-summary)
- [Architecture Decision Records](#architecture-decision-records)

---

## Overview

Smart Marketplace Recommender solves the cold-start and relevance problems in B2B marketplace recommendation — where traditional collaborative filtering fails because purchase history is sparse and product descriptions matter as much as behavioral patterns.

The system combines three complementary signals:

| Signal | Source | Weight |
|--------|--------|--------|
| Neural purchase behavior | TF.js dense model trained on purchase history | 60% |
| Semantic similarity | Cosine similarity of HuggingFace embeddings | 40% |
| Natural language | LLM-grounded RAG over Neo4j vector store | — |

The frontend demonstrates the **full ML lifecycle** in a single interactive session: select a client → see initial recommendations → simulate purchases → observe real-time profile update → trigger full model retrain → compare before/after quality metrics.

---

## System Architecture

```mermaid
graph TB
    User([👤 Evaluator / User])

    subgraph "Frontend — Next.js 14 :3000"
        FE["🌐 Next.js App Router\nCatalog · Analysis · RAG Chat\n4-column AI showcase panel"]
        PROXY["⚙️ API Proxy Routes\n/api/proxy/*\nCORS bridge to services"]
    end

    subgraph "api-service — Spring Boot 3.3 :8080"
        CTRL["📝 REST Controllers\nProducts · Clients · Orders"]
        SVC["⚙️ Application Services\nCaffeine cache (5min TTL)\nCircuit Breaker (Resilience4j)"]
        ASYNC["🔄 AiSyncClient\nVirtual Thread fire-and-forget\nJava 21 Thread.ofVirtual()"]
        PG[("💾 PostgreSQL 16\nProducts · Clients\nOrders · Suppliers")]
    end

    subgraph "ai-service — Fastify 4 + TF.js :3001"
        direction TB
        EMB["🧠 EmbeddingService\n@xenova/transformers\nall-MiniLM-L6-v2 (384d)\nlocal, no API cost"]
        TRAINER["⚙️ ModelTrainer\nDense[64,L2]→Dropout[0.2]→Dense[1]\nEPOCHS=30 BATCH=16\nnegative sampling N=4\nhard negative mining\nsoft negative exclusion (ADR-031+032)"]
        REGISTRY["📋 TrainingJobRegistry\nsetImmediate async\n202+polling pattern"]
        VSTORE["💾 VersionedModelStore\ntimestamp + symlink /current\nprecisionAt5 promotion gate"]
        CRON["⏰ CronScheduler\nnode-cron 02:00 daily\nauto-retrain"]
        RECSVC["🎯 RecommendationService\nbatch tensor predict\nhybrid score 0.6×neural+0.4×semantic"]
        SEARCH["🔍 SearchService\nNeo4jVectorStore cosine"]
        RAG["💬 RAGService\nLangChain + OpenRouter\nMistral-7B-Instruct free"]
        NEO[("🗄️ Neo4j 5\nProduct · Client · Category\nSupplier · Country nodes\nBOUGHT · BELONGS_TO edges\nvector index 384d cosine")]
    end

    User -->|Browser| FE
    FE -->|REST| PROXY
    PROXY -->|REST :8080| CTRL
    PROXY -->|REST :3001| RECSVC
    PROXY -->|REST :3001| SEARCH
    PROXY -->|REST :3001| RAG
    PROXY -->|REST :3001| REGISTRY

    CTRL --> SVC
    SVC --> PG
    SVC -->|Circuit Breaker| RECSVC
    ASYNC -->|POST /embeddings/sync-product| EMB

    TRAINER --> NEO
    TRAINER --> EMB
    RECSVC --> NEO
    RECSVC --> VSTORE
    SEARCH --> NEO
    RAG --> NEO
    RAG --> EMB
    REGISTRY --> TRAINER
    REGISTRY --> VSTORE
    CRON --> REGISTRY
    VSTORE --> NEO

    classDef frontend fill:#FFE66D,stroke:#F08C00,color:#000,stroke-width:2px
    classDef apiservice fill:#4ECDC4,stroke:#0B7285,color:#fff,stroke-width:2px
    classDef aiservice fill:#95E1D3,stroke:#087F5B,color:#000,stroke-width:2px
    classDef database fill:#A8DADC,stroke:#1864AB,color:#000,stroke-width:2px
    classDef user fill:#F38181,stroke:#C92A2A,color:#fff,stroke-width:2px

    class FE,PROXY frontend
    class CTRL,SVC,ASYNC apiservice
    class EMB,TRAINER,REGISTRY,VSTORE,CRON,RECSVC,SEARCH,RAG aiservice
    class PG,NEO database
    class User user
```

**5 Docker services:** `postgres`, `neo4j`, `api-service`, `ai-service`, `frontend` — all with health checks. `ai-service` health is readiness-based (`/ready`), and `api-service` waits for `ai-service` startup (`service_started`) to avoid compose startup cycles while AI self-healing runs.

> **Cold-start self-sufficient:** `docker compose up` on a completely empty environment (including `docker compose down -v`) automatically seeds both databases, generates embeddings, trains the model, and reaches `/ready = 200` — no manual intervention required. See [boot flow diagram](docs/diagrams/cold-start-boot-flow.md).

---

## Quickstart

```bash
git clone git@github.com:gabrielgrillorosa/smart-marketplace-recommender.git
cd smart-marketplace-recommender
cp .env.example .env
docker compose up -d
```

The system is ready when `docker compose ps` shows all services as `healthy`.

**The system is fully self-sufficient on any clean startup:**
- On first boot (empty volumes), `ai-service` automatically seeds PostgreSQL and Neo4j, then generates embeddings and trains the model — no manual seed command required.
- On subsequent boots (volumes present), seeding is skipped and the existing model is reloaded in seconds. When `AUTO_HEAL_MODEL=true`, **StartupRecovery still runs after `listen()`**: it fills **any missing Neo4j product embeddings** even if a model file is already on disk, then **skips retrain** if that model loaded successfully — preventing “model volume + empty embedding graph” drift.

```bash
# Track cold-start progress
docker compose logs -f ai-service
# Look for: [AutoSeed] complete → [StartupRecovery] Filling N product(s) missing embeddings (optional) → training or “skipped retrain” → /ready = 200
```

```bash
# Open the demo UI
xdg-open http://localhost:3000 2>/dev/null || open http://localhost:3000
```

> **Persistent data** — The trained neural model, PostgreSQL database, and Neo4j graph are stored in named Docker volumes (`ai-model-data`, `postgres_data`, `neo4j_data`). They survive `docker compose down`. Use `docker compose down -v` **only** for a full environment reset.

### Managing the environment

```bash
docker compose stop          # Stop services, preserve all data
docker compose down          # Stop and remove containers, preserve volumes
docker compose up -d         # Restart after stop
docker compose down -v       # Full reset — deletes model, data, and graph
```

### Startup Self-Healing Flow (M12 + ADR-052)

The complete boot sequence handles both cold-start (empty databases) and warm-start (existing data):

```mermaid
flowchart TD
    BOOT([🚀 ai-service boot]) --> LOAD_EMB["📦 Load embedding model"]
    LOAD_EMB --> SEED_CHECK{"AUTO_SEED_ON_BOOT=true\nAND databases empty?"}
    SEED_CHECK -->|"Yes — cold start"| AUTOSEED["🌱 AutoSeedService.runIfNeeded()\nPostgreSQL + Neo4j seeded\n~5s for 52 products"]
    SEED_CHECK -->|"No — data present"| LOAD["📂 loadCurrent()"]
    AUTOSEED --> LOAD
    LOAD --> LISTEN["🌐 fastify.listen()"]
    LISTEN --> FLAG{"AUTO_HEAL_MODEL=true?"}
    FLAG -->|No| HEAL_OFF["⏸️ StartupRecovery not scheduled\n/ready = embedReady ∧ modelPresent\n(operator handles cold path manually)"]
    FLAG -->|Yes| MISS["🔎 Neo4j: products\nwithout embedding?"]
    MISS -->|Some missing| GEN["🧠 generateEmbeddings()\nblocks /ready during run"]
    MISS -->|None missing| GATE["➡️"]
    GEN --> GATE
    GATE --> HAS_MODEL{"Model already loaded\nfrom disk?"}
    HAS_MODEL -->|Yes| SKIP_TRAIN["✅ Skip probe + retrain\nembedding gap-fill only"]
    HAS_MODEL -->|No| PROBE["📊 probe training data\n(Cache-Control: no-cache →\nbypasses api-service cache)"]
    SKIP_TRAIN --> READY_OK["✅ /ready = 200\nwhen embedding warm +\nrecovery not blocking"]
    PROBE --> DATA{"Trainable data available?"}
    DATA -->|No| BLOCKED["⚠️ blocked/no-training-data\n/health=200 /ready=503"]
    DATA -->|Yes| JOB["⚙️ reuse active job or enqueue"]
    JOB --> WAIT["⌛ waitFor(jobId)"]
    WAIT --> MODEL_OK{"Model present after job?"}
    MODEL_OK -->|No| FAIL["❌ blocked/training-failed\n/ready=503"]
    MODEL_OK -->|Yes| READY_OK

    classDef process fill:#87CEEB,stroke:#333,stroke-width:2px,color:#002244
    classDef seed fill:#95E1D3,stroke:#087F5B,stroke-width:2px,color:#003300
    classDef decision fill:#FFE66D,stroke:#333,stroke-width:2px,color:#1F1F1F
    classDef success fill:#90EE90,stroke:#333,stroke-width:2px,color:#003300
    classDef warning fill:#FFD1A9,stroke:#333,stroke-width:2px,color:#5A2D00
    classDef failure fill:#FFB6C1,stroke:#333,stroke-width:2px,color:#5A0015

    class BOOT,LOAD_EMB,LOAD,LISTEN,GEN,GATE,PROBE,JOB,WAIT,SKIP_TRAIN process
    class AUTOSEED seed
    class SEED_CHECK,FLAG,DATA,HAS_MODEL,MODEL_OK decision
    class READY_OK success
    class HEAL_OFF,BLOCKED warning
    class FAIL failure
```

> Full sequence with timing details: [docs/diagrams/cold-start-boot-flow.md](docs/diagrams/cold-start-boot-flow.md)

---

## Neural Network Architecture

### Model Design

```mermaid
graph LR
    subgraph "Input (768 dims)"
        PE["📦 Product Embedding\n384 dims\nall-MiniLM-L6-v2"]
        CP["👤 Client Profile Vector\n384 dims\nmean pooling of\npurchased product embeddings"]
    end

    CONCAT["⊕ Concatenate\n768 dims"]

    subgraph "Network"
        D1["Dense 64\nrelu + L2(1e-4)\n~25k params"]
        DROP["Dropout 0.2\nregularization"]
        D2["Dense 1\nsigmoid\nbinary classifier"]
    end

    PE --> CONCAT
    CP --> CONCAT
    CONCAT --> D1
    D1 --> DROP
    DROP --> D2
    D2 -->|"neuralScore ∈ [0,1]"| OUT["🎯 Buy Probability"]

    classDef input fill:#FFE66D,stroke:#F08C00,color:#000,stroke-width:2px
    classDef layer fill:#4ECDC4,stroke:#0B7285,color:#fff,stroke-width:2px
    classDef output fill:#95E1D3,stroke:#087F5B,color:#000,stroke-width:2px

    class PE,CP input
    class D1,DROP,D2 layer
    class OUT output
```

**Architecture decisions (ADR-028):**

- **Reduced architecture** — moved from `Dense[256→128→64→1]` (~65k params) to `Dense[64→1]` (~25k params). The previous ratio of ~60:1 (params:samples) caused severe overfitting; the new ~39:1 ratio with L2 regularization enables genuine generalization.
- **L2 regularization** `1e-4` on the dense layer — prevents memorization of the small synthetic dataset.
- **Dropout 0.2** — additional regularization guard.
- **EPOCHS=30, BATCH_SIZE=16** — compensates for the smaller dataset produced by selective negative sampling.
- **classWeight `{0: 1.0, 1: 4.0}`** — the dataset has ~1:4 positive:negative ratio after sampling. Without compensation, the network minimizes loss by predicting "not bought" for everything. The 4× weight on positives forces the gradient to prioritize purchase signals.
- **Early stopping patience=5** — halts training when validation loss stops improving, avoiding wasted epochs.

### Client Profile Vector

Each client is represented as the **mean pooling** of all purchased product embeddings:

```
clientProfileVector = mean([embed(product_1), embed(product_2), ..., embed(product_n)])
```

This creates a dense 384-dimensional representation of the client's taste in embedding space — far more expressive than one-hot encoding. Purchasing a new product incrementally shifts the profile vector in the direction of that product's semantic neighborhood.

### Batch Prediction (ADR-007)

All candidate products are scored in a **single TF.js forward pass** using batched tensor operations:

```typescript
// One predict call for all candidates — not N serial calls
const batchTensor = tf.tensor2d(allVectors, [candidates.length, 768])
const scores = model.predict(batchTensor) as tf.Tensor
const scoreArray = scores.dataSync()  // Float32Array, sync-safe in tfjs-node
```

This reduces recommendation latency from ~500ms–2s (serial) to ~20–50ms (batched) for a typical 30–100 product candidate pool.

### Atomic Model Swap (ADR-006)

`ModelStore` is the single source of truth for the trained model in memory. Training completes fully before `setModel()` is called — a single synchronous JavaScript reference assignment that is atomic in the Node.js event loop. In-flight `/recommend` requests hold the old model reference for their duration via closure; the next request picks up the new model. Zero-downtime model replacement with no mutex needed.

---

## Neural architecture benchmark (CLI)

Offline script in **`ai-service`** to compare alternative **dense** heads (extra hidden layers / widths) against the **production baseline** (`Dense[64,L2] → Dropout → Dense[1]`, ADR-028) using the **same** training data pipeline as `ModelTrainer`: HTTP fetch from `api-service`, embeddings from Neo4j, `buildTrainingDataset()` with the same negative sampling and seeds.

**What it does not do:** start the Fastify server, call `POST /model/train`, or overwrite the deployed model under `/tmp/model`. Each candidate architecture is trained in memory, evaluated, and disposed.

### Prerequisites

- **`api-service`** reachable (default local: `http://127.0.0.1:8080`).
- **Neo4j** reachable with product embeddings (default local: `bolt://127.0.0.1:7687`; compose defaults often use user `neo4j` / password `password123` — match your `.env`).
- Environment variables: **`API_SERVICE_URL`**, **`NEO4J_URI`**, **`NEO4J_USER`**, **`NEO4J_PASSWORD`**.

### How to run

From `smart-marketplace-recommender/ai-service`:

```bash
export API_SERVICE_URL=http://127.0.0.1:8080
export NEO4J_URI=bolt://127.0.0.1:7687
export NEO4J_USER=neo4j
export NEO4J_PASSWORD=password123   # or value from your .env

npm run benchmark:neural-arch
```

The npm script runs **`npm run build`** then **`node dist/scripts/neural-arch-benchmark-cli.js`** so Node resolves compiled `.js` imports correctly (running the `.ts` entry with `ts-node` alone can fail on `*.js` import paths).

**Optional flags** (after `--`):

| Flag | Description |
|------|-------------|
| `--out <path>` | Write the full JSON report to a file (parent directories are created). |
| `--profiles <list>` | Comma-separated subset: `baseline`, `deep64_32`, `deep128_64`. Default: all three. |
| `--val-fraction <n>` | Fraction in `(0,1)` for stratified train/validation split on labeled rows. Default: `0.2`. |

Example with artifact file and two profiles only:

```bash
npm run benchmark:neural-arch -- --out ./.benchmarks/nn-arch.json --profiles baseline,deep128_64
```

### Architectures compared

| Profile | Stack (before sigmoid) | Role |
|---------|------------------------|------|
| `baseline` | 64 → Dropout(0.2) → 1 | Current production head (`buildNeuralModel('baseline')` in `ModelTrainer`). |
| `deep64_32` | 64 → Dropout → 32 → Dropout → 1 | One extra narrow hidden layer. |
| `deep128_64` | 128 → Dropout(0.25) → 64 → Dropout → 1 | Wider + deeper (watch **params : samples** ratio vs ADR-028). |

Implementation: `ai-service/src/ml/neuralModelFactory.ts`. Orchestration and metrics: `ai-service/src/benchmark/neuralArchBenchmark.ts` (`runNeuralArchBenchmark`). Entrypoint: `ai-service/src/scripts/neural-arch-benchmark-cli.ts`.

### Report shape (JSON)

Top-level fields include **`generatedAt`**, **`gitCommit`** (if `git rev-parse` works from `cwd` or `../..`), **`apiServiceUrl`**, **`dataCounts`** (clients / products / orders), **`hyperparams`** (epochs, batch size, class weights, val fraction), and **`runs`**: one object per profile.

Per run, useful fields for decisions:

- **`trainableParams`**, **`trainingSamples`**, **`paramSampleRatio`** — capacity vs dataset size (contrast with ADR-028).
- **`finalValLoss`**, **`finalValAccuracy`**, **`trainValLossGap`** — training uses the same `classWeight` as production; **early stopping monitors `val_loss`** (unlike the HTTP trainer, which still keys off training loss).
- **`valMetrics`**: **`aucRoc`**, **`aucPr`**, **`brier`**, **`accuracyAt05`** on the held-out stratified validation rows (binary `(client, product)` labels).
- **`precisionAt5`**: same **ranking** protocol as training-time evaluation (temporal split on purchase list per client, top-5 among non-train products).

**How to read results:** strong **`valMetrics`** but lower **`precisionAt5`** on deeper models often means the pointwise classifier improved while **list-wise ranking** that matters for `/recommend` did not — keep the baseline until an ADR records a deliberate switch and hybrid weights are revisited (see ADR-016).

---

## Dataset Construction & Training Quality

The training dataset is built by `buildTrainingDataset()` — a pure function in `training-utils.ts` that applies four layers of quality control before a single sample reaches the model.

### Negative Sampling Pipeline (ADR-027 + ADR-031 + ADR-032)

```mermaid
flowchart TD
    START([All Products]) --> FILTER1["Remove already purchased\nby this client"]
    FILTER1 --> FILTER2["ADR-031: Remove soft negatives\nby brand — same category+supplier\nas any positive product"]
    FILTER2 --> FILTER3["ADR-032: Remove soft negatives\nby cosine similarity —\nmaxCosineSim(candidate, any_positive)\n> SOFT_NEGATIVE_SIM_THRESHOLD (default 0.65)"]
    FILTER3 --> POOL["Negative Pool\n(clean negatives only)"]
    POOL --> MINE["Hard Negative Mining\n≥2 negatives from different\ncategory than positive\nper slot N=4"]
    MINE --> SAMPLE["Final Dataset\nnegativeSamplingRatio: 4\n(1 positive : 4 negatives)"]
    SAMPLE --> SEED["Deterministic seed\nderived from clientId hash\nreproducible across retrains"]

    classDef filter fill:#FFE66D,stroke:#F08C00,color:#000,stroke-width:2px
    classDef pool fill:#4ECDC4,stroke:#0B7285,color:#fff,stroke-width:2px
    classDef output fill:#95E1D3,stroke:#087F5B,color:#000,stroke-width:2px

    class FILTER1,FILTER2,FILTER3 filter
    class POOL,MINE pool
    class SAMPLE,SEED output
```

### Why Soft Negative Exclusion Matters

**The problem (False Negative Contamination):** Suppose a client buys 3 products from `food/Unilever`. The model sees `Knorr Pasta Sauce` (also `food/Unilever`, not yet purchased) as a "negative example." With `classWeight: {0:1, 1:4}`, the amplified gradient teaches the network to actively predict against `food/Unilever` products. After retraining, `Knorr Pasta Sauce` score drops from 64% → 42% — the opposite of the desired learning signal.

This is formally known as **False Negative Contamination**, documented in ANCE (Approximate Nearest Neighbor Negative Contrastive Estimation) and Debiased Contrastive Learning (NeurIPS 2020). The same exclusion practice is used in YouTube (2016, impression-based negatives), Pinterest (in-batch negatives), and Amazon (BERT4Rec).

**Two complementary filters are applied additively:**

**ADR-031 — Exclusion by (category + supplier):** Deterministic, zero-hyperparameter. Products sharing `category AND supplierName` with any purchased product are excluded from the negative pool. O(1) lookup per candidate.

```typescript
const positiveCategorySupplierPairs = new Set(
  positiveProducts.map(p => `${p.category}::${p.supplierName}`)
)
const softPositiveIdsByBrand = new Set(
  candidates.filter(p =>
    positiveCategorySupplierPairs.has(`${p.category}::${p.supplierName}`)
  ).map(p => p.id)
)
```

**ADR-032 — Exclusion by cosine similarity (ANCE-simplified):** Catches products from different suppliers in the same category that are semantically close in embedding space (e.g., `food/Nestlé` after purchases of `food/Unilever` — soups, sauces, and broths share similar descriptions). If `maxCosineSimilarity(candidate, any_positive) > SOFT_NEGATIVE_SIM_THRESHOLD`, the candidate is excluded.

```typescript
const threshold = parseFloat(process.env.SOFT_NEGATIVE_SIM_THRESHOLD ?? '0.65')
const softPositiveIdsBySimilarity = new Set(
  candidatesAfterBrandFilter.filter(candidate => {
    const cEmb = productEmbeddingMap.get(candidate.id)!
    return positiveProducts.some(pos =>
      cosineSimilarity(cEmb, productEmbeddingMap.get(pos.id)!) > threshold
    )
  }).map(p => p.id)
)
```

`SOFT_NEGATIVE_SIM_THRESHOLD` is an env var (default `0.65`) — adjustable to demonstrate pedagogically that **data quality hyperparameters have the same impact as model hyperparameters**.

### Hard Negative Mining (ADR-027)

After soft negative exclusion, at least 2 of the 4 negative slots per positive are filled with products from **different categories** than the positive. This forces the network to learn inter-category discrimination — without it, category-specific purchase signals (e.g., "client likes beverages") are diluted by unrelated negatives.

### Deterministic Seed

The negative sampling seed is derived from the `clientId` hash. Every retrain with the same data produces identical datasets per client — making before/after comparisons reproducible and demo behavior predictable.

---

## Hybrid Scoring Engine

```mermaid
graph LR
    subgraph "For each candidate product"
        NS["🧠 Neural Score\nmodel.predict(productEmb ⊕ clientProfileVec)\nlearned from purchase history"]
        SS["📐 Semantic Score\ncosineSimilarity(productEmb, clientProfileVec)\nalways available — no training needed"]
    end

    NS -->|"× 0.6"| FS["🎯 Final Score\n0.6 × neuralScore\n+ 0.4 × semanticScore"]
    SS -->|"× 0.4"| FS

    FS --> RANK["Sort descending\nfiltered by client country\nexclude already purchased"]

    classDef score fill:#FFE66D,stroke:#F08C00,color:#000,stroke-width:2px
    classDef output fill:#4ECDC4,stroke:#0B7285,color:#fff,stroke-width:2px

    class NS,SS score
    class FS,RANK output
```

**Why hybrid is better than neural-only (ADR-016, validated by Technical Committee):**

| Scenario | Neural Only | Hybrid |
|----------|-------------|--------|
| Small / sparse dataset | ❌ High variance, overfitting | ✅ Semantic anchors predictions |
| Cold start (1–2 purchases) | ❌ Unstable profile vector | ✅ Semantic compensates |
| New product added post-training | ❌ Score ≈ 0 (unseen) | ✅ Embedding captures meaning |
| Container restart | ❌ Depends on saved model | ✅ Semantic is deterministic |
| Interpretability | ❌ Black box | ✅ `matchReason` exposes origin |

Weights are configurable via `NEURAL_WEIGHT` and `SEMANTIC_WEIGHT` env vars. The current 60/40 split was evaluated by a three-expert committee using Tree-of-Thought + Self-Consistency reasoning.

**`matchReason` field** in recommendation responses tells the client which signal dominated: `neural` | `semantic` | `hybrid`.

---

## M17 — Recency-aware profile & ranking

Milestone **[M17](.specs/features/m17-phased-recency-ranking-signals/spec.md)** rolls out recency in **orthogonal phases** ([ADR-062](.specs/features/m17-phased-recency-ranking-signals/adr-062-phased-recency-ranking-signals.md)): **P1** re-ranks candidates after the hybrid score; **P2** changes how the **client profile vector** is built so training and inference stay aligned ([ADR-065](.specs/features/m17-phased-recency-ranking-signals/adr-065-m17-p2-shared-profile-pooling-and-temporal-alignment.md)). Score transparency for the UI lives in [ADR-063](.specs/features/m17-phased-recency-ranking-signals/adr-063-score-breakdown-api-and-product-detail-modal.md) / [ADR-064](.specs/features/m17-phased-recency-ranking-signals/adr-064-rankingconfig-zustand-recommendation-slice.md). **Phase 3** (temporal attention inside the MLP) is planned, not implemented yet.

Operational detail and env defaults: [`ai-service/README.md`](ai-service/README.md).

### Where the two mechanisms sit in the pipeline

```mermaid
flowchart LR
    subgraph P2["M17 P2 — profile vector p"]
        HIST["📦 Confirmed purchases\nembedding + lastPurchase"]
        CART["🛒 Cart items\nΔ = 0 days"]
        AGG["⚙️ aggregateClientProfileEmbeddings\nmean | exp"]
        HIST --> AGG
        CART --> AGG
    end

    subgraph Hybrid["Hybrid (unchanged formula)"]
        N["🧠 neuralScore"]
        S["📐 semanticScore"]
        FS["finalScore = w_n·N + w_s·S"]
        N --> FS
        S --> FS
    end

    subgraph P1["M17 P1 — re-rank (optional)"]
        ANC["📌 Anchor embeddings\nlast N confirmed buys"]
        RS["rankScore = finalScore\n+ w_r · max_k cos(cand, anchor_k)"]
        ANC --> RS
    end

    AGG -->|"p feeds concat + cosine"| Hybrid
    FS --> RS
    RS --> OUT["📋 Sorted eligible list"]

    classDef p2 fill:#95E1D3,stroke:#087F5B,stroke-width:2px,color:#002211
    classDef hyb fill:#FFE66D,stroke:#F08C00,stroke-width:2px,color:#1F1F1F
    classDef p1 fill:#A8DADC,stroke:#1864AB,stroke-width:2px,color:#0B1F33
    classDef out fill:#90EE90,stroke:#2F6B2F,stroke-width:2px,color:#003300

    class HIST,CART,AGG p2
    class N,S,FS hyb
    class ANC,RS p1
    class OUT out
```

### P2 — Exponential profile pooling (`PROFILE_POOLING_MODE=exp`)

The **client profile** is the vector **p** passed into the MLP (concatenated with each candidate embedding) and into **semantic** cosine similarity. Implementation is a **single** TypeScript function shared by **training dataset construction**, **`POST /recommend`**, **`POST /recommend/from-cart`**, and offline **`precisionAtK`** — `aggregateClientProfileEmbeddings` in `ai-service/src/profile/clientProfileAggregation.ts` ([ADR-065](.specs/features/m17-phased-recency-ranking-signals/adr-065-m17-p2-shared-profile-pooling-and-temporal-alignment.md)).

| Mode | Behaviour |
|------|-----------|
| **`mean`** (default) | Arithmetic mean of distinct purchase embeddings — legacy behaviour, uniform weight over history. |
| **`exp`** | Weighted mean: each purchase *i* has age Δ*i* days vs a reference instant; **`w_i = exp(−Δ_i / τ)`** with **τ = H / ln 2** and **H** = `PROFILE_POOLING_HALF_LIFE_DAYS`. Recent purchases weigh more in **p**; cart lines use **Δ = 0** so current intent stays maximal weight. |

**Training vs inference:** training uses order timestamps from the **API snapshot** and per-client **T_ref = max(order dates)** in that snapshot; at request time, inference uses **Neo4j** `lastPurchase` per SKU and **T_ref = request clock (UTC)**. Switching to **`exp`** changes gradients — **retrain** the MLP before expecting offline/online metrics to match.

### P1 — Recency re-rank boost (`RECENCY_RERANK_WEIGHT` > 0)

After **finalScore**, eligible candidates are sorted primarily by **rankScore**:

`rankScore = finalScore + RECENCY_RERANK_WEIGHT × recencySimilarity`

- **Anchors:** up to **`RECENCY_ANCHOR_COUNT`** distinct **confirmed** purchases (non-demo `BOUGHT`, `order_date` set, embedding present), most recent first.
- **recencySimilarity:** **maximum** cosine similarity between the candidate product embedding and each anchor embedding (session-like “similar to something I recently bought”).

When **`RECENCY_RERANK_WEIGHT = 0`** (default), no anchor query runs and ordering follows **finalScore** (plus tie-breaks). When the boost is on, consumers must **not** re-sort eligible rows by `finalScore` alone — use server **order** or **`rankScore`**.

### API envelope (`rankingConfig` + breakdown)

Successful `POST /api/v1/recommend` and `POST /api/v1/recommend/from-cart` return **`rankingConfig`**: `neuralWeight`, `semanticWeight`, `recencyRerankWeight`, and optional P2 fields `profilePoolingMode`, `profilePoolingHalfLifeDays`. Ranked rows may include **`hybridNeuralTerm`**, **`hybridSemanticTerm`**, **`recencyBoostTerm`**, and when P1 is active **`recencySimilarity`** / **`rankScore`** for the score modal.

### Configure (`.env` / compose)

See [`.env.example`](.env.example): **`RECENCY_RERANK_WEIGHT`**, **`RECENCY_ANCHOR_COUNT`**, **`PROFILE_POOLING_MODE`**, **`PROFILE_POOLING_HALF_LIFE_DAYS`**.

**M21 (ai-service):** optional **`NEURAL_LOSS_MODE`** (`bce` default, `pairwise` for ranking-style training). Training mode is read at **service startup**; **inference** uses the **`neural-head.json`** sidecar next to the saved model (see [`ai-service/README.md`](ai-service/README.md) — diagram and test checklist).

---

## RAG Pipeline

```mermaid
sequenceDiagram
    participant U as 👤 User
    participant FE as 🌐 Frontend
    participant AI as ⚙️ ai-service
    participant EMB as 🧠 EmbeddingService
    participant NEO as 🗄️ Neo4j
    participant LLM as 💬 OpenRouter LLM

    U->>FE: Natural language query
    FE->>AI: POST /api/v1/rag/query
    AI->>EMB: embedText(query)
    EMB-->>AI: queryVector [384d]
    AI->>NEO: vector similarity search\ntopK=5, score > 0.5
    NEO-->>AI: relevant Product nodes\nwith similarity scores
    AI->>LLM: prompt = context + query\n(Mistral-7B-Instruct free tier)
    LLM-->>AI: grounded answer + sources
    AI-->>FE: { answer, sources[] }
    FE-->>U: Answer with product references

    note over NEO: Neo4j native vector index\n384 dims, cosine similarity\n— no separate vector DB needed
```

- **Embedding model:** `sentence-transformers/all-MiniLM-L6-v2` via `@xenova/transformers` — runs fully locally, zero API cost
- **Vector store:** Neo4j 5 native vector indexes — graph relationships and vector search in one database, no Pinecone/Weaviate needed
- **LLM:** OpenRouter free tier (`mistralai/mistral-7b-instruct:free`) — zero cost
- **Prompt engineering:** Grounded answers only; explicit "not found" response when context is insufficient; supports pt-BR and English

---

## Service Communication Patterns

### Inter-Service Call Map

```mermaid
graph TB
    subgraph "Browser"
        FE["🌐 Next.js Frontend"]
    end

    subgraph "Next.js API Proxy Routes"
        P1["/api/proxy/recommend"]
        P2["/api/proxy/model/train"]
        P3["/api/proxy/model/status"]
        P4["/api/proxy/model/train/status/[jobId]"]
        P5["/api/proxy/search/semantic"]
        P6["/api/proxy/rag/query"]
    end

    subgraph "api-service :8080"
        API_CTRL["📝 ProductController\nClientController"]
        API_CB["⚡ Circuit Breaker\nResilience4j\nfallback: top-sellers"]
        API_SYNC["🔄 AiSyncClient\nVirtual Thread\nfire-and-forget"]
        API_CACHE["💾 Caffeine Cache\n5min TTL catalogList\n1min TTL fallback"]
    end

    subgraph "ai-service :3001"
        AI_REC["🎯 /recommend\nhybrid scoring"]
        AI_TRAIN["📋 /model/train\n202 + jobId"]
        AI_STATUS["📊 /model/status"]
        AI_POLL["🔍 /model/train/status/:jobId"]
        AI_SEARCH["🔍 /search/semantic"]
        AI_RAG["💬 /rag/query"]
        AI_SYNC["🔗 /embeddings/sync-product\nno auth required"]
    end

    FE -->|REST| P1 & P2 & P3 & P4 & P5 & P6
    FE -->|REST :8080| API_CTRL

    P1 -->|POST| AI_REC
    P2 -->|POST + X-Admin-Key| AI_TRAIN
    P3 -->|GET| AI_STATUS
    P4 -->|GET + polling| AI_POLL
    P5 -->|POST| AI_SEARCH
    P6 -->|POST| AI_RAG

    API_CTRL --> API_CACHE
    API_CTRL --> API_CB
    API_CB -->|WebClient| AI_REC
    API_SYNC -->|Thread.ofVirtual| AI_SYNC

    classDef frontend fill:#FFE66D,stroke:#F08C00,color:#000,stroke-width:2px
    classDef proxy fill:#F38181,stroke:#C92A2A,color:#fff,stroke-width:2px
    classDef apiservice fill:#4ECDC4,stroke:#0B7285,color:#fff,stroke-width:2px
    classDef aiservice fill:#95E1D3,stroke:#087F5B,color:#000,stroke-width:2px

    class FE frontend
    class P1,P2,P3,P4,P5,P6 proxy
    class API_CTRL,API_CB,API_SYNC,API_CACHE apiservice
    class AI_REC,AI_TRAIN,AI_STATUS,AI_POLL,AI_SEARCH,AI_RAG,AI_SYNC aiservice
```

### Circuit Breaker — API Service → AI Service (Resilience4j)

The `api-service` recommendation proxy (`GET /api/v1/recommend/{clientId}`) wraps the call to `ai-service` with a **Resilience4j circuit breaker**. If `ai-service` is unavailable or slow, the fallback returns top-selling products by country from a short-TTL Caffeine cache (1-minute TTL), ensuring the API never returns an error to the frontend due to AI service downtime.

### Fire-and-Forget Product Sync — Java Virtual Threads (ADR-015)

When a new product is created via `POST /api/v1/products`, the `api-service` must notify the `ai-service` to create the Neo4j node and generate its embedding — without blocking the 201 response.

**Choice: `Thread.ofVirtual()` (Java 21) over Reactor `WebClient.subscribe()`**

```java
public void notifyProductCreated(ProductDetailDTO product) {
    Thread.ofVirtual()
        .name("ai-sync-" + product.id())
        .start(() -> {
            try {
                // POST /embeddings/sync-product
                httpClient.send(request, HttpResponse.BodyHandlers.discarding());
            } catch (Exception e) {
                log.warn("[AiSync] failed for productId={}: {}", product.id(), e.getMessage());
            }
        });
}
```

Why not Reactor: this is a servlet-stack project. Using `.subscribe()` would mix two threading models at a call site that reads synchronously to the developer (CUPID-I violation). Virtual threads are semantically obvious, visible in thread dumps via JFR/VisualVM, and testable with standard Mockito — no `CountDownLatch` tricks needed.

### Caffeine In-Memory Cache — API Service (ADR-003)

Programmatic `CaffeineCacheManager` configuration with two named caches and different TTLs:

| Cache | TTL | Key dimensions | Eviction |
|-------|-----|----------------|---------|
| `catalogList` | 5 min | page + size + category + country + supplier + search | `@CacheEvict(allEntries=true)` on product create |
| `fallbackRecommendations` | 1 min | country | Independent — circuit breaker fallback |

`recordStats()` enabled — cache hit/miss rates exposed automatically via Micrometer at `/actuator/metrics`.

### Training Read Cache Bypass (ADR-052)

`ModelTrainer` always sends `Cache-Control: no-cache` when fetching training data from `api-service`.
This prevents cold-start cache poisoning: if `api-service` became healthy before the seed completed,
it could cache an empty product list for 5 minutes — starving the training pipeline.

The `api-service` side wires the header into the `@Cacheable` condition:

```java
// ProductController — reads Cache-Control header
boolean noCache = isCacheBypass(cacheControl);   // true for "no-cache" or "no-store"
productService.listProducts(..., noCache);

// ProductApplicationService — @Cacheable is skipped when noCache=true
@Cacheable(value = "catalogList", condition = "!#noCache")
public PagedResponse<ProductSummaryDTO> listProducts(..., boolean noCache) { ... }
```

The public catalog path (`noCache=false`) retains full caching. Internal training reads always hit
PostgreSQL directly and are never stored in Caffeine.

### Next.js Proxy Routes — CORS Bridge

The `ai-service` is not directly accessible from the browser. All AI calls from the frontend go through Next.js API Route handlers (`app/api/proxy/*`) that forward the request server-side. This also allows injecting the `X-Admin-Key` header from server-only env vars without exposing it to the browser.

---

## Async Training: 202 + Polling Pattern

Training a neural model can take 12–60 seconds. Synchronous HTTP responses would time out across proxies. The system implements the **202 Accepted + job polling** pattern (ADR-012):

```mermaid
sequenceDiagram
    participant FE as 🌐 Frontend
    participant PROXY as ⚙️ Next.js Proxy
    participant AI as 📋 TrainingJobRegistry
    participant TRAINER as 🧠 ModelTrainer

    FE->>PROXY: POST /api/proxy/model/train
    PROXY->>AI: POST /model/train (X-Admin-Key)
    AI-->>PROXY: 202 Accepted { jobId, status: "queued" }
    PROXY-->>FE: 202 { jobId }

    Note over AI,TRAINER: setImmediate fires after HTTP response sent

    AI->>TRAINER: train() [background]
    TRAINER-->>AI: progress callbacks (epoch, loss)

    loop Polling (1s queued, 2s running)
        FE->>PROXY: GET /api/proxy/model/train/status/{jobId}
        PROXY->>AI: GET /model/train/status/{jobId}
        AI-->>PROXY: { status, epoch, totalEpochs, loss, eta }
        PROXY-->>FE: training progress
    end

    TRAINER-->>AI: TrainingResult (precisionAt5, finalLoss)
    AI->>AI: VersionedModelStore.saveVersioned()\npromote if precisionAt5 improves

    FE->>PROXY: GET status
    PROXY->>AI: GET status
    AI-->>FE: { status: "complete", completedAt }
```

**Key implementation details:**

- `POST /model/train` returns `202` immediately with a `jobId` — HTTP response is sent before training starts
- `setImmediate(() => _runJob(jobId))` fires the training after the current event loop turn (after the response is flushed)
- `isTraining` guard is checked **inside** `setImmediate`, not at enqueue time — closes the race window between cron timer fire and actual job start
- `409 Conflict` if a training job is already in progress
- Job history capped at 20 entries in-memory (`MAX_JOBS = 20`)
- Frontend `useRetrainJob` hook uses **adaptive polling**: 1-second interval while `status === "queued"`, 2-second interval during `running` — stops after 3 consecutive poll failures (`consecutiveErrors` circuit breaker)

### Admin Key Security (ADR-014)

Admin-protected endpoints (`POST /model/train`, `POST /embeddings/generate`) are wrapped in a **scoped Fastify plugin** with a single `addHook('onRequest', adminKeyHook)` that applies only within the plugin's encapsulation scope. The internal `POST /embeddings/sync-product` endpoint (called by api-service, not the browser) is registered outside the plugin — zero whitelist maintenance needed when adding new internal endpoints.

```
X-Admin-Key: $ADMIN_API_KEY    → 200 OK
X-Admin-Key: wrong             → 401 Unauthorized
(no header)                    → 401 Unauthorized
```

---

## Model Versioning & Rollback

`VersionedModelStore` extends `ModelStore` with filesystem-backed versioning (ADR-013):

```mermaid
flowchart TD
    TRAIN["🧠 Training completes\nprecisionAt5 = 0.82"] --> SAVE["Save model file\n/tmp/model/model-2026-04-27T02-00-00.json"]
    SAVE --> COMPARE{"New precisionAt5\n≥ current?"}
    COMPARE -->|"Yes (0.82 ≥ 0.75)"| PROMOTE["Update symlink\n/tmp/model/current\n→ model-2026-04-27T02-00-00.json\ncall super.setModel()"]
    COMPARE -->|"No (0.72 < 0.75)"| REJECT["Log WARN\nKeep existing current\nModel available in history\nbut not active"]
    PROMOTE --> PRUNE["Prune history\nkeep 5 most recent\ndelete oldest"]
    REJECT --> PRUNE

    classDef action fill:#4ECDC4,stroke:#0B7285,color:#fff,stroke-width:2px
    classDef decision fill:#FFE66D,stroke:#F08C00,color:#000,stroke-width:2px
    classDef negative fill:#F38181,stroke:#C92A2A,color:#fff,stroke-width:2px

    class TRAIN,SAVE,PROMOTE,PRUNE action
    class COMPARE decision
    class REJECT negative
```

- **Promotion gate:** A new model only becomes `current` if its `precisionAt5` is ≥ the previous model's. Regressions are saved to history but never deployed.
- **Startup recovery (M12):** after `listen()`, whenever `AUTO_HEAL_MODEL=true`, `StartupRecoveryService` runs in the background: it **always** checks Neo4j for products **without** `embedding` and calls `generateEmbeddings` if needed (even when a model is already on disk — fixes mixed-volume drift). **Retrain** (probe → `TrainingJobRegistry.enqueue` / `waitFor`) runs **only** when no model was loaded from `loadCurrent()`.
- **Readiness contract:** `/health` stays liveness-only (`200`), while `/ready` is `200` only when `embeddingService.isReady && modelStore.getModel() !== null && !startupRecoveryService.isBlockingReadiness()`.
- **Blocked semantics:** if seed/training data is missing, service remains alive with `/ready=503` and explicit blocked reason in logs (no crash, no tight retry loop).
- **Docker persistence:** The `ai-model-data` volume preserves trained models across container restarts and `docker compose down`.
- **History:** `GET /api/v1/model/status` returns the last 5 model versions with timestamps and metrics.
- **FsPort interface:** All filesystem operations (`symlink`, `unlink`, `readdir`, `stat`, `mkdir`) go through an injected `FsPort` interface — the production implementation uses `node:fs/promises`; tests use `vi.fn()` mocks.

### Nightly Retraining

`CronScheduler` registers a `node-cron` job that fires every day at 02:00:

```
cron: "0 2 * * *"
```

It calls `TrainingJobRegistry.enqueue()` inside `setImmediate` — never blocks the Fastify event loop. If training is already in progress at cron trigger time, the job is skipped with a log warning. `GET /model/status` exposes `nextScheduledTraining` (ISO datetime) from `cronScheduler.getNextExecution()`.

---

## Production-Grade Patterns

### TensorFlow.js Async Boundary (ADR-008)

`tf.tidy()` does not support async operations. All I/O (Neo4j queries, HTTP calls) completes **before** entering the TF.js tensor computation block. This prevents tensor memory leaks from async calls that escape the tidy scope:

```typescript
// All async I/O done before tf.tidy()
const [clientEmbeddings, candidateProducts] = await Promise.all([
  repo.getClientPurchasedEmbeddings(clientId),
  repo.getCandidateProducts(clientId, country)
])

// Synchronous tensor operations inside tidy()
const scores = tf.tidy(() => {
  const batchTensor = tf.tensor2d(allVectors, [n, 768])
  const predictions = model.predict(batchTensor) as tf.Tensor
  return Array.from(predictions.dataSync())
})
```

### Profile vector and Neo4j reads (supersedes demo-buy ADR-021)

The product path uses **confirmed purchases** (and optionally **cart items**) to build the client profile vector; `RecommendationService` scores the catalog via a single internal path (`recommendFromVector`). The legacy **`POST /api/v1/demo-buy`** API and its Neo4j write helpers were **removed** from this codebase — any old `BOUGHT {is_demo: true}` edges are ignored by read queries (`coalesce(r.is_demo, false) = false`) until operators delete them; see `scripts/neo4j-delete-demo-bought-edges.cypher` and `.specs/project/STATE.md`.

### Neo4j Driver Singleton

The Neo4j driver is instantiated once at startup and shared across all repository methods. Each method opens a session, executes the query, and closes the session in a `finally` block — avoiding connection leaks while reusing the driver's internal connection pool.

### Custom Error with statusCode

Services define typed errors:

```typescript
export class ModelNotTrainedError extends Error {
  readonly statusCode = 503
}
export class ClientNotFoundError extends Error {
  readonly statusCode = 404
}
```

Route handlers do a single `instanceof` check and use `error.statusCode` for the HTTP response — no `switch/case` sprawl.

### Observability

| Layer | Tool | Metrics |
|-------|------|---------|
| API Service | Spring Actuator + Micrometer | Request latency, cache hit rate, AI service call duration |
| Caffeine cache | `recordStats()` | `cache.gets`, `cache.puts` auto-exposed |
| Model status | `GET /model/status` | `precisionAt5`, `finalLoss`, `staleDays`, `trainingSamples` |
| Nightly cron | `GET /api/v1/cron/status` | `nextScheduledTraining` |
| Admin audit | Structured logs | Virtual thread name `ai-sync-{productId}` visible in JFR |

---

## Frontend: 4-State AI Learning Showcase

The Analysis tab demonstrates the complete ML learning cycle with four side-by-side recommendation columns, each capturing a snapshot at a different phase:

```mermaid
flowchart LR
    subgraph "Column 1 — gray"
        C1["🎲 Without AI\nSeeded random shuffle\nstable across page reloads\n(LCG seed from clientId)"]
    end

    subgraph "Column 2 — blue"
        C2["🧠 With AI\nHybrid neural+semantic\nsnapshot captured\non client select"]
    end

    subgraph "Column 3 — emerald"
        C3["🛒 With Demo\nAfter simulated purchases\nprofile vector updated\nvia mean-pooling increment"]
    end

    subgraph "Column 4 — violet"
        C4["⚡ Post-Retrain\nAfter full model retrain\nwith demo purchases\nincluded in training data"]
    end

    C1 --> C2 --> C3 --> C4

    classDef col1 fill:#E5E7EB,stroke:#6B7280,color:#000,stroke-width:2px
    classDef col2 fill:#DBEAFE,stroke:#1D4ED8,color:#000,stroke-width:2px
    classDef col3 fill:#D1FAE5,stroke:#065F46,color:#000,stroke-width:2px
    classDef col4 fill:#EDE9FE,stroke:#5B21B6,color:#000,stroke-width:2px

    class C1 col1
    class C2 col2
    class C3 col3
    class C4 col4
```

### Snapshot Orchestration

`AnalysisPanel` orchestrates snapshot capture via a **discriminated union** type (`analysisSlice`, ADR-029):

```typescript
type AnalysisState =
  | { phase: 'empty' }
  | { phase: 'initial';   clientId: string; initial: Snapshot }
  | { phase: 'demo';      clientId: string; initial: Snapshot; demo: Snapshot }
  | { phase: 'retrained'; clientId: string; initial: Snapshot; demo: Snapshot; retrained: Snapshot }
```

TypeScript enforces that:
- You cannot have a `demo` snapshot without an `initial` snapshot
- You cannot have a `retrained` snapshot without `demo`
- Switching clients resets to `empty` — no stale snapshots from another client

Capture triggers:
- `initial` → captured when recommendations first load after client selection
- `demo` → captured when the cart / analysis flow updates the “with cart” snapshot (see frontend `analysisSlice`; no `demo-buy` HTTP call)
- `retrained` → captured when `useRetrainJob.status === 'done'`

### FLIP Animation — Catalog Reorder (ADR-017)

When clicking "✨ Sort by AI", product cards animate to their new ranked positions using the **FLIP technique** (First–Last–Invert–Play) without `flushSync` — which is an anti-pattern in React 18 Concurrent Mode:

1. **Before render:** `useLayoutEffect` captures all card DOM positions in a `prevPositionsRef: Map<key, DOMRect>`
2. **After render:** A second `useLayoutEffect` computes position deltas, applies `transform: translate(dx, dy)` synchronously (with `transition: none`), then removes the transform in the next `requestAnimationFrame`, letting CSS `transition: transform 300ms ease-out` animate to `(0, 0)`

Cards use only GPU-composited properties (`transform`, `opacity`) — zero layout thrashing during animation.

### Cart-driven profile: incremental recommendations

Adding items to the cart and refreshing recommendations:

1. The app calls `POST /api/v1/recommend/from-cart` on `ai-service` with `clientId` and `productIds` (cart contents)
2. The service loads **non-demo** purchase embeddings from Neo4j, merges **cart product** embeddings, mean-pools them into `clientProfileVector`, then runs the same scoring path as `POST /api/v1/recommend`
3. Checkout persists real `BOUGHT` edges via the `api-service` → sync path (no `is_demo` flag on that flow)

The old **demo-buy** HTTP surface was removed; optional cleanup of legacy `is_demo` edges is documented under **Ops** in `.specs/project/STATE.md`.

### Progress Bar — GPU-Composited (ADR-024)

The training progress bar uses `transform: scaleX(epoch/totalEpochs)` instead of `width` — the former is GPU-composited and never triggers layout recalculation:

```css
.progress-bar {
  transform-origin: left;
  transition: transform 300ms ease-out;
  /* transform: scaleX(0.4) for 40% progress */
}
```

`prefers-reduced-motion: reduce` is respected via `motion-safe:transition-transform` Tailwind class.

---

## State Management

The frontend uses **Zustand with domain-specific slices** (ADR-019) instead of React Contexts:

```mermaid
graph TB
    subgraph "useAppStore — Zustand"
        CS["clientSlice\nselectedClient: Client | null\npersist → localStorage\n(survives page reload)"]
        RS["recommendationSlice\nrecommendations[]\nloading · ordered\ncachedForClientId"]
        DS["demoSlice\ndemoBoughtByClient: Record\nchatHistory: Message[]\n(session-volatile)"]
        AS["analysisSlice\nphase: empty|initial|demo|retrained\nsnapshots per phase\n(session-volatile)"]
    end

    subgraph "Domain Hooks"
        H1["useSelectedClient()"]
        H2["useRecommendations()"]
        H3["useCatalogOrdering()"]
        H4["useRecommendationFetcher()"]
    end

    subgraph "Cross-Slice Subscribe"
        SUB["store.subscribe(selectedClient,\n  (new, prev) => {\n    if changed: clearDemo(prev.id)\n    clearRecommendations()\n    resetAnalysis()\n  }\n)"]
    end

    CS --> H1
    RS --> H2
    RS --> H3
    RS --> H4
    AS --> SUB
    CS --> SUB

    classDef slice fill:#4ECDC4,stroke:#0B7285,color:#fff,stroke-width:2px
    classDef hook fill:#FFE66D,stroke:#F08C00,color:#000,stroke-width:2px
    classDef sub fill:#F38181,stroke:#C92A2A,color:#fff,stroke-width:2px

    class CS,RS,DS,AS slice
    class H1,H2,H3,H4 hook
    class SUB sub
```

**Why Zustand over React Context:**
- `clientSlice` persists to `localStorage` — selected client survives page reload
- Cross-slice dependency (client change → clear demo state → reset analysis) is implemented via `store.subscribe()` at initialization, not via `useEffect` in components — no cascading re-renders
- No `<Provider>` wrappers in `layout.tsx` — slices compose into a single store
- Domain hooks (`useSelectedClient()`, `useRecommendations()`) abstract the store shape — components don't import `useAppStore` directly

---

## API Reference

Full OpenAPI documentation: `http://localhost:8080/swagger-ui.html`

### ai-service (:3001)

Training can use **`NEURAL_LOSS_MODE=pairwise`** (linear head + pairwise loss); default **`bce`** matches legacy BCE + sigmoid. After save, **`neural-head.json`** drives how raw neural outputs map to hybrid scores on **`/recommend`**. Details: [`ai-service/README.md`](ai-service/README.md).

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/v1/recommend` | POST | — | Hybrid recommendation for a client |
| `/api/v1/recommend/from-cart` | POST | — | Same scoring with profile = purchases + cart `productIds` |
| `/api/v1/search/semantic` | POST | — | Semantic product search via vector similarity |
| `/api/v1/rag/query` | POST | — | LLM-grounded natural language product query |
| `/api/v1/model/train` | POST | `X-Admin-Key` | Trigger async neural model training → 202 + jobId |
| `/api/v1/model/train/status/:jobId` | GET | — | Poll training job progress |
| `/api/v1/model/status` | GET | — | Model health, metrics, version history |
| `/api/v1/embeddings/generate` | POST | `X-Admin-Key` | Generate embeddings for all products |
| `/api/v1/embeddings/sync-product` | POST | — | Internal: sync single product to Neo4j + generate embedding |

### api-service (:8080)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/products` | GET | Paginated catalog with filters (category, country, supplier, search) |
| `/api/v1/products/{id}` | GET | Product detail |
| `/api/v1/products` | POST | Create product (triggers ai-service sync via virtual thread) |
| `/api/v1/clients` | GET | Client list |
| `/api/v1/clients/{id}` | GET | Client profile with purchase summary |
| `/api/v1/clients/{id}/orders` | GET | Paginated order history |
| `/api/v1/recommend/{clientId}` | GET | Proxy to ai-service with circuit breaker + fallback |
| `/actuator/health` | GET | Service health |
| `/actuator/metrics` | GET | Micrometer metrics (latency, cache stats) |
| `/swagger-ui.html` | GET | Full OpenAPI documentation |

### Quick Examples

```bash
# Hybrid recommendation
curl -X POST http://localhost:3001/api/v1/recommend \
  -H "Content-Type: application/json" \
  -d '{"clientId": "<uuid>", "limit": 10}'

# Semantic search
curl -X POST http://localhost:3001/api/v1/search/semantic \
  -H "Content-Type: application/json" \
  -d '{"query": "sugar-free beverages for corporate clients", "limit": 5}'

# RAG query
curl -X POST http://localhost:3001/api/v1/rag/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What cleaning products are available in the Netherlands?"}'

# Train model (async)
curl -X POST http://localhost:3001/api/v1/model/train \
  -H "X-Admin-Key: $ADMIN_API_KEY"
# → { "jobId": "abc-123", "status": "queued" }

# Poll training progress
curl http://localhost:3001/api/v1/model/train/status/abc-123
# → { "status": "running", "epoch": 15, "totalEpochs": 30, "loss": 0.18, "eta": "8s" }

# Offline neural architecture benchmark (from repo: smart-marketplace-recommender/ai-service)
# Requires API + Neo4j with embeddings; see "Neural architecture benchmark (CLI)" in TOC
export API_SERVICE_URL=http://127.0.0.1:8080 NEO4J_URI=bolt://127.0.0.1:7687 NEO4J_USER=neo4j NEO4J_PASSWORD=password123
npm run benchmark:neural-arch -- --out ./.benchmarks/nn-arch.json
```

---

## Model Observability

`GET /api/v1/model/status` returns:

```json
{
  "status": "trained",
  "trainedAt": "2026-04-27T02:00:00.000Z",
  "staleDays": 0,
  "staleWarning": null,
  "syncedAt": "2026-04-27T01:58:00.000Z",
  "precisionAt5": 0.82,
  "finalLoss": 0.14,
  "finalAccuracy": 0.91,
  "trainingSamples": 640,
  "currentModel": "model-2026-04-27T02-00-00.json",
  "models": [
    { "filename": "model-2026-04-27T02-00-00.json", "precisionAt5": 0.82, "accepted": true },
    { "filename": "model-2026-04-26T02-00-00.json", "precisionAt5": 0.75, "accepted": true }
  ],
  "nextScheduledTraining": "2026-04-28T02:00:00.000Z"
}
```

### Why Precision@K, not Accuracy?

With 52 products and clients buying ~10 on average, the model sees ~80% negative examples. A model that always predicts "not bought" would achieve >90% accuracy. **Precision@K=5** asks: "of the 5 products the model most confidently recommends, how many did the client actually buy?" This reflects the actual use case and is robust to class imbalance.

`precisionAt5` is computed on a 20% holdout set (per client) — not on training data.

### Model Staleness

- `staleDays`: days since last training; `null` if never trained
- `staleWarning`: present when `staleDays >= 7` — suggests retraining

---

## Tech Stack Decision Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| AI service language | TypeScript / Node.js 22 | Course stack (`@xenova/transformers` runs HuggingFace locally; `@tensorflow/tfjs-node` for dense model); no Python overhead |
| API service language | Java 21 / Spring Boot 3.3 | Virtual Threads (Project Loom) for I/O-bound throughput; Swagger auto-gen; Actuator observability out-of-the-box |
| Graph + vector store | Neo4j 5 | Native vector indexes eliminate a separate vector DB (Pinecone/Weaviate); graph relationships (`BOUGHT`, `BELONGS_TO`) enable multi-hop Cypher for future RAG enrichment |
| Relational store | PostgreSQL 16 | Transactional data (orders, products catalog, clients) |
| Embedding model | `all-MiniLM-L6-v2` (384d) | Free, local, state-of-the-art sentence embeddings; runs on CPU without GPU |
| LLM | Mistral-7B via OpenRouter | Zero cost (free tier); supports pt-BR and English |
| Frontend | Next.js 14 App Router + Tailwind | Server components for API proxying; Tailwind for rapid UI composition |
| State management | Zustand (3 slices + 1 analysis slice) | Persistence, cross-slice subscribe, no Provider boilerplate — simpler than Redux for this scope |
| Async training | 202 + polling + `setImmediate` | Non-blocking HTTP response; no external queue (Redis) needed; compatible with nightly cron |
| Model versioning | VersionedModelStore + symlink | SRP preserved; `FsPort` interface keeps unit tests clean; promotion gate protects against regressions |
| Product sync | Virtual Thread + `java.net.http.HttpClient` | Idiomatic Java 21 servlet stack; no Reactor scheduler; observable in thread dumps |
| Cache | Caffeine (5min catalog, 1min fallback) | In-process; Micrometer integration; `CacheEvict` on write; two TTLs in one `CacheManager` |
| Negative sampling | N=4 + hard mining + soft exclusion | Eliminates False Negative Contamination; MNAR-aware; equivalent to production-grade exposure-aware sampling |

---

## Architecture Decision Records

All architectural decisions are documented in `.specs/features/` with context, alternatives considered, and consequences:

| ADR | Feature | Decision |
|-----|---------|---------|
| ADR-001 | Foundation | Seed strategy — idempotent script, PostgreSQL via API, Neo4j direct |
| ADR-002 | Foundation | Neo4j health check strategy |
| ADR-003 | API Service | Programmatic Caffeine cache with two named caches and different TTLs |
| ADR-004 | AI Service | Neo4j driver singleton — one driver, sessions per operation |
| ADR-005 | AI Service | Model warm-up as liveness/readiness gate |
| ADR-006 | Neural Model | ModelStore atomic swap — single synchronous reference assignment |
| ADR-007 | Neural Model | Batch predict over serial predict — single tf.tensor2d call for all candidates |
| ADR-008 | Neural Model | tf.tidy async boundary — all I/O before entering tidy() |
| ADR-009 | Quality | Vitest DI mocking strategy |
| ADR-010 | Quality | @xenova/transformers model prebake in Docker builder stage |
| ADR-011 | Quality | Next.js standalone Dockerfile |
| ADR-012 | Production | TrainingJobRegistry — 202 + polling pattern with setImmediate |
| ADR-013 | Production | VersionedModelStore — SRP extension, FsPort injectable, precisionAt5 promotion gate |
| ADR-014 | Production | Admin key via scoped Fastify plugin hook (OCP) |
| ADR-015 | Production | AiSyncClient — Java 21 Virtual Thread fire-and-forget |
| ADR-016 | Neural Model | Hybrid score weight calibration — committee validation, future grid search |
| ADR-017 | UX Refactor | FLIP animation without flushSync — prevPositionsRef + two useLayoutEffect cycles |
| ADR-018 | UX Refactor | RAG Drawer always-mounted — chat history survives open/close |
| ADR-019 | UX Refactor | Zustand slices with domain hooks — replaces React Contexts |
| ADR-021 | Demo Buy (historical) | Unified Neo4j write+read for demo-buy — **API removed**; pattern superseded by cart + `recommend/from-cart` |
| ADR-022 | Demo Buy (historical) | DELETE path params — **API removed** |
| ADR-023 | Deep Retrain | AnalysisPanel always-mounted — metrics survive tab navigation |
| ADR-024 | Deep Retrain | Progress bar scaleX — GPU-composited, no layout thrashing |
| ADR-025 | Deep Retrain | jobIdRef pattern — prevents stale closure in setInterval polling |
| ADR-026 | Demo-Retrain | Demo purchases included in retrain training data |
| ADR-027 | AI Showcase | Negative sampling N=4 + hard negative mining by category |
| ADR-028 | AI Showcase | Reduced network Dense[64]+L2 + classWeight {0:1, 1:4} |
| ADR-029 | AI Showcase | analysisSlice discriminated union — 4-phase type safety |
| ADR-030 | AI Showcase | RecommendationColumn presentational — SRP, 4 colorSchemes |
| ADR-031 | AI Showcase | Soft negative exclusion by (category + supplier) — False Negative Contamination fix |
| ADR-032 | AI Showcase | Soft negative exclusion by cosine similarity — ANCE-simplified complement to ADR-031 |
| ADR-052 | Self-Healing | AutoSeedService on boot + Cache-Control bypass for training reads — zero-touch cold start |
| ADR-053 | Tech Debt | Migration roadmap: move seed responsibility from `ai-service` to `api-service` |
| ADR-062 | M17 Recency | Phased rollout: P1 re-rank boost, P2 profile pooling, P3 attention (planned) |
| ADR-063 | M17 Transparency | `rankingConfig` + per-term score fields on recommend responses |
| ADR-064 | M17 Frontend | `rankingConfig` persisted in `recommendationSlice` (Zustand) |
| ADR-065 | M17 P2 Pooling | Single `aggregateClientProfileEmbeddings` — train / infer / eval temporal alignment |

---

## Dataset

Synthetic dataset — no real or proprietary data:

- **52 products** across 5 categories: `beverages`, `food`, `personal_care`, `cleaning`, `snacks`
- **3 suppliers:** fictional equivalents of Ambev, Nestlé, Unilever
- **5 countries:** BR, MX, CO, NL, RO
- **20+ clients** with realistic B2B purchase histories (5–15 orders each)
- Neo4j graph nodes: `Product`, `Client`, `Category`, `Supplier`, `Country`
- Neo4j edges: `BOUGHT {quantity, date}`, `BELONGS_TO`, `SUPPLIED_BY`, `AVAILABLE_IN`
- Seed script is idempotent — safe to run multiple times

---

## Testing

| Layer | Framework | Coverage |
|-------|-----------|---------|
| AI Service | Vitest | 76 unit tests — ModelTrainer, buildTrainingDataset, soft negative filters, RecommendationService, TrainingJobRegistry |
| API Service | JUnit + Testcontainers (PostgreSQL) | Service layer unit tests + REST endpoint integration tests |
| Frontend | Playwright E2E | Semantic search, hybrid recommendations, RAG chat flows |

```bash
# AI service tests
cd ai-service && npm test

# API service tests
cd api-service && ./mvnw test

# E2E tests (services must be running)
cd frontend && npx playwright test
```

---

*Capstone project — Post-graduation course: Engenharia de Software com IA Aplicada (modulo01), under Erick Wendel (Google Developer Expert, Node.js core contributor).*
