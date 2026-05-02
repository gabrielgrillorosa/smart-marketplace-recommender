# M22 + M21 — Neural ranking architecture (dual item tower + user pooling)

Companion to the root **[README](../../README.md)** § *M22 — Hybrid dual item tower (delivered)* and **[ADR-074](../../.specs/features/m22-hybrid-dual-item-tower-cold-start/adr-074-m22-milestone-hybrid-sparse-item-tower.md)**.

**Summary:** The **user vector u** comes from **M17/M21** (`aggregateClientProfileEmbeddings`), optionally **`attention_learned`**. The **item** side under **M22** splits into **A** semantic (HF), **B** structural sparse priors (disjoint vocabs), **C** optional **product_id** memorisation — fused as **concat → MLP → neuralScore**, alongside **semanticScore = cosine(u, e_sem)** per **ADR-016**.

When **`M22_ENABLED=false`**, the neural path remains the legacy **768-d** concat `(e_sem ‖ u)`.

---

## Flowchart

```mermaid
flowchart TB
  subgraph UT["👤 User tower — M17 / M21"]
    HIST["📦 Purchases + embeddings\n+ Δ days"] --> AGG["aggregateClientProfileEmbeddings"]
    CART["🛒 Cart merged\nΔ = 0"] --> AGG
    AGG --> PMODE{"PROFILE_POOLING_MODE"}
    PMODE -->|"mean · exp · attention_light"| U1["u 384d"]
    PMODE -->|"attention_learned"| U2["u 384d\nsoftmax w·e+b−λΔ/τ"]
    U1 --> UVEC["u"]
    U2 --> UVEC
  end

  subgraph SEM["🔤 Item A — Semantic dense"]
    TXT["Title + description"] --> ENC["HF encoder"]
    ENC --> ESEM["e_sem 384d"]
  end

  subgraph STR["📊 Item B — Structural sparse"]
    BK["brand"] --> EV["Separate embedding\nlookups per field"]
    CK["category"] --> EV
    SK["subcategory"] --> EV
    PK["price_bucket"] --> EV
    EV --> EST["e_struct"]
  end

  subgraph IDN["🔖 Item C — Identity optional"]
    PID["product_id"] --> EID["e_id or OOV"]
  end

  UVEC --> CAT["concat\nsem ‖ user ‖ struct ‖ id"]
  ESEM --> CAT
  EST --> CAT
  EID --> CAT
  CAT --> D64["Dense 64 + dropout"]
  D64 --> LOGIT["Logit · sigmoid or linear\nper neural-head.json"]
  LOGIT --> NSCR["neuralScore"]

  ESEM --> COS["semanticScore\ncosine u vs e_sem"]
  UVEC --> COS
  NSCR --> FIN["finalScore\nNEURAL_WEIGHT · neural +\nSEMANTIC_WEIGHT · semantic"]
  COS --> FIN

  classDef userN fill:#95E1D3,stroke:#087F5B,stroke-width:2px,color:#003300
  classDef semN fill:#FFE66D,stroke:#F08C00,stroke-width:2px,color:#1a1a1a
  classDef strN fill:#A8DADC,stroke:#1864AB,stroke-width:2px,color:#0B1F33
  classDef idN fill:#E6E6FA,stroke:#5C4D8A,stroke-width:2px,color:#2d1b4e
  classDef fuseN fill:#4ECDC4,stroke:#0B7285,stroke-width:2px,color:#ffffff
  classDef outN fill:#90EE90,stroke:#2F6B2F,stroke-width:2px,color:#003300

  class HIST,CART,AGG,PMODE,U1,U2,UVEC userN
  class TXT,ENC,ESEM semN
  class BK,CK,SK,PK,EV,EST strN
  class PID,EID idN
  class CAT,D64,LOGIT,NSCR fuseN
  class COS,FIN outN
```
