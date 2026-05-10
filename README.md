<div align="center">

# convex-webhook-receiver

![License](https://img.shields.io/badge/license-Apache--2.0-blue)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=flat&logo=typescript&logoColor=white)

<strong>Reliable inbound webhook ingestion for Convex</strong>

Signature verification • Deduplication • Async processing • Retry • Dead-letter queue

[Documentation](#setup) • [Supported Providers](#supported-providers) • [API Reference](#api-reference) • [Example](#example)

</div>

---

A [Convex component](https://www.convex.dev/components) for reliable inbound webhook ingestion. Verifies signatures, deduplicates deliveries, queues events for async processing, retries failures with exponential backoff, and parks exhausted events in a dead-letter queue.

## Features

- Signature verification for GitHub, Stripe, Slack, Twilio, Shopify, Linear, Discord, and a generic HMAC-SHA256 escape hatch
- Automatic deduplication via provider delivery IDs (e.g. `X-GitHub-Delivery`) with optional caller-supplied keys
- Async processing — webhook endpoint returns `200 OK` immediately; your handler runs in the background
- Configurable retry with exponential backoff (default: 3 attempts, cap 30 minutes)
- Dead-letter queue for events that exhaust retries
- Manual replay for DLQ entries
- TTL-based expiry for delivered events

## Installation

```sh
npm install convex-webhook-receiver
```

## Setup

### 1. Register the component

```ts
// convex/convex.config.ts
import { defineApp } from 'convex/server'
import webhookReceiver from 'convex-webhook-receiver/convex.config'

const app = defineApp()
app.use(webhookReceiver)
export default app
```

### 2. Create a handler action

Your handler receives the raw webhook payload and does whatever your app needs — storing to a table, triggering other functions, calling external APIs.

```ts
// convex/webhooks.ts
import { internalAction } from './_generated/server'
import { components } from './_generated/api'
import { v } from 'convex/values'
import { WebhookReceiver } from 'convex-webhook-receiver'

export const webhookReceiver = new WebhookReceiver(components.webhookReceiver)

export const handleGitHubEvent = internalAction({
  args: {
    provider: v.string(),
    rawBody: v.string(),
    headers: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args) => {
    const eventType = args.headers['x-github-event']
    const payload = JSON.parse(args.rawBody)
    // do something with payload...
  },
})
```

### 3. Register the HTTP endpoint

```ts
// convex/http.ts
import { httpRouter } from 'convex/server'
import { internal } from './_generated/api'
import { webhookReceiver } from './webhooks'

const http = httpRouter()

http.route({
  path: '/webhooks/github',
  method: 'POST',
  handler: webhookReceiver.httpHandler({
    provider: 'github',
    verifierSecret: process.env.GITHUB_WEBHOOK_SECRET!,
    handler: internal.webhooks.handleGitHubEvent,
  }),
})

export default http
```

## Supported providers

Any webhook source works — use `generic` for HMAC-SHA256 with a custom header, or pass your own `verifier` function for any other scheme. The built-in providers are convenience wrappers with the correct algorithm and header pre-configured.

| Provider  | Verification method              | Auto dedup header     |
|-----------|----------------------------------|-----------------------|
| `github`  | HMAC-SHA256 (`X-Hub-Signature-256`) | `X-GitHub-Delivery` |
| `stripe`  | HMAC-SHA256 + timestamp tolerance (`Stripe-Signature`) | — |
| `slack`   | HMAC-SHA256 + timestamp tolerance (`X-Slack-Signature`) | — |
| `twilio`  | HMAC-SHA1 over URL (`X-Twilio-Signature`) | — |
| `shopify` | HMAC-SHA256 base64 (`X-Shopify-Hmac-Sha256`) | — |
| `linear`  | HMAC-SHA256 hex (`linear-signature`) | — |
| `discord` | Ed25519 (`X-Signature-Ed25519`) | — |
| `generic` | HMAC-SHA256 hex (`X-Webhook-Signature`) | — |

### Custom verifier

Pass your own `verifier` function to override signature checking entirely:

```ts
import type { Verifier } from 'convex-webhook-receiver'

const myVerifier: Verifier = async (request, rawBody, secret) => {
  // return true if valid
}

webhookReceiver.httpHandler({
  provider: 'generic',
  verifierSecret: process.env.WEBHOOK_SECRET!,
  handler: internal.webhooks.handleEvent,
  verifier: myVerifier,
})
```

## Deduplication

GitHub webhooks are automatically deduplicated using the `X-GitHub-Delivery` header. For other providers, pass a `dedupKeyHeader` to specify which header carries a unique delivery ID, or handle deduplication in your handler.

```ts
webhookReceiver.httpHandler({
  provider: 'stripe',
  verifierSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  handler: internal.webhooks.handleStripeEvent,
  dedupKeyHeader: 'stripe-event-id',
})
```

## Retry and dead-letter queue

By default events are attempted up to 3 times with exponential backoff (1s, 2s, 4s… capped at 30 minutes). Configure per-handler or globally:

```ts
// Global default
const webhookReceiver = new WebhookReceiver(components.webhookReceiver, {
  maxAttempts: 5,
  ttlDays: 7,
})

// Per-handler override
webhookReceiver.httpHandler({
  provider: 'github',
  verifierSecret: process.env.GITHUB_WEBHOOK_SECRET!,
  handler: internal.webhooks.handleGitHubEvent,
  maxAttempts: 10,
  ttlDays: 30,
})
```

Events that exhaust all attempts are moved to the dead-letter queue. Query and replay them:

```ts
// convex/admin.ts
import { query, action } from './_generated/server'
import { components } from './_generated/api'
import { webhookReceiver } from './webhooks'
import { v } from 'convex/values'

export const listDlq = query({
  handler: async (ctx) => webhookReceiver.listDlq(ctx),
})

export const replayEvent = action({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId }) => {
    await ctx.runAction(components.webhookReceiver.event.actions.replay, { eventId })
  },
})
```

## API Reference

```ts
import { query } from './_generated/server'
import { v } from 'convex/values'
import { webhookReceiver } from './webhooks'

export const listEvents = query({
  handler: async (ctx) => webhookReceiver.listEvents(ctx),
})

export const getEvent = query({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId }) => webhookReceiver.getEvent(ctx, eventId),
})
```

## Example

A working example app with GitHub, Stripe, and Slack endpoints is in [`apps/example`](https://github.com/david-potgieter/convex-webhook-receiver-mono/tree/main/apps/example).

## Testing

The package exports a test helper for use with [`convex-test`](https://github.com/get-convex/convex-test):

```ts
// convex/webhooks.test.ts
import { convexTest } from 'convex-test'
import webhookReceiver from 'convex-webhook-receiver/test'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

function makeT() {
  const t = convexTest(schema, modules)
  t.registerComponent('webhookReceiver', webhookReceiver.schema, webhookReceiver.modules)
  return t
}
```

## License

Apache-2.0

---

<div align="center">
Built with ♥ for Convex | <a href="https://www.convex.dev/">Convex</a> • <a href="https://docs.convex.dev/components">Components</a> • <a href="https://github.com/david-potgieter/convex-webhook-receiver-mono">GitHub</a>
</div>
