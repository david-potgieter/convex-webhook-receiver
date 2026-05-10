import { v } from 'convex/values'
import { query, internalQuery, QueryCtx } from '../_generated/server'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function getEventHelper(
  _ctx: QueryCtx,
  args: { eventId: string },
): Promise<null> {
  console.log('getEvent', args)
  return null
}

export async function getDlqEntryHelper(
  _ctx: QueryCtx,
  args: { eventId: string },
): Promise<null> {
  console.log('getDlqEntry', args)
  return null
}

// ---------------------------------------------------------------------------
// Registered functions
// ---------------------------------------------------------------------------

export const getEvent = query({
  args: { eventId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => getEventHelper(ctx, args),
})

export const getDlqEntry = internalQuery({
  args: { eventId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => getDlqEntryHelper(ctx, args),
})
