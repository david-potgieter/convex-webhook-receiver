import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "convex.config": "src/component/convex.config.ts",
  },
  format: ["esm"],
  dts: { entry: { index: "src/index.ts", "convex.config": "src/component/convex.config.ts" } },
  clean: true,
  noExternal: ["@convex-webhook-receiver/verifiers"],
  external: ["convex-test"],
});
