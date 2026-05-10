import type {
  FunctionHandle,
  GenericActionCtx,
  GenericDataModel,
  GenericQueryCtx,
} from "convex/server";
import type { ComponentApi } from "./component/_generated/component.js";

export type WebhookHandlerFn = FunctionHandle<
  "action",
  { provider: string; rawBody: string; headers: Record<string, string> },
  void | null
>;

export type ReceiveOptions = {
  provider: string;
  rawBody: string;
  headers: Record<string, string>;
  handlerFunctionHandle: string;
  dedupKey?: string;
  maxAttempts?: number;
  expiresInMs?: number;
  verifier?: "github" | "discord" | "slack" | "hmac-sha256" | "ed25519";
  verifierSecret?: string;
  verifierHeader?: string;
};

export type ReceiveResult =
  | { accepted: true; eventId: string }
  | { accepted: false; reason: string; eventId?: string };

export class WebhookReceiver {
  constructor(public component: ComponentApi) {}

  async receive(
    ctx: GenericActionCtx<GenericDataModel>,
    options: ReceiveOptions,
  ): Promise<ReceiveResult> {
    return ctx.runAction(this.component.event.actions.receive, options);
  }

  async getEvent(
    ctx: GenericQueryCtx<GenericDataModel>,
    eventId: string,
  ) {
    return ctx.runQuery(this.component.event.queries.getEvent, { eventId });
  }
}
