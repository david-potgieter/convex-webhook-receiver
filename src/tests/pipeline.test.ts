/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../component/_generated/api.js";
import webhookTest from "../test.js";

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

// Test the component's functions in isolation by treating the component's own
// schema + modules as the "host" app — the standard pattern for component-
// internal tests with convex-test.
function makeT() {
  return convexTest(webhookTest.schema, webhookTest.modules);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BODY = '{"id":"evt_123","type":"payment.completed","amount":1000}';
const SECRET = "whsec_test-secret-key";

// Pre-computed HMAC-SHA256 of BODY under SECRET (sha256= prefix stripped)
const VALID_SIG =
  "sha256=97e8755b4548d865367754ec0cf8b5b7e48a1daf9e95dd79b0697111e4a3e275";

const HEADERS: Record<string, string> = {
  "content-type": "application/json",
  "x-hub-signature-256": VALID_SIG,
};

// Placeholder function handle — filled in by the handler under test
const HANDLER_HANDLE = "function:webhook/handler:handleWebhook";

// ---------------------------------------------------------------------------
// receive — happy path
// ---------------------------------------------------------------------------

describe("receive", () => {
  it("stores the event with status=pending and returns an eventId", async () => {
    const t = makeT();
    const result = await t.run(async (ctx) => {
      // @ts-expect-error — api.webhook not implemented yet (KAR-320)
      return ctx.runMutation(api.webhook.receive, {
        provider: "github",
        rawBody: BODY,
        headers: HEADERS,
        handlerFunctionHandle: HANDLER_HANDLE,
        dedupKey: "evt_123",
      });
    });

    expect(result.accepted).toBe(true);
    expect(result.eventId).toBeDefined();

    await t.run(async (ctx) => {
      // @ts-expect-error — api.webhook not implemented yet (KAR-320)
      const event = await ctx.runQuery(api.webhook.getEvent, {
        eventId: result.eventId,
      });
      expect(event?.status).toBe("pending");
      expect(event?.provider).toBe("github");
      expect(event?.rawBody).toBe(BODY);
      expect(event?.attemptCount).toBe(0);
    });
  });

  it("rejects a duplicate event with the same dedupKey", async () => {
    const t = makeT();

    const first = await t.run(async (ctx) => {
      // @ts-expect-error — api.webhook not implemented yet (KAR-320)
      return ctx.runMutation(api.webhook.receive, {
        provider: "github",
        rawBody: BODY,
        headers: HEADERS,
        handlerFunctionHandle: HANDLER_HANDLE,
        dedupKey: "evt_123",
      });
    });

    expect(first.accepted).toBe(true);

    const second = await t.run(async (ctx) => {
      // @ts-expect-error — api.webhook not implemented yet (KAR-320)
      return ctx.runMutation(api.webhook.receive, {
        provider: "github",
        rawBody: BODY,
        headers: HEADERS,
        handlerFunctionHandle: HANDLER_HANDLE,
        dedupKey: "evt_123",
      });
    });

    // Idempotent — accepted=false, no new event created
    expect(second.accepted).toBe(false);
    expect(second.reason).toBe("duplicate");
    // Original eventId is echoed back
    expect(second.eventId).toBe(first.eventId);
  });

  it("accepts two events with different dedupKeys", async () => {
    const t = makeT();

    const [a, b] = await t.run(async (ctx) => {
      // @ts-expect-error — api.webhook not implemented yet (KAR-320)
      const first = await ctx.runMutation(api.webhook.receive, {
        provider: "github",
        rawBody: BODY,
        headers: HEADERS,
        handlerFunctionHandle: HANDLER_HANDLE,
        dedupKey: "evt_aaa",
      });
      // @ts-expect-error — api.webhook not implemented yet (KAR-320)
      const second = await ctx.runMutation(api.webhook.receive, {
        provider: "github",
        rawBody: BODY,
        headers: HEADERS,
        handlerFunctionHandle: HANDLER_HANDLE,
        dedupKey: "evt_bbb",
      });
      return [first, second];
    });

    expect(a.accepted).toBe(true);
    expect(b.accepted).toBe(true);
    expect(a.eventId).not.toBe(b.eventId);
  });

  it("accepts an event with no dedupKey (no dedup tracking)", async () => {
    const t = makeT();

    const [a, b] = await Promise.all(
      [1, 2].map(() =>
        t.run(async (ctx) => {
          // @ts-expect-error — api.webhook not implemented yet (KAR-320)
          return ctx.runMutation(api.webhook.receive, {
            provider: "github",
            rawBody: BODY,
            headers: HEADERS,
            handlerFunctionHandle: HANDLER_HANDLE,
            // no dedupKey
          });
        }),
      ),
    );

    expect(a.accepted).toBe(true);
    expect(b.accepted).toBe(true);
    expect(a.eventId).not.toBe(b.eventId);
  });
});

// ---------------------------------------------------------------------------
// Signature verification — integrated into receive
// ---------------------------------------------------------------------------

describe("receive — signature verification", () => {
  it("rejects a request with a wrong signature", async () => {
    const t = makeT();

    const result = await t.run(async (ctx) => {
      // @ts-expect-error — api.webhook not implemented yet (KAR-320)
      return ctx.runMutation(api.webhook.receive, {
        provider: "github",
        rawBody: BODY,
        headers: {
          ...HEADERS,
          "x-hub-signature-256": "sha256=deadbeefdeadbeefdeadbeef",
        },
        handlerFunctionHandle: HANDLER_HANDLE,
        verifier: "github",
        verifierSecret: SECRET,
      });
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("signature_invalid");
  });

  it("skips verification when no verifier is configured", async () => {
    const t = makeT();

    const result = await t.run(async (ctx) => {
      // @ts-expect-error — api.webhook not implemented yet (KAR-320)
      return ctx.runMutation(api.webhook.receive, {
        provider: "github",
        rawBody: BODY,
        headers: HEADERS,
        handlerFunctionHandle: HANDLER_HANDLE,
        // no verifier / verifierSecret
      });
    });

    expect(result.accepted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Event lifecycle — transitions driven by processEvent
// ---------------------------------------------------------------------------

describe("event lifecycle", () => {
  it("transitions status to delivered after a successful handler run", async () => {
    const t = makeT();

    const { eventId } = await t.run(async (ctx) => {
      // @ts-expect-error — api.webhook not implemented yet (KAR-320)
      return ctx.runMutation(api.webhook.receive, {
        provider: "github",
        rawBody: BODY,
        headers: HEADERS,
        handlerFunctionHandle: HANDLER_HANDLE,
      });
    });

    // Drive processEvent manually (workpool isn't running in tests)
    await t.run(async (ctx) => {
      // @ts-expect-error — api.webhook not implemented yet (KAR-320)
      await ctx.runAction(api.webhook.internal.processEvent, { eventId });
    });

    await t.run(async (ctx) => {
      // @ts-expect-error — api.webhook not implemented yet (KAR-320)
      const event = await ctx.runQuery(api.webhook.getEvent, { eventId });
      expect(event?.status).toBe("delivered");
      expect(event?.attemptCount).toBe(1);
    });
  });

  it("increments attemptCount and stays failed after a handler error", async () => {
    const t = makeT();

    const { eventId } = await t.run(async (ctx) => {
      // @ts-expect-error — api.webhook not implemented yet (KAR-320)
      return ctx.runMutation(api.webhook.receive, {
        provider: "github",
        rawBody: BODY,
        headers: HEADERS,
        // Simulate a handler that always throws
        handlerFunctionHandle: "function:webhook/handler:alwaysThrows",
      });
    });

    await t.run(async (ctx) => {
      // @ts-expect-error — api.webhook not implemented yet (KAR-320)
      await ctx.runAction(api.webhook.internal.processEvent, { eventId });
    });

    await t.run(async (ctx) => {
      // @ts-expect-error — api.webhook not implemented yet (KAR-320)
      const event = await ctx.runQuery(api.webhook.getEvent, { eventId });
      expect(event?.status).toBe("failed");
      expect(event?.attemptCount).toBe(1);
      expect(event?.lastError).toBeDefined();
    });
  });

  it("moves to dead status after maxAttempts failures", async () => {
    const t = makeT();
    const MAX_ATTEMPTS = 5;

    const { eventId } = await t.run(async (ctx) => {
      // @ts-expect-error — api.webhook not implemented yet (KAR-320)
      return ctx.runMutation(api.webhook.receive, {
        provider: "github",
        rawBody: BODY,
        headers: HEADERS,
        handlerFunctionHandle: "function:webhook/handler:alwaysThrows",
        maxAttempts: MAX_ATTEMPTS,
      });
    });

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await t.run(async (ctx) => {
        // @ts-expect-error — api.webhook not implemented yet (KAR-320)
        await ctx.runAction(api.webhook.internal.processEvent, { eventId });
      });
    }

    await t.run(async (ctx) => {
      // @ts-expect-error — api.webhook not implemented yet (KAR-320)
      const event = await ctx.runQuery(api.webhook.getEvent, { eventId });
      expect(event?.status).toBe("dead");
      expect(event?.attemptCount).toBe(MAX_ATTEMPTS);
    });

    // DLQ entry should exist
    await t.run(async (ctx) => {
      // @ts-expect-error — api.webhook not implemented yet (KAR-320)
      const dlq = await ctx.runQuery(api.webhook.internal.getDlqEntry, { eventId });
      expect(dlq).not.toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Expiry sweep
// ---------------------------------------------------------------------------

describe("sweepExpired", () => {
  it("deletes delivered events past their expiresAt", async () => {
    const t = makeT();

    const { eventId } = await t.run(async (ctx) => {
      // @ts-expect-error — api.webhook not implemented yet (KAR-320)
      return ctx.runMutation(api.webhook.receive, {
        provider: "github",
        rawBody: BODY,
        headers: HEADERS,
        handlerFunctionHandle: HANDLER_HANDLE,
        // expiresInMs: 0 forces immediate expiry
        expiresInMs: 0,
      });
    });

    // Force-deliver so it qualifies for cleanup
    await t.run(async (ctx) => {
      // @ts-expect-error — api.webhook not implemented yet (KAR-320)
      await ctx.runAction(api.webhook.internal.processEvent, { eventId });
    });

    // Run expiry sweep
    await t.run(async (ctx) => {
      // @ts-expect-error — api.webhook not implemented yet (KAR-320)
      await ctx.runMutation(api.webhook.internal.sweepExpired, {});
    });

    await t.run(async (ctx) => {
      // @ts-expect-error — api.webhook not implemented yet (KAR-320)
      const event = await ctx.runQuery(api.webhook.getEvent, { eventId });
      expect(event).toBeNull();
    });
  });
});
