# API Service (Spring Boot)

## Checkout ↔ training expectation (M20 / ADR-067)

The checkout JSON body includes `expectedTrainingTriggered`. It reflects Spring property:

`training.checkout.enqueue=${CHECKOUT_ENQUEUE_TRAINING:false}`

Keep this aligned with **ai-service** `CHECKOUT_ENQUEUE_TRAINING`. If they diverge, the Next.js client may poll for training after checkout while the ai-service never enqueued a job.
