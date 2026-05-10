import { httpActionGeneric } from 'convex/server'
import type {
  GenericActionCtx,
  GenericDataModel,
  GenericQueryCtx,
} from 'convex/server'
import type { ComponentApi } from './component/_generated/component.js'
import { verifyGitHub, verifyStripe, verifySlack, verifyTwilio, verifyShopify, verifyLinear, verifyDiscord, verifyHmacGeneric, type Verifier } from '@convex-webhook-receiver/verifiers'

export type WebhookHandlerFn = string

export type ReceiveResult =
  | { accepted: true; eventId: string }
  | { accepted: false; reason: string; eventId?: string }

type BuiltInProvider = 'github' | 'stripe' | 'slack' | 'twilio' | 'shopify' | 'linear' | 'discord' | 'generic'
type ProviderName = BuiltInProvider

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
    handlerFunctionHandle: string
    maxAttempts?: number
    ttlDays?: number
    verifier?: Verifier
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

      const result = await ctx.runAction(
        component.event.actions.receive,
        {
          provider: config.provider,
          rawBody,
          headers,
          handlerFunctionHandle: config.handlerFunctionHandle,
          maxAttempts,
          expiresInMs,
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
