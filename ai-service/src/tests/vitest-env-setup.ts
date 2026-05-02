/** Vitest: keep profile pooling off `attention_learned` unless a test sets it (avoids requiring JSON at import). */
if (!process.env.PROFILE_POOLING_MODE) {
  process.env.PROFILE_POOLING_MODE = 'mean'
}
