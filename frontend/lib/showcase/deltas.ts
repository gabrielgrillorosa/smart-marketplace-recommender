import type { RecommendationResult } from '@/lib/types';
import { hasSameRankingWindow, type RankingWindow } from './ranking-window';

/** PE-04 (M19 / ADR-066): when M17 sends rankScore, Δ aligns with visible grid order. */
export function scoreForRecommendationDelta(r: RecommendationResult): number | null {
  if (r.finalScore == null) return null;
  return r.rankScore ?? r.finalScore;
}

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
        previousScore: scoreForRecommendationDelta(recommendation),
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

      const currentScore = scoreForRecommendationDelta(recommendation);
      if (currentScore == null) {
        return [
          recommendation.product.id,
          {
            kind: 'unchanged',
            previousRank: previousEntry.previousRank,
            currentRank,
            scoreDelta: 0,
          },
        ];
      }

      const scoreDelta =
        previousEntry.previousScore == null ? 0 : currentScore - previousEntry.previousScore;
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
