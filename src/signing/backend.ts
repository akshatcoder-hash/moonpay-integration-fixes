import { createHmac } from "node:crypto";
import express from "express";
import type { ErrorRequestHandler } from "express";

// Deliberately fake, public test material. Never use this with real credentials.
export const TEST_SECRET_KEY = "sk_test_DocsVector00";
const widgetOrigins = new Set([
  "https://buy-sandbox.moonpay.com",
  "https://sell-sandbox.moonpay.com",
]);

export function signWidgetUrl(value: string): string {
  const url = new URL(value);
  if (
    !widgetOrigins.has(url.origin) ||
    url.username ||
    url.password ||
    url.hash ||
    !url.search ||
    url.searchParams.has("signature")
  ) {
    throw new Error("Expected an unsigned sandbox widget URL with a query string");
  }

  // Preserve order and encoding; URLSearchParams.toString() would change bytes.
  return createHmac("sha256", TEST_SECRET_KEY).update(url.search).digest("base64");
}

export function createSigningApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "8kb" }));
  app.post("/api/sign-url", (req, res) => {
    res.set("Cache-Control", "no-store");
    const body: unknown = req.body;
    if (
      typeof body !== "object" ||
      body === null ||
      !("url" in body) ||
      typeof body.url !== "string"
    ) {
      res.status(400).json({ error: "Expected a JSON body containing a URL string" });
      return;
    }
    try {
      res.json({ signature: signWidgetUrl(body.url) });
    } catch {
      res.status(400).json({ error: "Expected an unsigned sandbox widget URL with a query string" });
    }
  });

  const handleError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    const status = typeof error === "object" && error !== null && "status" in error
      ? error.status
      : undefined;
    res.status(status === 413 ? 413 : 400).json({ error: "Invalid JSON request body" });
  };
  app.use(handleError);
  return app;
}
