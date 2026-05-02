import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CronScheduler } from './CronScheduler.js'
import { TrainingJobRegistry } from './TrainingJobRegistry.js'

describe('CronScheduler (ADR-067)', () => {
  let registry: { enqueue: ReturnType<typeof vi.fn> }
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    registry = { enqueue: vi.fn() }
    logSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
  })

  it('does not register a cron task when enabled is false', () => {
    const scheduler = new CronScheduler(registry as unknown as TrainingJobRegistry, { enabled: false })
    scheduler.start()
    expect(registry.enqueue).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Daily training cron disabled (ENABLE_DAILY_TRAIN=false)')
    )
  })
})
