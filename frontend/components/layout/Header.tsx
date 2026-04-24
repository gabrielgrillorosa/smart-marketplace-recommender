'use client';

import { useServiceHealth } from '@/lib/hooks/useServiceHealth';
import { ServiceStatusBadge } from './ServiceStatusBadge';

export function Header() {
  const { apiStatus, aiStatus } = useServiceHealth();

  return (
    <header className="border-b bg-white px-6 py-4">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🛒</span>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Smart Marketplace Recommender</h1>
            <p className="text-xs text-gray-500">AI-powered B2B product recommendations</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ServiceStatusBadge label="API Service" status={apiStatus} />
          <ServiceStatusBadge label="AI Service" status={aiStatus} />
        </div>
      </div>
    </header>
  );
}
