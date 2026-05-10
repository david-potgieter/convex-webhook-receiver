import { v } from 'convex/values'
import { internalMutation, MutationCtx } from '../_generated/server'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function storeEventHelper(
  _ctx: MutationCtx,
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
  console.log('storeEvent', args)
  return { accepted: true as const, eventId: 'placeholder' }
}

export async function fetchAndLockHelper(
  _ctx: MutationCtx,
  args: { eventId: string },
): Promise<null> {
  console.log('fetchAndLock', args)
  return null
}

export async function recordResultHelper(
  _ctx: MutationCtx,
  args: {
    eventId: string
    attemptCount: number
    maxAttempts: number
    success: boolean
    error?: string
  },
): Promise<null> {
  console.log('recordResult', args)
  return null
}

export async function sweepExpiredHelper(
  _ctx: MutationCtx,
): Promise<null> {
  console.log('sweepExpired')
  return null
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
  returns: v.null(),
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
