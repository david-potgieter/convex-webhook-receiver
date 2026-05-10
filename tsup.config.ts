import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "convex.config": "src/component/convex.config.ts",
    "schema": "src/component/schema.ts",
    "event/actions": "src/component/event/actions.ts",
    "event/mutations": "src/component/event/mutations.ts",
    "event/queries": "src/component/event/queries.ts",
  },
  format: ["esm"],
  splitting: false,
  dts: { entry: { index: "src/index.ts", "convex.config": "src/component/convex.config.ts" } },
  clean: true,
  noExternal: ["@convex-webhook-receiver/verifiers"],
  external: ["convex", "convex-test"],
});
