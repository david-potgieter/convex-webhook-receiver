import { v } from 'convex/values'
import { query, internalQuery, QueryCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'
import schema from '../schema.js'

const eventDocValidator = schema.tables.webhookEvents.validator.extend({
  _id: v.string(),
  _creationTime: v.number(),
})

const dlqDocValidator = schema.tables.webhookDlq.validator.extend({
  _id: v.string(),
  _creationTime: v.number(),
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function getEventHelper(
  ctx: QueryCtx,
  args: { eventId: string },
): Promise<Doc<'webhookEvents'> | null> {
  const id = args.eventId as Id<'webhookEvents'>
  return ctx.db.get(id)
}

export async function getDlqEntryHelper(
  ctx: QueryCtx,
  args: { eventId: string },
): Promise<Doc<'webhookDlq'> | null> {
  const id = args.eventId as Id<'webhookEvents'>
  return ctx.db
    .query('webhookDlq')
    .withIndex('by_event_id', (q) => q.eq('eventId', id))
    .first()
}

export async function listEventsHelper(
  ctx: QueryCtx,
): Promise<Doc<'webhookEvents'>[]> {
  const now = Date.now()
  return ctx.db
    .query('webhookEvents')
    .withIndex('by_expires_at', (q) => q.gt('expiresAt', now))
    .collect()
}

export async function listDlqHelper(
  ctx: QueryCtx,
): Promise<Doc<'webhookDlq'>[]> {
  return ctx.db.query('webhookDlq').collect()
}

// ---------------------------------------------------------------------------
// Registered functions
// ---------------------------------------------------------------------------

export const getEvent = query({
  args: { eventId: v.string() },
  returns: v.union(v.null(), eventDocValidator),
  handler: async (ctx, args) => getEventHelper(ctx, args),
})

export const getDlqEntry = internalQuery({
  args: { eventId: v.string() },
  returns: v.union(v.null(), dlqDocValidator),
  handler: async (ctx, args) => getDlqEntryHelper(ctx, args),
})

export const listEvents = query({
  args: {},
  returns: v.array(eventDocValidator),
  handler: async (ctx) => listEventsHelper(ctx),
})

export const listDlq = query({
  args: {},
  returns: v.array(dlqDocValidator),
  handler: async (ctx) => listDlqHelper(ctx),
})
