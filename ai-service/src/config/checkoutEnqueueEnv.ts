/**
 * M20 / ADR-067 — Checkout SHALL sync Neo4j `BOUGHT` without enqueueing training by default.
 * Set `CHECKOUT_ENQUEUE_TRAINING=true` to restore legacy “train on every checkout” behaviour.
 */
export function isCheckoutEnqueueTrainingEnabled(): boolean {
  const v = process.env.CHECKOUT_ENQUEUE_TRAINING?.trim().toLowerCase()
  if (v === undefined || v === '') return false
  return v === 'true' || v === '1' || v === 'yes'
}
