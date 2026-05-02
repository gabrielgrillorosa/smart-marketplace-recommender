'use client';

/** M18 — AD-055 literal; stable test id (design §8). */
export function RankingFooterHeading() {
  return (
    <p
      data-testid="catalog-ranking-footer-heading"
      className="text-center text-xs text-gray-400"
      role="separator"
      aria-label="Fora do ranking nesta janela"
    >
      —— Fora do ranking nesta janela ——
    </p>
  );
}
