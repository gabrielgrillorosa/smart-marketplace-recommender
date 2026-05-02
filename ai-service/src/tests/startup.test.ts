import { describe, expect, it, vi } from 'vitest'
import { buildStartupApp } from './helpers/buildStartupApp.js'

describe('startup bootstrap', () => {
  it('cold boot schedules recovery after server starts; /health=200 and /ready=503 during recovery', async () => {
    const modelRef: { current: object | null } = { current: null }
    const blockingRef = { current: false }

    const startupRecoveryService = {
      isBlockingReadiness: vi.fn(() => blockingRef.current),
      scheduleRecovery: vi.fn(async () => {
        blockingRef.current = true
      }),
    }

    const appHarness = await buildStartupApp({
      autoHealModel: true,
      embeddingService: { isReady: true },
      versionedModelStore: {
        getModel: vi.fn(() => modelRef.current),
      },
      startupRecoveryService,
    })

    expect(startupRecoveryService.scheduleRecovery).not.toHaveBeenCalled()
    await appHarness.start()

    expect(startupRecoveryService.scheduleRecovery).toHaveBeenCalledOnce()

    const healthResponse = await appHarness.app.inject({
      method: 'GET',
      url: '/health',
    })
    expect(healthResponse.statusCode).toBe(200)

    const readyResponse = await appHarness.app.inject({
      method: 'GET',
      url: '/ready',
    })
    expect(readyResponse.statusCode).toBe(503)
    expect(JSON.parse(readyResponse.payload)).toEqual(
      expect.objectContaining({
        ready: false,
        modelPresent: false,
        recoveryBlocking: true,
      })
    )

    await appHarness.close()
  })

  it('/ready becomes 200 after successful startup recovery', async () => {
    const modelRef: { current: object | null } = { current: null }
    const blockingRef = { current: false }

    const startupRecoveryService = {
      isBlockingReadiness: vi.fn(() => blockingRef.current),
      scheduleRecovery: vi.fn(async () => {
        blockingRef.current = true
        modelRef.current = {}
        blockingRef.current = false
      }),
    }

    const appHarness = await buildStartupApp({
      autoHealModel: true,
      embeddingService: { isReady: true },
      versionedModelStore: {
        getModel: vi.fn(() => modelRef.current),
      },
      startupRecoveryService,
    })

    await appHarness.start()

    const readyResponse = await appHarness.app.inject({
      method: 'GET',
      url: '/ready',
    })
    expect(readyResponse.statusCode).toBe(200)
    expect(JSON.parse(readyResponse.payload).ready).toBe(true)

    await appHarness.close()
  })

  it('blocked startup path keeps /ready=503 while /health stays 200', async () => {
    const modelRef: { current: object | null } = { current: null }
    const blockingRef = { current: false }

    const startupRecoveryService = {
      isBlockingReadiness: vi.fn(() => blockingRef.current),
      scheduleRecovery: vi.fn(async () => {
        blockingRef.current = true
      }),
    }

    const appHarness = await buildStartupApp({
      autoHealModel: true,
      embeddingService: { isReady: true },
      versionedModelStore: {
        getModel: vi.fn(() => modelRef.current),
      },
      startupRecoveryService,
    })

    await appHarness.start()

    const healthResponse = await appHarness.app.inject({
      method: 'GET',
      url: '/health',
    })
    expect(healthResponse.statusCode).toBe(200)

    const readyResponse = await appHarness.app.inject({
      method: 'GET',
      url: '/ready',
    })
    expect(readyResponse.statusCode).toBe(503)
    expect(JSON.parse(readyResponse.payload)).toEqual(
      expect.objectContaining({
        ready: false,
        modelPresent: false,
        recoveryBlocking: true,
      })
    )

    await appHarness.close()
  })

  it('AUTO_HEAL_MODEL=false keeps no-model boot alive, unready, and without background recovery', async () => {
    const modelRef: { current: object | null } = { current: null }
    const startupRecoveryService = {
      isBlockingReadiness: vi.fn(() => false),
      scheduleRecovery: vi.fn(async () => {}),
    }

    const appHarness = await buildStartupApp({
      autoHealModel: false,
      embeddingService: { isReady: true },
      versionedModelStore: {
        getModel: vi.fn(() => modelRef.current),
      },
      startupRecoveryService,
    })

    await appHarness.start()

    expect(startupRecoveryService.scheduleRecovery).not.toHaveBeenCalled()

    const healthResponse = await appHarness.app.inject({
      method: 'GET',
      url: '/health',
    })
    expect(healthResponse.statusCode).toBe(200)

    const readyResponse = await appHarness.app.inject({
      method: 'GET',
      url: '/ready',
    })
    expect(readyResponse.statusCode).toBe(503)
    expect(JSON.parse(readyResponse.payload).ready).toBe(false)

    await appHarness.close()
  })

  it('warm boot with model still schedules recovery (embedding gap-fill; train skipped inside service)', async () => {
    const modelRef: { current: object | null } = { current: {} }
    const startupRecoveryService = {
      isBlockingReadiness: vi.fn(() => false),
      scheduleRecovery: vi.fn(async () => {}),
    }

    const appHarness = await buildStartupApp({
      autoHealModel: true,
      embeddingService: { isReady: true },
      versionedModelStore: {
        getModel: vi.fn(() => modelRef.current),
      },
      startupRecoveryService,
    })

    await appHarness.start()

    expect(startupRecoveryService.scheduleRecovery).toHaveBeenCalledOnce()

    const readyResponse = await appHarness.app.inject({
      method: 'GET',
      url: '/ready',
    })
    expect(readyResponse.statusCode).toBe(200)
    expect(JSON.parse(readyResponse.payload).ready).toBe(true)

    await appHarness.close()
  })
})
