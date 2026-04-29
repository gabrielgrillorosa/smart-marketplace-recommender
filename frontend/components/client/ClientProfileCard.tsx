import type { ClientProfileViewModel } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

const FLAG_EMOJI: Record<string, string> = {
  BR: '🇧🇷',
  MX: '🇲🇽',
  CO: '🇨🇴',
  NL: '🇳🇱',
  RO: '🇷🇴',
};

interface ClientProfileCardProps {
  profile: ClientProfileViewModel;
}

function formatCurrency(value: number | null): string {
  if (value == null) {
    return 'Indisponível';
  }

  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatLastOrder(lastOrderAt: string | null, fallback: string): string {
  if (!lastOrderAt) {
    return fallback;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(lastOrderAt));
}

export function ClientProfileCard({ profile }: ClientProfileCardProps) {
  const client = profile.baseClient;
  const flag = FLAG_EMOJI[client.country] ?? '';
  const summaryWarning = profile.warnings.find((warning) => warning.includes('resumo'));
  const ordersWarning = profile.warnings.find((warning) => warning.includes('histórico'));
  const isLoading = profile.status === 'loading';
  const isUnavailable = profile.status === 'unavailable';
  const lastOrderFallback = profile.totalOrders === 0 ? 'Sem pedidos' : 'Indisponível';

  return (
    <Card data-testid="client-profile-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span>{flag}</span>
          {client.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{client.segment}</Badge>
          <Badge variant="outline">{client.country}</Badge>
        </div>

        {isLoading ? (
          <div className="space-y-3" data-testid="client-profile-loading" aria-busy="true">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : isUnavailable ? (
          <div
            className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900"
            data-testid="client-profile-unavailable"
            role="status"
          >
            <p className="font-medium">Resumo de compras temporariamente indisponível</p>
            <ul className="mt-2 space-y-1 text-xs">
              {profile.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-md bg-gray-50 px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Pedidos</p>
                <p className="mt-1 text-sm font-semibold text-gray-900" data-testid="client-profile-total-orders">
                  {profile.totalOrders ?? 'Indisponível'}
                </p>
              </div>
              <div className="rounded-md bg-gray-50 px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Total gasto</p>
                <p className="mt-1 text-sm font-semibold text-gray-900" data-testid="client-profile-total-spent">
                  {formatCurrency(profile.totalSpent)}
                </p>
              </div>
              <div className="rounded-md bg-gray-50 px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Última compra</p>
                <p className="mt-1 text-sm font-semibold text-gray-900" data-testid="client-profile-last-order-at">
                  {formatLastOrder(profile.lastOrderAt, lastOrderFallback)}
                </p>
              </div>
            </div>

            {summaryWarning && (
              <p className="text-xs text-amber-700" data-testid="client-profile-summary-warning">
                {summaryWarning}
              </p>
            )}

            <div>
              <p className="mb-2 text-xs font-medium text-gray-500">Últimos produtos comprados</p>
              {ordersWarning ? (
                <p className="text-xs text-amber-700" data-testid="client-profile-orders-warning">
                  {ordersWarning}
                </p>
              ) : profile.recentProducts.length === 0 ? (
                <p className="text-xs text-gray-400">Sem pedidos registrados</p>
              ) : (
                <ul className="space-y-1" data-testid="client-profile-recent-products">
                  {profile.recentProducts.slice(0, 5).map((product) => (
                    <li key={product.id} className="flex items-center gap-1 text-xs text-gray-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                      <span>{product.name}</span>
                      {product.category ? <span className="text-gray-400">({product.category})</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
