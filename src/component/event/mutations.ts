import { v } from 'convex/values'
import { internalMutation, MutationCtx } from '../_generated/server'
import { internal } from '../_generated/api.js'
import type { Doc, Id } from '../_generated/dataModel'
import schema from '../schema.js'

const eventDocValidator = schema.tables.webhookEvents.validator.extend({
  _id: v.string(),
  _creationTime: v.number(),
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function storeEventHelper(
  ctx: MutationCtx,
  args: {
    provider: string
    rawBody: string
    headers: Record<string, string>
    handlerFunctionHandle: string
    dedupKey?: string
    maxAttempts: number
    expiresInMs: number
  },
): Promise<{ accepted: true; eventId: string } | { accepted: false; reason: string; eventId?: string }> {
  const { dedupKey } = args

  if (dedupKey) {
    const existing = await ctx.db
      .query('webhookDedup')
      .withIndex('by_dedup_key', q => q.eq('dedupKey', dedupKey))
      .first()
    if (existing) {
      return { accepted: false as const, reason: 'duplicate', eventId: existing.eventId.toString() }
    }
  }

  const now = Date.now()
  const expiresAt = now + args.expiresInMs

  const eventId = await ctx.db.insert('webhookEvents', {
    provider: args.provider,
    rawBody: args.rawBody,
    headers: args.headers,
    status: 'pending' as const,
    handlerFunctionHandle: args.handlerFunctionHandle,
    receivedAt: now,
    expiresAt,
    maxAttempts: args.maxAttempts,
    attemptCount: 0,
    ...(dedupKey ? { dedupKey } : {}),
  })

  if (dedupKey) {
    await ctx.db.insert('webhookDedup', { dedupKey, eventId, expiresAt })
  }

  await ctx.scheduler.runAfter(0, internal.event.actions.processEvent, { eventId: eventId.toString() })

  return { accepted: true as const, eventId: eventId.toString() }
}

export async function fetchAndLockHelper(
  ctx: MutationCtx,
  args: { eventId: string },
): Promise<Doc<'webhookEvents'> | null> {
  const id = args.eventId as Id<'webhookEvents'>
  const event = await ctx.db.get(id)
  if (!event || (event.status !== 'pending' && event.status !== 'failed')) return null
  await ctx.db.patch(id, { status: 'processing' })
  return event
}

export async function recordResultHelper(
  ctx: MutationCtx,
  args: {
    eventId: string
    attemptCount: number
    maxAttempts: number
    success: boolean
    error?: string
  },
): Promise<null> {
  const id = args.eventId as Id<'webhookEvents'>
  const errorPatch = args.error ? { lastError: args.error } : {}

  const newCount = args.attemptCount + 1

  if (args.success) {
    await ctx.db.patch(id, { status: 'delivered', attemptCount: newCount })
    return null
  }

  if (newCount >= args.maxAttempts) {
    await ctx.db.patch(id, { status: 'dead', attemptCount: newCount, ...errorPatch })
    await ctx.db.insert('webhookDlq', { eventId: id, movedAt: Date.now() })
    return null
  }

  await ctx.db.patch(id, { status: 'failed', attemptCount: newCount, ...errorPatch })
  const backoffMs = Math.min(1000 * Math.pow(2, args.attemptCount), 30 * 60 * 1000)
  await ctx.scheduler.runAfter(backoffMs, internal.event.actions.processEvent, { eventId: args.eventId })
  return null
}

export async function sweepExpiredHelper(
  ctx: MutationCtx,
): Promise<null> {
  const now = Date.now()

  const expiredEvents = await ctx.db
    .query('webhookEvents')
    .withIndex('by_expires_at', q => q.lt('expiresAt', now))
    .collect()
  for (const event of expiredEvents) {
    await ctx.db.delete(event._id)
  }

  const expiredDedup = await ctx.db
    .query('webhookDedup')
    .withIndex('by_expires_at', q => q.lt('expiresAt', now))
    .collect()
  for (const dedup of expiredDedup) {
    await ctx.db.delete(dedup._id)
  }

  return null
}

export async function resetForReplayHelper(
  ctx: MutationCtx,
  args: { eventId: string },
): Promise<{ replayed: true } | { replayed: false; reason: string }> {
  const id = args.eventId as Id<'webhookEvents'>
  const event = await ctx.db.get(id)
  if (!event) return { replayed: false, reason: 'not_found' }
  if (event.status !== 'dead' && event.status !== 'delivered') {
    return { replayed: false, reason: 'not_replayable' }
  }

  await ctx.db.patch(id, { status: 'pending', attemptCount: 0, lastError: undefined })

  const dlqEntry = await ctx.db
    .query('webhookDlq')
    .withIndex('by_event_id', q => q.eq('eventId', id))
    .first()
  if (dlqEntry) await ctx.db.delete(dlqEntry._id)

  await ctx.scheduler.runAfter(0, internal.event.actions.processEvent, { eventId: args.eventId })
  return { replayed: true }
}

// ---------------------------------------------------------------------------
// Registered functions
// ---------------------------------------------------------------------------

export const storeEvent = internalMutation({
  args: {
    provider: v.string(),
    rawBody: v.string(),
    headers: v.record(v.string(), v.string()),
    handlerFunctionHandle: v.string(),
    dedupKey: v.optional(v.string()),
    maxAttempts: v.number(),
    expiresInMs: v.number(),
  },
  returns: v.union(
    v.object({ accepted: v.literal(true), eventId: v.string() }),
    v.object({ accepted: v.literal(false), reason: v.string(), eventId: v.optional(v.string()) }),
  ),
  handler: async (ctx, args) => storeEventHelper(ctx, args),
})

export const fetchAndLock = internalMutation({
  args: { eventId: v.string() },
  returns: v.union(v.null(), eventDocValidator),
  handler: async (ctx, args) => fetchAndLockHelper(ctx, args),
})

export const recordResult = internalMutation({
  args: {
    eventId: v.string(),
    attemptCount: v.number(),
    maxAttempts: v.number(),
    success: v.boolean(),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => recordResultHelper(ctx, args),
})

export const sweepExpired = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => sweepExpiredHelper(ctx),
})

export const resetForReplay = internalMutation({
  args: { eventId: v.string() },
  returns: v.union(
    v.object({ replayed: v.literal(true) }),
    v.object({ replayed: v.literal(false), reason: v.string() }),
  ),
  handler: async (ctx, args) => resetForReplayHelper(ctx, args),
})
