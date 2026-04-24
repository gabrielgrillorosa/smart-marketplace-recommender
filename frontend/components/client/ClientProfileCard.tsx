import type { Client } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const FLAG_EMOJI: Record<string, string> = {
  BR: '🇧🇷',
  MX: '🇲🇽',
  CO: '🇨🇴',
  NL: '🇳🇱',
  RO: '🇷🇴',
};

interface ClientProfileCardProps {
  client: Client;
}

export function ClientProfileCard({ client }: ClientProfileCardProps) {
  const flag = FLAG_EMOJI[client.country] ?? '';

  return (
    <Card>
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
        <p className="text-sm text-gray-600">
          <span className="font-medium">{client.totalOrders}</span> pedidos no total
        </p>
        <div>
          <p className="mb-2 text-xs font-medium text-gray-500">Últimos produtos comprados</p>
          {client.recentProducts.length === 0 ? (
            <p className="text-xs text-gray-400">Sem pedidos registrados</p>
          ) : (
            <ul className="space-y-1">
              {client.recentProducts.slice(0, 5).map((p) => (
                <li key={p.id} className="flex items-center gap-1 text-xs text-gray-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                  {p.name}
                  <span className="text-gray-400">({p.category})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
