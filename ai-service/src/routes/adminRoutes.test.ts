import { describe, it, expect, vi } from 'vitest'
import { buildApp } from '../tests/helpers/buildApp.js'
import { ConflictError } from '../services/ModelTrainer.js'

const VALID_KEY = 'test-admin-key-123'

const makeRegistry = (opts: { conflictOnEnqueue?: boolean } = {}) => ({
  enqueue: vi.fn(() => {
    if (opts.conflictOnEnqueue) {
      throw new ConflictError()
    }
    return { jobId: 'job-123', status: 'queued', message: 'Training job queued' }
  }),
  getJob: vi.fn((jobId: string) => {
    if (jobId === 'job-123') {
      return { jobId: 'job-123', status: 'queued', startedAt: new Date().toISOString() }
    }
    return undefined
  }),
  getActiveJobId: vi.fn(() => opts.conflictOnEnqueue ? 'job-123' : undefined),
})

const buildTestApp = async (registry: ReturnType<typeof makeRegistry>) =>
  buildApp({
    neo4jRepo: {},
    embeddingService: {},
    modelStore: {},
    modelTrainer: {},
    trainingJobRegistry: registry as never,
    adminApiKey: VALID_KEY,
    recommendationService: {},
    ragService: {},
    searchService: {},
  })

describe('adminRoutes — X-Admin-Key auth', () => {
  it('POST /model/train without X-Admin-Key → 401 Unauthorized (M7-24)', async () => {
    const app = await buildTestApp(makeRegistry())

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/model/train',
    })

    expect(response.statusCode).toBe(401)
    expect(JSON.parse(response.payload).error).toBe('Unauthorized')
  })

  it('POST /model/train with wrong X-Admin-Key → 401 (M7-26)', async () => {
    const app = await buildTestApp(makeRegistry())

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/model/train',
      headers: { 'x-admin-key': 'wrong-key' },
    })

    expect(response.statusCode).toBe(401)
  })

  it('POST /model/train with correct key → 202 with jobId (M7-27)', async () => {
    const app = await buildTestApp(makeRegistry())

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/model/train',
      headers: { 'x-admin-key': VALID_KEY },
    })

    expect(response.statusCode).toBe(202)
    const body = JSON.parse(response.payload)
    expect(body.jobId).toBeTruthy()
    expect(body.status).toBe('queued')
  })

  it('GET /model/train/status/:jobId is public — no X-Admin-Key required (M7-08)', async () => {
    const app = await buildTestApp(makeRegistry())

    // Route is now in public modelRoutes; buildTestApp does pass registry through buildApp
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/model/train/status/job-123',
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.payload).jobId).toBe('job-123')
  })

  it('GET /model/train/status/nonexistent → 404 (M7-10)', async () => {
    const app = await buildTestApp(makeRegistry())

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/model/train/status/nonexistent-id',
    })

    expect(response.statusCode).toBe(404)
    expect(JSON.parse(response.payload).error).toBe('Job not found')
  })

  it('POST /model/train while training in progress → 409 with jobId (concurrent guard)', async () => {
    const app = await buildTestApp(makeRegistry({ conflictOnEnqueue: true }))

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/model/train',
      headers: { 'x-admin-key': VALID_KEY },
    })

    expect(response.statusCode).toBe(409)
    const body = JSON.parse(response.payload)
    expect(body.jobId).toBe('job-123')
  })
})
