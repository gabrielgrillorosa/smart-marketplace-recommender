'use client';

import { Badge } from '@/components/ui/badge';
import type { EligibilityBadge as EligibilityBadgeModel } from '@/lib/catalog/eligibility';
import { cn } from '@/lib/utils';

interface EligibilityBadgeProps {
  badge: EligibilityBadgeModel;
}

export function EligibilityBadge({ badge }: EligibilityBadgeProps) {
  const variantClass =
    badge.variant === 'amber'
      ? 'border-amber-300 bg-amber-50 text-amber-900'
      : badge.variant === 'blue'
        ? 'border-blue-200 bg-blue-50 text-blue-900'
        : 'border-gray-200 bg-gray-50 text-gray-800';

  return (
    <Badge
      role="status"
      variant="outline"
      className={cn('max-w-[11rem] whitespace-normal text-left text-xs font-medium leading-snug', variantClass)}
      title={badge.suppressionUntil ? `Retorno ao ranking: ${badge.suppressionUntil}` : undefined}
    >
      {badge.label}
    </Badge>
  );
}
