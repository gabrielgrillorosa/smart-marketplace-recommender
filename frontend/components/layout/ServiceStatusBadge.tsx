import type { ServiceStatus } from '@/lib/types';

interface ServiceStatusBadgeProps {
  label: string;
  status: ServiceStatus;
}

const statusConfig: Record<ServiceStatus, { bg: string; text: string; icon: string }> = {
  up: { bg: 'bg-green-100', text: 'text-green-800', icon: '✓' },
  down: { bg: 'bg-red-100', text: 'text-red-800', icon: '✗' },
  unknown: { bg: 'bg-gray-100', text: 'text-gray-600', icon: '…' },
};

export function ServiceStatusBadge({ label, status }: ServiceStatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bg} ${config.text}`}
    >
      <span>{config.icon}</span>
      {label}
    </span>
  );
}
