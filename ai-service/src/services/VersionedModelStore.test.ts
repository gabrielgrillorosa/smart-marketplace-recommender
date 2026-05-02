import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { VersionedModelStore, FsPort } from '../services/VersionedModelStore.js'
import type { TrainingResult } from '../types/index.js'

const makeResult = (overrides: Partial<TrainingResult> = {}): TrainingResult => ({
  status: 'trained',
  epochs: 20,
  finalLoss: 0.1,
  finalAccuracy: 0.9,
  trainingSamples: 100,
  durationMs: 1000,
  syncedAt: new Date().toISOString(),
  precisionAt5: 0.6,
  neuralHeadKind: 'bce_sigmoid',
  ...overrides,
})

const makeFakeModel = () => ({
  save: vi.fn(async () => {}),
})

const makeFsPort = (overrides: Partial<FsPort> = {}): FsPort => ({
  symlink: vi.fn(async () => {}),
  unlink: vi.fn(async () => {}),
  rm: vi.fn(async () => {}),
  readdir: vi.fn(async () => []),
  stat: vi.fn(async () => ({ mtimeMs: Date.now(), isFile: true, isDirectory: false })),
  mkdir: vi.fn(async () => {}),
  readlink: vi.fn(async () => {
    throw new Error('ENOENT')
  }),
  ...overrides,
})

describe('VersionedModelStore', () => {
  let fsPort: ReturnType<typeof makeFsPort>
  let store: VersionedModelStore
  const originalTolerance = process.env.MODEL_PROMOTION_TOLERANCE

  beforeEach(() => {
    fsPort = makeFsPort()
    store = new VersionedModelStore(fsPort)
    delete process.env.MODEL_PROMOTION_TOLERANCE
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env.MODEL_PROMOTION_TOLERANCE = originalTolerance
  })

  describe('saveVersioned()', () => {
    it('promotes first model when there is no current precision baseline', async () => {
      const model = makeFakeModel()
      const result = makeResult({ precisionAt5: 0.5 })

      await store.saveVersioned(
        model as unknown as import('@tensorflow/tfjs-node').LayersModel,
        result,
        { triggeredBy: 'manual' }
      )

      expect(fsPort.symlink).toHaveBeenCalled()
      const governance = store.getGovernanceStatus()
      expect(governance.lastTrainingResult).toBe('promoted')
      expect(governance.currentVersion).toBeTruthy()
    })

    it('promotes candidate inside default tolerance band (0.02)', async () => {
      const model1 = makeFakeModel()
      const result1 = makeResult({ precisionAt5: 0.8 })
      await store.saveVersioned(
        model1 as unknown as import('@tensorflow/tfjs-node').LayersModel,
        result1,
        { triggeredBy: 'manual' }
      )

      const symlinkCallCount = (fsPort.symlink as ReturnType<typeof vi.fn>).mock.calls.length

      const model2 = makeFakeModel()
      const result2 = makeResult({ precisionAt5: 0.79 })
      await store.saveVersioned(
        model2 as unknown as import('@tensorflow/tfjs-node').LayersModel,
        result2,
        { triggeredBy: 'checkout', orderId: 'order-1' }
      )

      expect((fsPort.symlink as ReturnType<typeof vi.fn>).mock.calls.length).toBe(symlinkCallCount + 1)
      const governance = store.getGovernanceStatus()
      expect(governance.lastTrainingResult).toBe('promoted')
      expect(governance.lastTrainingTriggeredBy).toBe('checkout')
      expect(governance.lastOrderId).toBe('order-1')
    })

    it('rejects candidate below currentPrecisionAt5 - tolerance and records decision metadata', async () => {
      const promotedModel = makeFakeModel()
      await store.saveVersioned(
        promotedModel as unknown as import('@tensorflow/tfjs-node').LayersModel,
        makeResult({ precisionAt5: 0.8 }),
        { triggeredBy: 'manual' }
      )

      const symlinkCallCount = (fsPort.symlink as ReturnType<typeof vi.fn>).mock.calls.length
      const weakerCandidate = makeFakeModel()
      await store.saveVersioned(
        weakerCandidate as unknown as import('@tensorflow/tfjs-node').LayersModel,
        makeResult({ precisionAt5: 0.75 }),
        { triggeredBy: 'checkout', orderId: 'order-2' }
      )

      expect((fsPort.symlink as ReturnType<typeof vi.fn>).mock.calls.length).toBe(symlinkCallCount)

      const governance = store.getGovernanceStatus()
      expect(governance.lastTrainingResult).toBe('rejected')
      expect(governance.lastDecision?.accepted).toBe(false)
      expect(governance.lastDecision?.candidatePrecisionAt5).toBe(0.75)
      expect(governance.lastDecision?.currentPrecisionAt5).toBe(0.8)
      expect(governance.lastDecision?.tolerance).toBe(0.02)
      expect(governance.lastDecision?.currentVersion).toBeTruthy()
    })

    it('supports strict zero tolerance when MODEL_PROMOTION_TOLERANCE=0', async () => {
      process.env.MODEL_PROMOTION_TOLERANCE = '0'

      await store.saveVersioned(
        makeFakeModel() as unknown as import('@tensorflow/tfjs-node').LayersModel,
        makeResult({ precisionAt5: 0.8 }),
        { triggeredBy: 'manual' }
      )

      const symlinkCallCount = (fsPort.symlink as ReturnType<typeof vi.fn>).mock.calls.length

      await store.saveVersioned(
        makeFakeModel() as unknown as import('@tensorflow/tfjs-node').LayersModel,
        makeResult({ precisionAt5: 0.79 }),
        { triggeredBy: 'manual' }
      )

      expect((fsPort.symlink as ReturnType<typeof vi.fn>).mock.calls.length).toBe(symlinkCallCount)
      expect(store.getGovernanceStatus().lastTrainingResult).toBe('rejected')
    })

    it('marks failed governance metadata when training fails', () => {
      store.markTrainingFailed({ triggeredBy: 'checkout', orderId: 'order-3' })
      const governance = store.getGovernanceStatus()
      expect(governance.lastTrainingResult).toBe('failed')
      expect(governance.lastTrainingTriggeredBy).toBe('checkout')
      expect(governance.lastOrderId).toBe('order-3')
    })
  })

  describe('loadCurrent()', () => {
    it('does not crash when no model files are present (M7-23)', async () => {
      const emptyFsPort = makeFsPort({
        readlink: vi.fn(async () => { throw new Error('ENOENT') }),
        readdir: vi.fn(async () => []),
      })
      const emptyStore = new VersionedModelStore(emptyFsPort)

      await expect(emptyStore.loadCurrent()).resolves.toBeUndefined()
    })

    it('resolves symlink when it exists', async () => {
      const symlinkFsPort = makeFsPort({
        readlink: vi.fn(async () => 'model-2026-04-25T02-00-00-000Z'),
        readdir: vi.fn(async () => ['model-2026-04-25T02-00-00-000Z.json']),
      })
      const symlinkStore = new VersionedModelStore(symlinkFsPort)

      // loadCurrent will attempt to call tf.loadLayersModel which we can't mock easily here
      // so we just verify it calls readlink without throwing
      try {
        await symlinkStore.loadCurrent()
      } catch {
        // expected — tf.loadLayersModel won't work in unit test context
      }

      expect(symlinkFsPort.readlink).toHaveBeenCalled()
    })
  })

  describe('pruneHistory()', () => {
    it('deletes files beyond 5 most recent', async () => {
      const mtime = Date.now()
      const files = Array.from({ length: 7 }, (_, i) => `model-2026-0${i + 1}-01T00-00-00-000Z.json`)

      const pruneFsPort = makeFsPort({
        readdir: vi.fn(async () => files),
        stat: vi.fn(async (p: string) => {
          const idx = files.findIndex((f) => p.endsWith(f))
          const i = idx >= 0 ? idx : 0
          return { mtimeMs: mtime - i * 1000, isFile: true, isDirectory: false }
        }),
        unlink: vi.fn(async () => {}),
        rm: vi.fn(async () => {}),
      })
      const pruneStore = new VersionedModelStore(pruneFsPort)

      await pruneStore.pruneHistory()

      // Should have deleted 2 oldest files (7 - 5 = 2)
      expect((pruneFsPort.unlink as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)
    })

    it('does not delete anything when files <= 5', async () => {
      const files = ['model-2026-01-01T00-00-00-000Z.json', 'model-2026-02-01T00-00-00-000Z.json']
      const pruneFsPort = makeFsPort({
        readdir: vi.fn(async () => files),
        stat: vi.fn(async () => ({
          mtimeMs: Date.now(),
          isFile: true,
          isDirectory: false,
        })),
        unlink: vi.fn(async () => {}),
        rm: vi.fn(async () => {}),
      })
      const pruneStore = new VersionedModelStore(pruneFsPort)

      await pruneStore.pruneHistory()

      expect((pruneFsPort.unlink as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0)
    })
  })
})
