import { v } from 'convex/values'
import { action, internalAction, ActionCtx } from '../_generated/server'
import { internal } from '../_generated/api.js'
import type { FunctionHandle } from 'convex/server'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function receiveHelper(
  ctx: ActionCtx,
  args: {
    provider: string
    rawBody: string
    headers: Record<string, string>
    handlerFunctionHandle: string
    dedupKey?: string
    maxAttempts?: number
    expiresInMs?: number
  },
): Promise<{ accepted: true; eventId: string } | { accepted: false; reason: string; eventId?: string }> {
  return ctx.runMutation(internal.event.mutations.storeEvent, {
    provider: args.provider,
    rawBody: args.rawBody,
    headers: args.headers,
    handlerFunctionHandle: args.handlerFunctionHandle,
    ...(args.dedupKey ? { dedupKey: args.dedupKey } : {}),
    maxAttempts: args.maxAttempts ?? 3,
    expiresInMs: args.expiresInMs ?? 30 * 24 * 60 * 60 * 1000,
  })
}

export async function processEventHelper(
  ctx: ActionCtx,
  args: { eventId: string },
): Promise<null> {
  const event = await ctx.runMutation(internal.event.mutations.fetchAndLock, args)
  if (!event) return null

  const handle = event.handlerFunctionHandle as FunctionHandle<
    'action',
    { provider: string; rawBody: string; headers: Record<string, string> },
    void
  >

  try {
    await ctx.runAction(handle, {
      provider: event.provider,
      rawBody: event.rawBody,
      headers: event.headers,
    })
    await ctx.runMutation(internal.event.mutations.recordResult, {
      eventId: args.eventId,
      attemptCount: event.attemptCount,
      maxAttempts: event.maxAttempts,
      success: true,
    })
  } catch (err) {
    await ctx.runMutation(internal.event.mutations.recordResult, {
      eventId: args.eventId,
      attemptCount: event.attemptCount,
      maxAttempts: event.maxAttempts,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  return null
}

export async function replayHelper(
  ctx: ActionCtx,
  args: { eventId: string },
): Promise<null> {
  console.log('replay', args)
  return null
}

// ---------------------------------------------------------------------------
// Registered functions
// ---------------------------------------------------------------------------

export const receive = action({
  args: {
    provider: v.string(),
    rawBody: v.string(),
    headers: v.record(v.string(), v.string()),
    handlerFunctionHandle: v.string(),
    dedupKey: v.optional(v.string()),
    maxAttempts: v.optional(v.number()),
    expiresInMs: v.optional(v.number()),
  },
  returns: v.union(
    v.object({ accepted: v.literal(true), eventId: v.string() }),
    v.object({ accepted: v.literal(false), reason: v.string(), eventId: v.optional(v.string()) }),
  ),
  handler: async (ctx, args) => receiveHelper(ctx, args),
})

export const processEvent = internalAction({
  args: { eventId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => processEventHelper(ctx, args),
})

export const replay = action({
  args: { eventId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => replayHelper(ctx, args),
})
