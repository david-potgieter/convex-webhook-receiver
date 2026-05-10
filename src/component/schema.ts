import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  webhookEvents: defineTable({
    provider: v.string(),
    dedupKey: v.optional(v.string()),
    rawBody: v.string(),
    headers: v.record(v.string(), v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("delivered"),
      v.literal("failed"),
      v.literal("dead"),
    ),
    handlerFunctionHandle: v.string(),
    receivedAt: v.number(),
    expiresAt: v.number(),
    maxAttempts: v.number(),
    attemptCount: v.number(),
    lastError: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_expires_at", ["expiresAt"]),

  webhookDedup: defineTable({
    dedupKey: v.string(),
    eventId: v.id("webhookEvents"),
    expiresAt: v.number(),
  })
    .index("by_dedup_key", ["dedupKey"])
    .index("by_expires_at", ["expiresAt"]),

  webhookDlq: defineTable({
    eventId: v.id("webhookEvents"),
    movedAt: v.number(),
  }).index("by_event_id", ["eventId"]),
});
