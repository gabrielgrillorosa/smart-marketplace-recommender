# ADR-022: DELETE /demo-buy com path params em vez de request body

**Status**: Accepted
**Date**: 2026-04-26

## Context

O spec M9-A define `DELETE /api/v1/demo-buy` com body `{ clientId, productId }` para desfazer uma compra demo individual, e `DELETE /api/v1/demo-buy/all` com body `{ clientId }` para limpeza bulk. O Staff Engineering identificou que DELETE com body é tecnicamente válido no HTTP/1.1, mas frameworks (proxies, gateways, alguns clientes HTTP) frequentemente ignoram ou descartam o body em requisições DELETE — o que causaria `clientId`/`productId` ausentes e retornos `400 Bad Request` silenciosos.

## Decision

Usar path params em vez de request body para as rotas DELETE:
- `DELETE /api/v1/demo-buy/:clientId/:productId` — desfaz compra demo individual
- `DELETE /api/v1/demo-buy/:clientId` — limpa todas as compras demo do cliente (bulk clear)

O frontend chama `DELETE /api/v1/demo-buy/${clientId}/${productId}` e `DELETE /api/v1/demo-buy/${clientId}` sem body.

## Alternatives considered

- **DELETE com body `{ clientId, productId }`**: Descartado — comportamento não confiável em proxies e alguns clientes HTTP; Fastify suporta mas require `Content-Type: application/json` explícito, o que é fácil de esquecer no frontend.
- **POST para undone** (action endpoint): `POST /api/v1/demo-buy/undo` — semanticamente incorreto para uma operação de remoção; viola REST semântica.

## Consequences

- URLs são auto-documentadas e compatíveis com qualquer cliente HTTP, proxy ou gateway sem configuração adicional.
- O `clientId` em path param também permite que logs e traces do Fastify incluam o ID sem necessidade de parsear o body.
- A rota `DELETE /api/v1/demo-buy/:clientId` (bulk) pode colidir com `DELETE /api/v1/demo-buy/:clientId/:productId` apenas se o Fastify não resolver corretamente — resolvido porque `:clientId/:productId` tem segmento extra, sem ambiguidade.
- O spec.md (M9A-15, M9A-26) referencia os endpoints com body — o design.md e tasks.md usarão os path params como canônico; o spec não precisa ser retroativamente alterado (é um documento de requisitos, não de contrato HTTP).
