# ADR-018: RAGDrawer Always-Mounted para Preservar Histórico de Chat

**Status**: Accepted
**Date**: 2026-04-26

## Context

O `RAGDrawer` encapsula o `RAGChatPanel` existente (M5) dentro de um `Sheet` Radix UI. O requisito M8-41 determina que o histórico de mensagens do chat deve ser preservado ao fechar e reabrir o drawer — o avaliador pode fechar o drawer para olhar o catálogo e reabri-lo para continuar a conversa de onde parou.

O padrão mais simples de implementar um drawer condicional é montar/desmontar via conditional render:

```tsx
{isOpen && <RAGDrawer />}
```

Porém, se o histórico de mensagens (`Message[]`) está em `useState` local dentro do `RAGChatPanel`, a desmontagem destrói o estado. Existem duas estratégias para preservar o histórico:

1. **Elevar o estado**: mover `chatHistory: Message[]` para o Zustand `demoSlice`.
2. **Always-mounted**: renderizar o `<RAGDrawer>` incondicionalmente no DOM; controlar visibilidade via prop `open` do `Sheet` Radix (que internamente usa `data-state=open/closed` e `visibility: hidden` quando fechado, sem desmontar).

## Decision

Adotar a estratégia **always-mounted**: `<RAGDrawer>` é renderizado incondicionalmente no `Header`, recebendo `open={isDrawerOpen}` e `onOpenChange={setIsDrawerOpen}`. O `Sheet` do Radix UI controla a visibilidade via CSS (`data-state` attribute + keyframes) sem desmontar os filhos quando fechado.

O `isDrawerOpen` boolean é estado local do `Header` (`useState`) — não precisa ser global porque nenhum outro componente precisa saber se o drawer está aberto.

```tsx
// Header.tsx
export function Header() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  return (
    <header>
      {/* ... logo, dropdown, service badges ... */}
      <button onClick={() => setIsDrawerOpen(true)}>💬 Chat RAG</button>
      <RAGDrawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen} />
    </header>
  );
}
```

O histórico de chat permanece em `useState` local do `RAGChatPanel` — sem elevação para o store global.

## Alternatives considered

- **Elevar `chatHistory` para `demoSlice`**: funciona corretamente, mas adiciona estado de UI ao store de domínio. `demoSlice` deve conter estado relacionado à demo de compras (`demoBoughtByClient`), não histórico de chat — violaria SRP do slice. Rejeitado por Principal SW Architect como acoplamento indevido.
- **Conditional render `{isOpen && <RAGDrawer />}`**: simples de implementar, mas destrói o estado do chat a cada fechamento — viola M8-41 diretamente. Eliminado por QA Staff (High severity).
- **`display: none` via CSS manual**: possível, mas duplica o que o Radix Sheet já faz corretamente com `data-state` — adicionaria código sem ganho. Eliminado.

## Consequences

- O `RAGChatPanel` está sempre montado — executa os `useEffect` de inicialização uma vez no load inicial, não na abertura do drawer. Isso é correto: não há side effects pesados no `RAGChatPanel` além de inicializar estado local.
- O `Sheet` Radix UI implementa focus trap (`aria-modal`, focus trap loop) e `returnFocus` para o trigger por padrão — sem nenhum código adicional. A propriedade `onOpenAutoFocus` não é suprimida; o foco move para o primeiro elemento interativo do drawer ao abrir.
- O botão "💬 Chat RAG" recebe um `ref` que o Radix `SheetTrigger` usa para `returnFocus` ao fechar — implementado via `asChild` prop do `SheetTrigger`.
- Histórico de chat é resetado em reload de página (comportamento esperado para estado volátil de sessão).
