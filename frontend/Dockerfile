# Stage 1: Install dependencies and build
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install --prefer-offline

COPY . .
RUN npm run build

# Stage 2: Minimal runtime image using Next.js standalone output
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
