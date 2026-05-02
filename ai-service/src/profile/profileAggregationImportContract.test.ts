import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * ADR-065 QA + M21 design: production `.ts` under `src/` that imports `aggregateClientProfileEmbeddings`
 * from `clientProfileAggregation` must stay on this list. If you add a legitimate new call site,
 * append its path relative to `ai-service/` (POSIX slashes), then run `npm test`.
 *
 * **CWD:** this test assumes `npm test` is run with `process.cwd()` = the `ai-service` package root
 * (same as `package.json` scripts).
 */
const CANONICAL_IMPORTERS_FROM_AI_SERVICE_ROOT = [
  'src/ml/rankingEval.ts',
  'src/services/RecommendationService.ts',
  'src/services/training-utils.ts',
]

const importRe = /from\s+['"][^'"]*clientProfileAggregation\.js['"]/

function listProductionImporters(aiServiceRoot: string): string[] {
  const out = new Set<string>()
  function walk(dir: string) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === 'node_modules' || ent.name === 'dist') continue
      const p = path.join(dir, ent.name)
      if (ent.isDirectory()) walk(p)
      else if (ent.isFile() && ent.name.endsWith('.ts') && !ent.name.endsWith('.test.ts')) {
        if (p.endsWith(`${path.sep}clientProfileAggregation.ts`)) continue
        const text = fs.readFileSync(p, 'utf8')
        if (!text.includes('aggregateClientProfileEmbeddings')) continue
        if (importRe.test(text)) {
          out.add(path.relative(aiServiceRoot, p).split(path.sep).join('/'))
        }
      }
    }
  }
  walk(path.join(aiServiceRoot, 'src'))
  return [...out].sort()
}

describe('profile aggregation import contract (M21 A)', () => {
  it('only canonical modules import aggregateClientProfileEmbeddings from clientProfileAggregation', () => {
    const aiServiceRoot = process.cwd()
    const found = listProductionImporters(aiServiceRoot)
    expect(found).toEqual([...CANONICAL_IMPORTERS_FROM_AI_SERVICE_ROOT].sort())
  })
})
