# syntax=docker/dockerfile:1
# python3 + build-essential: sharp (@huggingface/transformers) falls back to node-gyp when
# prebuild binary download times out (common on slow networks). ca-certificates for HTTPS.
#
# Hugging Face / build cache:
# - Prewarm runs *before* full `COPY src` so app code changes do not invalidate the model layer.
# - `RUN --mount=type=cache,target=...` (BuildKit) keeps HF hub files on the host between builds;
#   even with `--no-cache` or changed layers above, re-runs reuse the cache mount (no full re-download).
# - Model bytes are copied to /opt/ai-service-huggingface-cache because cache-mount contents are
#   not persisted into image layers by themselves.
FROM node:20-slim AS builder
WORKDIR /app

ARG EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
ENV EMBEDDING_MODEL=${EMBEDDING_MODEL}
ENV HF_HOME=/root/.cache/huggingface
ENV HUGGINGFACE_HUB_CACHE=/root/.cache/huggingface/hub
# Reduce npm prebuild / registry timeouts during docker build
ENV npm_config_fetch_timeout=600000
ENV npm_config_fetch_retries=5

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    build-essential \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
# Only the script needed for prewarm — keeps HF layer cacheable when other `src/` files change.
COPY src/scripts/prewarm-embedding.ts ./src/scripts/prewarm-embedding.ts
RUN --mount=type=cache,target=/root/.cache/huggingface,id=ai-service-huggingface \
    mkdir -p /opt/ai-service-huggingface-cache \
    && npx ts-node src/scripts/prewarm-embedding.ts \
    && cp -a /root/.cache/huggingface/. /opt/ai-service-huggingface-cache/

COPY src ./src
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app

ENV HF_HOME=/root/.cache/huggingface
ENV HUGGINGFACE_HUB_CACHE=/root/.cache/huggingface/hub
ENV npm_config_fetch_timeout=600000
ENV npm_config_fetch_retries=5

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    build-essential \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
RUN mkdir -p /root/.cache/huggingface
COPY --from=builder /opt/ai-service-huggingface-cache/ /root/.cache/huggingface/

EXPOSE 3001
CMD ["node", "dist/entry.js"]
