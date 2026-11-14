import { afterEach, describe, expect, it, vi } from "vitest";
import { handleGetSignature } from "../src/signing/client.js";
import { signingVector } from "./fixtures/signing-vector.js";

afterEach(() => vi.unstubAllGlobals());

describe("React URL signing callback", () => {
  it("POSTs the complete URL in JSON and resolves to the unencoded signature string", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ signature: signingVector.signature }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(handleGetSignature(signingVector.url)).resolves.toBe(signingVector.signature);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/sign-url", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ url: signingVector.url }),
    });
  });

  it.each([400, 500])("rejects an HTTP %s response", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "failure" }, { status })));
    await expect(handleGetSignature(signingVector.url)).rejects.toThrow(`HTTP ${status}`);
  });

  it("rejects a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(handleGetSignature(signingVector.url)).rejects.toThrow("Could not reach the signing backend");
  });

  it("rejects malformed JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json")));
    await expect(handleGetSignature(signingVector.url)).rejects.toThrow("invalid JSON");
  });

  it.each([null, {}, { signature: 1 }, { signature: "" }, { signature: "  " }])
    ("rejects a missing or invalid signature: %j", async (body) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
      await expect(handleGetSignature(signingVector.url)).rejects.toThrow("signature string");
    });
});
