import { httpActionGeneric, createFunctionHandle } from 'convex/server'
import type {
  FunctionReference,
  GenericActionCtx,
  GenericDataModel,
  GenericQueryCtx,
} from 'convex/server'
import type { ComponentApi } from './component/_generated/component.js'
import { verifyGitHub, verifyStripe, verifySlack, verifyTwilio, verifyShopify, verifyLinear, verifyDiscord, verifyHmacGeneric, type Verifier } from '@convex-webhook-receiver/verifiers'

export type WebhookHandlerArgs = { provider: string; rawBody: string; headers: Record<string, string> }
export type WebhookHandlerRef = FunctionReference<'action', 'internal', WebhookHandlerArgs, any>

export type ReceiveResult =
  | { accepted: true; eventId: string }
  | { accepted: false; reason: string; eventId?: string }

type BuiltInProvider = 'github' | 'stripe' | 'slack' | 'twilio' | 'shopify' | 'linear' | 'discord' | 'generic'
type ProviderName = BuiltInProvider

// Headers that carry a guaranteed unique delivery ID per provider.
const DEDUP_HEADERS: Partial<Record<BuiltInProvider, string>> = {
  github: 'x-github-delivery',
}

export class WebhookReceiver {
  constructor(
    public component: ComponentApi,
    private options: {
      maxAttempts?: number
      ttlDays?: number
    } = {},
  ) {}

  httpHandler(config: {
    provider: ProviderName
    verifierSecret: string
    handler: WebhookHandlerRef
    maxAttempts?: number
    ttlDays?: number
    verifier?: Verifier
    dedupKeyHeader?: string
  }) {
    const component = this.component
    const maxAttempts = config.maxAttempts ?? this.options.maxAttempts ?? 3
    const ttlDays = config.ttlDays ?? this.options.ttlDays ?? 30
    const expiresInMs = ttlDays * 24 * 60 * 60 * 1000

    return httpActionGeneric(async (ctx: GenericActionCtx<GenericDataModel>, request: Request): Promise<Response> => {
      const rawBody = await request.text()

      const verifiers: Record<BuiltInProvider, Verifier> = {
        github: verifyGitHub,
        stripe: verifyStripe,
        slack: verifySlack,
        twilio: verifyTwilio,
        shopify: verifyShopify,
        linear: verifyLinear,
        discord: verifyDiscord,
        generic: verifyHmacGeneric,
      }
      const verify = config.verifier ?? verifiers[config.provider]
      const valid = await verify(request, rawBody, config.verifierSecret)

      if (!valid) return new Response('Unauthorized', { status: 401 })

      const headers: Record<string, string> = {}
      request.headers.forEach((value: string, key: string) => { headers[key] = value })

      const dedupHeader = config.dedupKeyHeader ?? DEDUP_HEADERS[config.provider]
      const dedupKey = dedupHeader ? (request.headers.get(dedupHeader) ?? undefined) : undefined

      const handlerFunctionHandle = await createFunctionHandle(config.handler)

      const result = await ctx.runAction(
        component.event.actions.receive,
        {
          provider: config.provider,
          rawBody,
          headers,
          handlerFunctionHandle,
          maxAttempts,
          expiresInMs,
          ...(dedupKey ? { dedupKey } : {}),
        },
      )

      if (!result.accepted) return new Response('Rejected', { status: 400 })
      return new Response('OK', { status: 200 })
    })
  }

  async getEvent(
    ctx: GenericQueryCtx<GenericDataModel>,
    eventId: string,
  ) {
    return ctx.runQuery(this.component.event.queries.getEvent, { eventId })
  }

  async listEvents(ctx: GenericQueryCtx<GenericDataModel>) {
    return ctx.runQuery(this.component.event.queries.listEvents, {})
  }

  async listDlq(ctx: GenericQueryCtx<GenericDataModel>) {
    return ctx.runQuery(this.component.event.queries.listDlq, {})
  }
}
