import { describe, expect, it } from "vitest";

describe("test harness", () => {
  it("vitest is configured and running", () => {
    expect(true).toBe(true);
  });

  it("Web Crypto is available in test environment", async () => {
    expect(crypto.subtle).toBeDefined();
  });
});
