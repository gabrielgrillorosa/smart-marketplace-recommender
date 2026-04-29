import type { RecommendationResult } from '@/lib/types';
import { hasSameRankingWindow, type RankingWindow } from './ranking-window';

interface DeltaSnapshot {
  recommendations: RecommendationResult[];
  window: RankingWindow;
}

export type RecommendationDelta =
  | {
      kind: 'moved';
      direction: 'up' | 'down';
      previousRank: number;
      currentRank: number;
      scoreDelta: number;
    }
  | {
      kind: 'unchanged';
      previousRank: number;
      currentRank: number;
      scoreDelta: number;
    }
  | {
      kind: 'new';
      currentRank: number;
    }
  | {
      kind: 'outOfWindow';
      currentRank: number;
    };

export function buildRecommendationDeltaMap(
  previous: DeltaSnapshot | null,
  current: DeltaSnapshot | null
): Record<string, RecommendationDelta> {
  if (!previous || !current) {
    return {};
  }

  if (!hasSameRankingWindow(previous.window, current.window)) {
    return {};
  }

  const previousByProductId = new Map(
    previous.recommendations.map((recommendation, index) => [
      recommendation.product.id,
      {
        previousRank: index + 1,
        previousScore: recommendation.finalScore,
      },
    ])
  );

  return Object.fromEntries(
    current.recommendations.map((recommendation, index) => {
      const currentRank = index + 1;
      const previousEntry = previousByProductId.get(recommendation.product.id);

      if (!previousEntry) {
        return [
          recommendation.product.id,
          previous.window.truncated
            ? { kind: 'outOfWindow', currentRank }
            : { kind: 'new', currentRank },
        ];
      }

      const scoreDelta = recommendation.finalScore - previousEntry.previousScore;
      if (previousEntry.previousRank === currentRank) {
        return [
          recommendation.product.id,
          {
            kind: 'unchanged',
            previousRank: previousEntry.previousRank,
            currentRank,
            scoreDelta,
          },
        ];
      }

      return [
        recommendation.product.id,
        {
          kind: 'moved',
          direction: currentRank < previousEntry.previousRank ? 'up' : 'down',
          previousRank: previousEntry.previousRank,
          currentRank,
          scoreDelta,
        },
      ];
    })
  );
}
