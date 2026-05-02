/** ADR-067 / M20 — delta baseline for the last showcase column. */
export type ShowcaseDeltaMode = 'cartAware' | 'postRetrain';

export const SHOWCASE_DELTA_MODE: ShowcaseDeltaMode =
  process.env.NEXT_PUBLIC_SHOWCASE_DELTA_MODE === 'cartAware' ? 'cartAware' : 'postRetrain';

/** When true, hide the «Com Carrinho» column (demo-only). */
export const SHOWCASE_HIDE_CART_COLUMN =
  process.env.NEXT_PUBLIC_SHOWCASE_HIDE_CART_COLUMN === 'true';
