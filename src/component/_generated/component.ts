/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    event: {
      actions: {
        receive: FunctionReference<
          "action",
          "internal",
          {
            dedupKey?: string;
            expiresInMs?: number;
            handlerFunctionHandle: string;
            headers: Record<string, string>;
            maxAttempts?: number;
            provider: string;
            rawBody: string;
          },
          | { accepted: true; eventId: string }
          | { accepted: false; eventId?: string; reason: string },
          Name
        >;
        replay: FunctionReference<
          "action",
          "internal",
          { eventId: string },
          { replayed: true } | { reason: string; replayed: false },
          Name
        >;
      };
      queries: {
        getEvent: FunctionReference<
          "query",
          "internal",
          { eventId: string },
          null | {
            _creationTime: number;
            _id: string;
            attemptCount: number;
            dedupKey?: string;
            expiresAt: number;
            handlerFunctionHandle: string;
            headers: Record<string, string>;
            lastError?: string;
            maxAttempts: number;
            provider: string;
            rawBody: string;
            receivedAt: number;
            status: "pending" | "processing" | "delivered" | "failed" | "dead";
          },
          Name
        >;
        listDlq: FunctionReference<
          "query",
          "internal",
          {},
          Array<{
            _creationTime: number;
            _id: string;
            eventId: string;
            movedAt: number;
          }>,
          Name
        >;
        listEvents: FunctionReference<
          "query",
          "internal",
          {},
          Array<{
            _creationTime: number;
            _id: string;
            attemptCount: number;
            dedupKey?: string;
            expiresAt: number;
            handlerFunctionHandle: string;
            headers: Record<string, string>;
            lastError?: string;
            maxAttempts: number;
            provider: string;
            rawBody: string;
            receivedAt: number;
            status: "pending" | "processing" | "delivered" | "failed" | "dead";
          }>,
          Name
        >;
      };
    };
  };
