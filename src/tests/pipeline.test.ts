/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import webhookTest from '../test'
import { storeEventHelper, fetchAndLockHelper, recordResultHelper, sweepExpiredHelper } from '../component/event/mutations'
import { getEventHelper, listEventsHelper, listDlqHelper } from '../component/event/queries'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

function makeT() {
  return convexTest(webhookTest.schema, webhookTest.modules)
}

const BASE_ARGS = {
  provider: 'test',
  rawBody: '{"id":"evt_1"}',
  headers: { 'x-test-event': 'ping' },
  handlerFunctionHandle: 'test:action:handler',
  maxAttempts: 3,
  expiresInMs: 24 * 60 * 60 * 1000,
} as const

describe('pipeline - ingestion', () => {
  it('storeEvent creates a webhookEvents entry with pending status', async () => {
    const t = makeT()
    await t.run(async (ctx) => {
      await storeEventHelper(ctx, BASE_ARGS)
      const rows = await ctx.db.query('webhookEvents').collect()
      expect(rows).toHaveLength(1)
      expect(rows[0].status).toBe('pending')
      expect(rows[0].provider).toBe('test')
    })
  })

  it('storeEvent with a dedupKey inserts a webhookDedup record', async () => {
    const t = makeT()
    await t.run(async (ctx) => {
      await storeEventHelper(ctx, { ...BASE_ARGS, dedupKey: 'evt_dedup_001' })
      const dedup = await ctx.db.query('webhookDedup').collect()
      expect(dedup).toHaveLength(1)
      expect(dedup[0].dedupKey).toBe('evt_dedup_001')
    })
  })

  it('storeEvent rejects a duplicate dedupKey silently', async () => {
    const t = makeT()
    await t.run(async (ctx) => {
      const r1 = await storeEventHelper(ctx, { ...BASE_ARGS, dedupKey: 'evt_dedup_002' })
      const r2 = await storeEventHelper(ctx, { ...BASE_ARGS, dedupKey: 'evt_dedup_002' })
      expect(r1.accepted).toBe(true)
      expect(r2.accepted).toBe(false)
      const rows = await ctx.db.query('webhookEvents').collect()
      expect(rows).toHaveLength(1)
    })
  })

  it('fetchAndLock transitions event status to processing', async () => {
    const t = makeT()
    await t.run(async (ctx) => {
      const id = await ctx.db.insert('webhookEvents', {
        provider: 'test',
        rawBody: '{}',
        headers: {},
        status: 'pending',
        handlerFunctionHandle: 'test:action:handler',
        receivedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        maxAttempts: 3,
        attemptCount: 0,
      })
      await fetchAndLockHelper(ctx, { eventId: id.toString() })
      const updated = await ctx.db.get(id)
      expect(updated?.status).toBe('processing')
    })
  })
})

describe('pipeline - result recording', () => {
  it('recordResult marks event as delivered on success', async () => {
    const t = makeT()
    await t.run(async (ctx) => {
      const id = await ctx.db.insert('webhookEvents', {
        provider: 'test',
        rawBody: '{}',
        headers: {},
        status: 'processing',
        handlerFunctionHandle: 'test:action:handler',
        receivedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        maxAttempts: 3,
        attemptCount: 1,
      })
      await recordResultHelper(ctx, { eventId: id.toString(), attemptCount: 1, maxAttempts: 3, success: true })
      const updated = await ctx.db.get(id)
      expect(updated?.status).toBe('delivered')
    })
  })

  it('recordResult marks event as failed and increments attemptCount on non-final failure', async () => {
    const t = makeT()
    await t.run(async (ctx) => {
      const id = await ctx.db.insert('webhookEvents', {
        provider: 'test',
        rawBody: '{}',
        headers: {},
        status: 'processing',
        handlerFunctionHandle: 'test:action:handler',
        receivedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        maxAttempts: 3,
        attemptCount: 1,
      })
      await recordResultHelper(ctx, { eventId: id.toString(), attemptCount: 1, maxAttempts: 3, success: false, error: 'timeout' })
      const updated = await ctx.db.get(id)
      expect(updated?.status).toBe('failed')
      expect(updated?.attemptCount).toBe(2)
    })
  })

  it('recordResult moves event to dead and writes DLQ entry after exhausting all attempts', async () => {
    const t = makeT()
    await t.run(async (ctx) => {
      const id = await ctx.db.insert('webhookEvents', {
        provider: 'test',
        rawBody: '{}',
        headers: {},
        status: 'processing',
        handlerFunctionHandle: 'test:action:handler',
        receivedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        maxAttempts: 3,
        attemptCount: 3,
      })
      await recordResultHelper(ctx, { eventId: id.toString(), attemptCount: 3, maxAttempts: 3, success: false, error: 'handler threw' })
      const updated = await ctx.db.get(id)
      expect(updated?.status).toBe('dead')
      const dlq = await ctx.db.query('webhookDlq').collect()
      expect(dlq).toHaveLength(1)
      expect(dlq[0].eventId).toBe(id)
    })
  })
})

describe('pipeline - queries', () => {
  it('getEvent returns the event document for a known ID', async () => {
    const t = makeT()
    await t.run(async (ctx) => {
      const id = await ctx.db.insert('webhookEvents', {
        provider: 'test',
        rawBody: '{"id":"evt_q1"}',
        headers: {},
        status: 'delivered',
        handlerFunctionHandle: 'test:action:handler',
        receivedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        maxAttempts: 3,
        attemptCount: 1,
      })
      const result = await getEventHelper(ctx, { eventId: id.toString() })
      expect(result).not.toBeNull()
      expect(result?.provider).toBe('test')
    })
  })

  it('getEvent returns null for an unknown ID', async () => {
    const t = makeT()
    await t.run(async (ctx) => {
      const result = await getEventHelper(ctx, { eventId: 'nonexistent_id' })
      expect(result).toBeNull()
    })
  })

  it('listEvents returns all non-expired events', async () => {
    const t = makeT()
    await t.run(async (ctx) => {
      await ctx.db.insert('webhookEvents', {
        provider: 'test',
        rawBody: '{}',
        headers: {},
        status: 'delivered',
        handlerFunctionHandle: 'test:action:handler',
        receivedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        maxAttempts: 3,
        attemptCount: 1,
      })
      const results = await listEventsHelper(ctx)
      expect(results).toHaveLength(1)
    })
  })

  it('listDlq returns all DLQ entries', async () => {
    const t = makeT()
    await t.run(async (ctx) => {
      const eventId = await ctx.db.insert('webhookEvents', {
        provider: 'test',
        rawBody: '{}',
        headers: {},
        status: 'dead',
        handlerFunctionHandle: 'test:action:handler',
        receivedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        maxAttempts: 3,
        attemptCount: 3,
      })
      await ctx.db.insert('webhookDlq', { eventId, movedAt: Date.now() })
      const results = await listDlqHelper(ctx)
      expect(results).toHaveLength(1)
      expect(results[0].eventId).toBe(eventId)
    })
  })
})

describe('pipeline - expiry', () => {
  it('sweepExpired removes delivered events past their expiresAt', async () => {
    const t = makeT()
    await t.run(async (ctx) => {
      await ctx.db.insert('webhookEvents', {
        provider: 'test',
        rawBody: '{}',
        headers: {},
        status: 'delivered',
        handlerFunctionHandle: 'test:action:handler',
        receivedAt: Date.now() - 10000,
        expiresAt: Date.now() - 1000,
        maxAttempts: 3,
        attemptCount: 1,
      })
      await sweepExpiredHelper(ctx)
      const rows = await ctx.db.query('webhookEvents').collect()
      expect(rows).toHaveLength(0)
    })
  })

  it('sweepExpired does not remove events that have not yet expired', async () => {
    const t = makeT()
    await t.run(async (ctx) => {
      await ctx.db.insert('webhookEvents', {
        provider: 'test',
        rawBody: '{}',
        headers: {},
        status: 'delivered',
        handlerFunctionHandle: 'test:action:handler',
        receivedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        maxAttempts: 3,
        attemptCount: 1,
      })
      await sweepExpiredHelper(ctx)
      const rows = await ctx.db.query('webhookEvents').collect()
      expect(rows).toHaveLength(1)
    })
  })
})

describe('pipeline - retry cycle', () => {
  it('retries a failing handler until maxAttempts then writes to DLQ', async () => {
    const t = makeT()

    // Store the event directly via helper
    const eventId = await t.run(async (ctx) => {
      const result = await storeEventHelper(ctx, { ...BASE_ARGS, maxAttempts: 2 })
      return result.accepted ? result.eventId : null
    })
    expect(eventId).not.toBeNull()

    // Attempt 1: lock then fail (attemptCount 0 → 1, not final)
    await t.run(async (ctx) => {
      const event = await fetchAndLockHelper(ctx, { eventId: eventId! })
      await recordResultHelper(ctx, { eventId: eventId!, attemptCount: event!.attemptCount, maxAttempts: 2, success: false, error: 'timeout' })
    })

    // Attempt 2: lock then fail (attemptCount 1 → 2, final → dead + DLQ)
    await t.run(async (ctx) => {
      const event = await fetchAndLockHelper(ctx, { eventId: eventId! })
      await recordResultHelper(ctx, { eventId: eventId!, attemptCount: event!.attemptCount, maxAttempts: 2, success: false, error: 'timeout' })
    })

    await t.run(async (ctx) => {
      const events = await ctx.db.query('webhookEvents').collect()
      expect(events).toHaveLength(1)
      expect(events[0].status).toBe('dead')
      expect(events[0].attemptCount).toBe(2)
      const dlq = await ctx.db.query('webhookDlq').collect()
      expect(dlq).toHaveLength(1)
    })
  })
})

describe('pipeline - receive', () => {
  it('receive returns accepted:true with an eventId', async () => {
    const t = makeT()
    await t.run(async (ctx) => {
      const result = await storeEventHelper(ctx, {
        provider: 'test',
        rawBody: '{}',
        headers: {},
        handlerFunctionHandle: 'test:action:handler',
        maxAttempts: 3,
        expiresInMs: 24 * 60 * 60 * 1000,
      })
      expect(result.accepted).toBe(true)
      if (result.accepted) {
        expect(typeof result.eventId).toBe('string')
        expect(result.eventId).not.toBe('placeholder')
      }
    })
  })

  it('receive stores the event in webhookEvents', async () => {
    const t = makeT()
    await t.run(async (ctx) => {
      await storeEventHelper(ctx, {
        provider: 'github',
        rawBody: '{"action":"opened"}',
        headers: { 'x-github-event': 'issues' },
        handlerFunctionHandle: 'test:action:handler',
        maxAttempts: 3,
        expiresInMs: 24 * 60 * 60 * 1000,
      })
      const rows = await ctx.db.query('webhookEvents').collect()
      expect(rows).toHaveLength(1)
      expect(rows[0].provider).toBe('github')
    })
  })
})
