import { internalAction } from '../_generated/server'
import { components, internal } from '../_generated/api'
import { v } from 'convex/values'
import { WebhookReceiver } from 'convex-webhook-receiver'
import type { RouteSpecWithPath } from 'convex/server'

const receiver = new WebhookReceiver(components.webhookReceiver)

export const handler = internalAction({
  args: {
    provider: v.string(),
    rawBody: v.string(),
    headers: v.record(v.string(), v.string()),
  },
  handler: async (_ctx, args) => {
    const event = JSON.parse(args.rawBody)
    console.log('[stripe]', event.type, event.id)
  },
})

export const route: RouteSpecWithPath = {
  path: '/webhooks/stripe',
  method: 'POST',
  handler: receiver.httpHandler({
    provider: 'stripe',
    verifierSecret: process.env.STRIPE_WEBHOOK_SECRET!,
    handler: internal.webhooks.stripe.handler,
  }),
}
