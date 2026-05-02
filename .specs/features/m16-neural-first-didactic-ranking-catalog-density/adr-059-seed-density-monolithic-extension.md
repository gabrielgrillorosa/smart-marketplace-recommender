# ADR-059: Seed Density via Extensão Monolítica dos Módulos Existentes

**Status**: Accepted  
**Date**: 2026-04-29  

## Context

O M16 exige ~85 SKUs (piso), alvo documentado ~125, com 20–25 produtos em `beverages` e `food`, mais suppliers, clientes e pedidos com viés `segment × category` e recompra. O repositório já modela seed como arrays exportados em `ai-service/src/seed/data/*.ts` e `generateOrders()` em `orders.ts`, com verificação cruzada PG ↔ Neo4j em `seed.ts`.

A tensão é entre introduzir geradores modulares por domínio (novos diretórios, factories) versus inflar os arquivos existentes.

## Decision

Estender **in-place** os arquivos `products.ts`, `suppliers.ts`, `clients.ts` e `orders.ts`, mantendo o mesmo formato de export (`export const products: Product[]`). Onde o volume tornar o arquivo ilegível, extrair **apenas** funções puras auxiliares no mesmo diretório (`generateSegmentCategoryBias()`, `expandProductBlock(category, count)`) sem novo bounded context ou pacote separado.

Novos suppliers são UUIDs estáveis adicionados ao topo de `suppliers.ts`, seguindo o padrão dos IDs existentes.

## Alternatives considered

- **Gerador externo (JSON gerado por script Node separado)**: Descartado — quebra o fluxo atual de TypeScript tipado e exige passo extra no CI; ADR-053 já trata migração futura para api-service.
- **Split por categoria em `products/beverages.ts`, etc.**: Descartado para MVP — aumenta imports e barreira de entrada para contribuidores; pode ser revisitado se `products.ts` ultrapassar ~800 linhas.

## Consequences

- Diff maior em arquivos existentes, mas rastreável em um único milestone.
- Contagens de produtos por categoria devem ser documentadas em comentário de cabeçalho em `products.ts` (ex.: `// beverages: 22 | food: 24 | …`).
- Testes de seed (`SeedVerificationError`, smoke cold start) continuam sendo o gate principal.
