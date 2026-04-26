FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_API_SERVICE_URL=http://localhost:8080
ARG NEXT_PUBLIC_AI_SERVICE_URL=http://localhost:3001
ARG NEXT_PUBLIC_ADMIN_API_KEY=dev-local-key
ENV NEXT_PUBLIC_API_SERVICE_URL=$NEXT_PUBLIC_API_SERVICE_URL
ENV NEXT_PUBLIC_AI_SERVICE_URL=$NEXT_PUBLIC_AI_SERVICE_URL
ENV NEXT_PUBLIC_ADMIN_API_KEY=$NEXT_PUBLIC_ADMIN_API_KEY
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
