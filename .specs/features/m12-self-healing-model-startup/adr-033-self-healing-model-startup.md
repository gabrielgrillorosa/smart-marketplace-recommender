# ADR-033: Self-Healing Model Startup

**Status**: Accepted
**Date**: 2026-04-27

## Context

O `ai-service` já sobe com `VersionedModelStore.loadCurrent()` e `EmbeddingService.init()`, mas continua degradado quando o volume `ai-model-data` não contém um modelo utilizável. Nesse cenário, o processo fica vivo, porém qualquer chamada de recomendação falha com `ModelNotTrainedError` até que alguém execute a sequência manual de recuperação.

O projeto já possui as peças necessárias para recuperar esse estado: geração idempotente de embeddings, `ModelTrainer.train()`, `TrainingJobRegistry` para treino assíncrono, e `VersionedModelStore` para promover o modelo treinado. O problema do M12 não é criar uma nova pipeline de ML, e sim orquestrar essas peças no boot sem bloquear o servidor, sem duplicar a lógica de treino e sem marcar o serviço como pronto cedo demais.

Também há um limite de escopo importante: M12 trata **modelo ausente**, não orquestração do seed. Se o ambiente estiver vazio porque o seed nunca rodou, o serviço deve falhar de forma explícita e não tentar esconder o problema com comportamento implícito.

## Decision

Introduzir um componente dedicado, `StartupRecoveryService`, instanciado no `index.ts` do `ai-service`, responsável por executar o auto-healing em background quando o boot termina sem modelo carregado.

Fluxo decidido:

1. `VersionedModelStore.loadCurrent()` continua sendo o único ponto que define se existe um modelo válido em memória.
2. Se `getModel() !== null`, o startup segue pelo caminho quente normal e o auto-healing é ignorado.
3. Se `getModel() === null` e `AUTO_HEAL_MODEL !== false`, o `StartupRecoveryService` entra em estado bloqueante para readiness.
4. O recovery:
   - verifica se há embeddings ausentes no Neo4j e chama `EmbeddingService.generateEmbeddings()` apenas quando necessário;
   - verifica se existe dado mínimo de treino; se não houver, registra warning, não derruba o processo e mantém `/ready = 503`;
   - reutiliza `TrainingJobRegistry.enqueue()` para disparar o treino em background ou aguarda o job ativo, preservando o single-flight do treino;
   - libera readiness apenas quando `VersionedModelStore.getModel()` volta a ser não-nulo.
5. O recovery roda uma única vez por processo; falhas ficam explícitas em log e não entram em loop de retry.

## Alternatives considered

- **Inline `autoHealModel()` em `index.ts`**: menor churn, mas transforma o composition root em orquestrador de estado, reduz testabilidade e duplica lógica de lifecycle que já pertence ao registry.
- **Chamar `ModelTrainer.train()` diretamente no boot**: bypassa `TrainingJobRegistry`, quebra o single-flight de treino e cria um segundo caminho operacional para a mesma capacidade.
- **Acoplar o seed ao startup do serviço**: resolveria o caso de ambiente totalmente vazio, mas expande o escopo de M12 para provisioning/inicialização de dados, que não pertence ao runtime do serviço.

## Consequences

- O M12 reaproveita a infraestrutura operacional do M7 em vez de introduzir uma segunda pipeline de recuperação.
- O boot continua não bloqueante: `/health` segue vivo, enquanto `/ready` só vira `200` quando o modelo realmente volta a existir.
- `AUTO_HEAL_MODEL=false` passa a ser o escape hatch oficial para testes unitários e E2E.
- O caso "seed não rodou" deixa de gerar crash e passa a gerar um estado degradado explícito: processo vivo, readiness bloqueada, log claro.
- O design exige uma pequena extensão no `TrainingJobRegistry` para observar quando o job auto-enfileirado termina, mantendo a observação do lifecycle no próprio componente dono dos jobs.
