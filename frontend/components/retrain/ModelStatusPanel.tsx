'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { useModelStatus, type UseModelStatusResult } from '@/lib/hooks/useModelStatus';

interface ModelStatusPanelProps {
  modelStatusHook?: UseModelStatusResult;
  onViewUpdatedRecommendations?: () => void;
}

export function ModelStatusPanel({ modelStatusHook, onViewUpdatedRecommendations }: ModelStatusPanelProps) {
  const ownModelStatus = useModelStatus();
  const modelStatus = modelStatusHook ?? ownModelStatus;
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const {
    panelState,
    modelStatus: latestStatus,
    loading,
    errorMessage,
    awaitingForOrderId,
    startManualRetrain,
    refreshStatus,
  } = modelStatus;

  const stateView = useMemo(() => {
    const currentVersion = latestStatus?.currentVersion ?? 'nenhuma versão ativa';

    if (panelState === 'training') {
      return {
        title: 'Pedido confirmado, modelo aprendendo',
        description: awaitingForOrderId
          ? `O pedido #${awaitingForOrderId} já entrou no ciclo de aprendizagem. Pos-Efetivar será atualizado quando a nova versão ativa ficar pronta.`
          : 'O checkout foi concluído e o sistema está treinando uma nova versão para comparar Com Carrinho e Pos-Efetivar.',
        cardClass: 'border-blue-200 bg-blue-50 text-blue-900',
      };
    }

    if (panelState === 'promoted') {
      return {
        title: 'Pos-Efetivar já reflete a nova versão ativa',
        description: `A versão ${currentVersion} foi promovida após o checkout. Agora você pode comparar Com Carrinho e Pos-Efetivar com o modelo novo em produção.`,
        cardClass: 'border-green-200 bg-green-50 text-green-900',
      };
    }

    if (panelState === 'rejected') {
      return {
        title: 'Modelo atual mantido após o checkout',
        description: latestStatus?.lastDecision
          ? `O candidato foi rejeitado: ${latestStatus.lastDecision.reason}. Se Pos-Efetivar parecer igual, isso é esperado porque a versão ${currentVersion} continua ativa.`
          : `O candidato foi rejeitado e a versão ${currentVersion} foi mantida. Se Pos-Efetivar parecer igual, isso é comportamento esperado.`,
        cardClass: 'border-amber-200 bg-amber-50 text-amber-900',
      };
    }

    if (panelState === 'failed') {
      return {
        title: 'Treinamento pós-checkout não concluiu',
        description: errorMessage
          ? `${errorMessage} Pos-Efetivar continua representando o modelo ativo anterior.`
          : 'Nenhum novo snapshot foi aplicado após o checkout. Pos-Efetivar continua representando o modelo ativo anterior.',
        cardClass: 'border-red-200 bg-red-50 text-red-900',
      };
    }

    if (panelState === 'unknown') {
      return {
        title: 'Resultado do checkout ainda sem confirmação',
        description:
          'Ainda não foi possível confirmar promoção, rejeição ou falha. Recarregue o status para continuar a análise sem assumir sucesso ou erro.',
        cardClass: 'border-gray-300 bg-gray-50 text-gray-800',
      };
    }

    return {
      title: 'Aguardando o próximo checkout',
      description: `Versão ativa atual: ${currentVersion}. Após efetivar uma compra, o aprendizado aparecerá aqui e Pos-Efetivar mostrará o resultado.`,
      cardClass: 'border-gray-200 bg-white text-gray-800',
    };
  }, [awaitingForOrderId, errorMessage, latestStatus, panelState]);

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-5" data-testid="model-status-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Evolução após o checkout</h3>
          <p className="text-xs text-gray-500">Acompanhe como Com Carrinho evolui para Pos-Efetivar.</p>
        </div>
        <button
          type="button"
          aria-expanded={advancedOpen}
          aria-controls="model-status-advanced-panel"
          onClick={() => setAdvancedOpen((value) => !value)}
          data-testid="model-status-advanced-toggle"
          className="min-h-[44px] rounded-md border border-gray-300 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Modo avançado / diagnóstico
        </button>
      </div>

      <div className={cn('rounded-lg border p-4', stateView.cardClass)}>
        <p className="text-sm font-semibold">{stateView.title}</p>
        <p aria-live="polite" className="mt-1 text-xs">{stateView.description}</p>

        {panelState === 'training' && (
          <div className="mt-3 h-2 w-full overflow-hidden rounded bg-blue-100">
            <div className="h-full w-full origin-left bg-blue-500 motion-safe:animate-pulse" />
          </div>
        )}

        {panelState === 'promoted' && (
          <button
            type="button"
            data-testid="model-status-view-updated"
            onClick={() => {
              onViewUpdatedRecommendations?.();
              const target = document.getElementById('pos-efetivar');
              target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="mt-3 min-h-[44px] rounded-md bg-green-600 px-3 text-sm font-medium text-white hover:bg-green-700"
          >
            Ver Pos-Efetivar atualizado
          </button>
        )}

        {panelState === 'unknown' && (
          <button
            type="button"
            data-testid="model-status-refresh"
            onClick={() => void refreshStatus()}
            className="mt-3 min-h-[44px] rounded-md border border-gray-400 px-3 text-sm font-medium text-gray-800 hover:bg-gray-100"
          >
            Recarregar status do modelo
          </button>
        )}
      </div>

      {advancedOpen && (
        <div id="model-status-advanced-panel" className="rounded-lg border border-dashed border-gray-300 p-3">
          <p className="text-xs text-gray-600">
            Retreino manual para diagnóstico. Este caminho é secundário e fica fora do fluxo principal de carrinho e checkout.
          </p>
          <button
            type="button"
            data-testid="model-status-manual-retrain"
            onClick={() => void startManualRetrain()}
            disabled={loading}
            className={cn(
              'mt-3 min-h-[44px] rounded-md px-3 text-sm font-medium',
              loading
                ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            )}
          >
            {loading ? 'Executando diagnóstico...' : 'Executar retreino manual (diagnóstico)'}
          </button>
        </div>
      )}
    </div>
  );
}
