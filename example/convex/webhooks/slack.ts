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
    const payload = JSON.parse(args.rawBody)
    const eventType: string = payload?.event?.type ?? payload?.type ?? 'unknown'
    console.log('[slack]', eventType)
  },
})

export const route: RouteSpecWithPath = {
  path: '/webhooks/slack',
  method: 'POST',
  handler: receiver.httpHandler({
    provider: 'slack',
    verifierSecret: process.env.SLACK_SIGNING_SECRET!,
    handler: internal.webhooks.slack.handler,
  }),
}
