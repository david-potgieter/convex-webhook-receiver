import { v } from 'convex/values'
import { action, internalAction, ActionCtx } from '../_generated/server'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function receiveHelper(
  _ctx: ActionCtx,
  args: {
    provider: string
    rawBody: string
    headers: Record<string, string>
    handlerFunctionHandle: string
    dedupKey?: string
    maxAttempts?: number
    expiresInMs?: number
    verifier?: string
    verifierSecret?: string
    verifierHeader?: string
  },
): Promise<{ accepted: true; eventId: string } | { accepted: false; reason: string; eventId?: string }> {
  console.log('receive', args)
  return { accepted: true as const, eventId: 'placeholder' }
}

export async function processEventHelper(
  _ctx: ActionCtx,
  args: { eventId: string },
): Promise<null> {
  console.log('processEvent', args)
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
    verifier: v.optional(v.string()),
    verifierSecret: v.optional(v.string()),
    verifierHeader: v.optional(v.string()),
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
