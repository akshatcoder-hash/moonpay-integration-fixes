export async function handleGetSignature(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch("/api/sign-url", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ url }),
    });
  } catch (cause) {
    throw new Error("Could not reach the signing backend", { cause });
  }

  if (!response.ok) {
    throw new Error(`Signing request failed (HTTP ${response.status})`);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (cause) {
    throw new Error("Signing backend returned invalid JSON", { cause });
  }
  if (
    typeof data !== "object" ||
    data === null ||
    !("signature" in data) ||
    typeof data.signature !== "string" ||
    data.signature.trim().length === 0
  ) {
    throw new Error("Signing backend did not return a signature string");
  }
  return data.signature;
}
