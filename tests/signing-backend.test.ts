import { once } from "node:events";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createSigningApp, signWidgetUrl } from "../src/signing/backend.js";
import { handleGetSignature } from "../src/signing/client.js";
import { signingVector } from "./fixtures/signing-vector.js";

describe("local Express signing backend", () => {
  let server: Server;
  let baseUrl: string;
  const nativeFetch = globalThis.fetch;

  beforeAll(async () => {
    server = createSigningApp().listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("Expected a TCP address");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  function post(body: unknown) {
    return nativeFetch(`${baseUrl}/api/sign-url`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  }

  it("matches the independently published MoonPay HMAC vector", async () => {
    const response = await post({ url: signingVector.url });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ signature: signingVector.signature });
  });

  it("runs the actual callback through HTTP to Express and returns a string", async () => {
    vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
      if (typeof input !== "string") throw new Error("Expected a relative URL");
      return nativeFetch(new URL(input, baseUrl), init);
    });
    await expect(handleGetSignature(signingVector.url)).resolves.toBe(signingVector.signature);
  });

  it("supports the off-ramp sandbox origin", async () => {
    const response = await post({ url: signingVector.url.replace("buy-sandbox", "sell-sandbox") });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ signature: signingVector.signature });
  });

  it("preserves parameter order and encoding when signing", () => {
    const url = "https://sell-sandbox.moonpay.com/?b=a%20b&a=%2F&b=second";
    // Fixed independent vector, calculated with Python's hmac/hashlib, not this function.
    expect(signWidgetUrl(url)).toBe("QWC+Ff8EWcbIYgtKG72/E9qHGtLySvndXbfeHhNzFZk=");
    expect(signWidgetUrl(url.replace("%20", "+"))).not.toBe(signWidgetUrl(url));
    expect(signWidgetUrl(url.replace("b=a%20b&a=%2F", "a=%2F&b=a%20b"))).not.toBe(signWidgetUrl(url));
  });

  it.each([{}, null, { url: 1 }, { url: "invalid" },
    { url: "https://sell-sandbox.moonpay.com.attacker.example/?a=1" },
    { url: "https://sell.moonpay.com/?a=1" },
    { url: "http://sell-sandbox.moonpay.com/?a=1" },
    { url: "https://user:pass@sell-sandbox.moonpay.com/?a=1" },
    { url: "https://sell-sandbox.moonpay.com/" },
    { url: `${signingVector.url}&signature=already-signed` },
    { url: `${signingVector.url}#fragment` },
  ])("rejects an invalid signing request: %j", async (body) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty("error");
  });

  it("returns a JSON error for malformed request JSON", async () => {
    const response = await nativeFetch(`${baseUrl}/api/sign-url`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON request body" });
  });

  it("rejects an oversized request body", async () => {
    const response = await post({ url: "a".repeat(9_000) });
    expect(response.status).toBe(413);
  });
});
