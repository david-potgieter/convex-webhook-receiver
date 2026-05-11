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
    const eventType = args.headers['x-github-event'] ?? 'unknown'
    const payload = JSON.parse(args.rawBody)
    console.log('[github]', eventType, payload?.repository?.full_name)
  },
})

export const route: RouteSpecWithPath = {
  path: '/webhooks/github',
  method: 'POST',
  handler: receiver.httpHandler({
    provider: 'github',
    verifierSecret: process.env.GITHUB_WEBHOOK_SECRET!,
    handler: internal.webhooks.github.handler,
  }),
}
