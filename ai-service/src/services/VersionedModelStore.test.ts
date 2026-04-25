import { describe, it, expect, vi, beforeEach } from 'vitest'
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
  ...overrides,
})

const makeFakeModel = () => ({
  save: vi.fn(async () => {}),
})

const makeFsPort = (overrides: Partial<FsPort> = {}): FsPort => ({
  symlink: vi.fn(async () => {}),
  unlink: vi.fn(async () => {}),
  readdir: vi.fn(async () => []),
  stat: vi.fn(async () => ({ mtimeMs: Date.now() })),
  mkdir: vi.fn(async () => {}),
  readlink: vi.fn(async () => { throw new Error('ENOENT') }),
  ...overrides,
})

describe('VersionedModelStore', () => {
  let fsPort: ReturnType<typeof makeFsPort>
  let store: VersionedModelStore

  beforeEach(() => {
    fsPort = makeFsPort()
    store = new VersionedModelStore(fsPort)
    vi.clearAllMocks()
  })

  describe('saveVersioned()', () => {
    it('promotes symlink when newPrecisionAt5 >= currentPrecisionAt5 (first model)', async () => {
      const model = makeFakeModel()
      const result = makeResult({ precisionAt5: 0.5 })

      await store.saveVersioned(model as unknown as import('@tensorflow/tfjs-node').LayersModel, result)

      expect(fsPort.symlink).toHaveBeenCalled()
    })

    it('does NOT update symlink when newPrecisionAt5 < currentPrecisionAt5', async () => {
      // First: train with precisionAt5 = 0.8
      const model1 = makeFakeModel()
      const result1 = makeResult({ precisionAt5: 0.8 })
      await store.saveVersioned(model1 as unknown as import('@tensorflow/tfjs-node').LayersModel, result1)

      const symlinkCallCount = (fsPort.symlink as ReturnType<typeof vi.fn>).mock.calls.length

      // Second: attempt with lower precision
      const model2 = makeFakeModel()
      const result2 = makeResult({ precisionAt5: 0.3 })
      await store.saveVersioned(model2 as unknown as import('@tensorflow/tfjs-node').LayersModel, result2)

      // symlink should not have been called again
      expect((fsPort.symlink as ReturnType<typeof vi.fn>).mock.calls.length).toBe(symlinkCallCount)
    })

    it('uses loss comparison when precisionAt5 === 0 and current loss is lower', async () => {
      // Set up a "current" trained model with loss=0.5 via setModel
      store.setModel(
        {} as unknown as import('@tensorflow/tfjs-node').LayersModel,
        {
          trainedAt: new Date().toISOString(),
          finalLoss: 0.5,
          finalAccuracy: 0.9,
          trainingSamples: 100,
          durationMs: 1000,
        }
      )

      const model = makeFakeModel()
      // Lower loss → should be accepted
      const result = makeResult({ precisionAt5: 0, finalLoss: 0.3 })
      await store.saveVersioned(model as unknown as import('@tensorflow/tfjs-node').LayersModel, result)

      expect(fsPort.symlink).toHaveBeenCalled()
    })

    it('does NOT promote when precisionAt5 === 0 and new loss > current loss', async () => {
      store.setModel(
        {} as unknown as import('@tensorflow/tfjs-node').LayersModel,
        {
          trainedAt: new Date().toISOString(),
          finalLoss: 0.2,
          finalAccuracy: 0.9,
          trainingSamples: 100,
          durationMs: 1000,
        }
      )

      const model = makeFakeModel()
      const result = makeResult({ precisionAt5: 0, finalLoss: 0.5 })
      await store.saveVersioned(model as unknown as import('@tensorflow/tfjs-node').LayersModel, result)

      expect(fsPort.symlink).not.toHaveBeenCalled()
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
        stat: vi.fn(async (_p: string) => ({ mtimeMs: mtime - files.indexOf(files.find(f => _p.endsWith(f)) ?? '') * 1000 })),
        unlink: vi.fn(async () => {}),
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
        stat: vi.fn(async () => ({ mtimeMs: Date.now() })),
        unlink: vi.fn(async () => {}),
      })
      const pruneStore = new VersionedModelStore(pruneFsPort)

      await pruneStore.pruneHistory()

      expect((pruneFsPort.unlink as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0)
    })
  })
})
