# moonpay-integration-fixes

Two small, tested fixes for the reference code in MoonPay's documentation, written in TypeScript with Vitest. The issues described here are in their docs reference code; they are not claims about MoonPay's production SDK or deployed services. This repository contains independent reference code. The linked examples were checked on November 14, 2026.

## A. Iframe message origin checks

The [Web reference implementation](https://dev.moonpay.com/platform/sdk-reference/reference-implementation/web#source-files), under `frames.ts`, accepts message origins containing `moonpay.com`. That substring also appears in `https://moonpay.com.attacker.example`, which belongs to a different origin. The [manual integration guide](https://dev.moonpay.com/platform/guides/manual-integration/web#message-utilities) already uses an exact comparison with `https://platform.moonpay.com`.

[`src/frames.ts`](src/frames.ts) isolates the message transport so the same checks can be used by each frame handler:

- The explicit allowlist contains only `https://platform.moonpay.com`. Messages must also match the origin configured on the iframe, so other schemes, ports, and unlisted subdomains are rejected.
- `event.source` must equal the mounted iframe's window, so another window cannot pass by supplying the same channel.
- The envelope must have version `2`, the expected channel ID, and a non-empty string `kind`. Invalid JSON and malformed envelopes are ignored.
- A handshake receives an acknowledgement addressed to the exact frame origin. `dispose()` removes the message listener and the iframe and can be called repeatedly.

Mount the iframe before attaching the channel, use a fresh channel ID for each instance, and put that ID in its URL:

```ts
import { attachFrameChannel, FRAME_ORIGINS } from "./src/frames.js";

const channelId = crypto.randomUUID();
const iframe = document.createElement("iframe");
const url = new URL("/platform/v1/connect", FRAME_ORIGINS[0]);
url.searchParams.set("channelId", channelId);
// Add your sessionToken and publicKey through your existing integration.
iframe.src = url.toString();
document.body.append(iframe);

const frame = attachFrameChannel({
  iframe,
  channelId,
  onMessage(message) {
    // Handle application events and validate each kind's payload here.
    console.log(message.kind);
  },
});

// Call when the owning view unmounts or the integration finishes:
frame.dispose();
```

This helper owns the listener and iframe, but does not implement credential decryption, frame-specific payload validation, or a connection state machine. [`tests/frames.test.ts`](tests/frames.test.ts) includes a before/after regression: the original substring guard accepts the lookalike, while the corrected handler ignores the same origin with an otherwise valid window and channel.

## B. React URL signing callback

The [off-ramp React guide's URL signing example](https://dev.moonpay.com/widget/off-ramp/integration-methods/sdks/react#url-signing) declares `Promise<string>` but returns the `Response` produced by `fetch`. That object contains HTTP metadata and a response body; it is not the signature string the widget expects.

[`src/signing/client.ts`](src/signing/client.ts) sends `{ "url": "..." }` to a same-origin backend with a JSON POST, checks the HTTP status, parses the body, validates `{ "signature": string }`, and returns that string. Sending JSON preserves nested query parameters such as `&` and `+`. Network failures, non-success statuses, malformed JSON, and absent signatures reject the callback with an error.

[`SigningExample.tsx`](src/signing/SigningExample.tsx) wires the callback into `MoonPaySellWidget` inside `MoonPayProvider`. Its callback type comes from the installed `@moonpay/moonpay-react` package, so the compiler checks the actual SDK contract. The example provider key is a placeholder.

The tiny [Express backend](src/signing/backend.ts) signs the URL's query string, including its leading `?`, using HMAC-SHA256 and a deliberately fake test key. It preserves parameter order and encoding and returns raw base64, which the SDK can encode when adding the signature. This follows [MoonPay's signing guide](https://dev.moonpay.com/widget/on-ramp/customization/url-signing); tests check its published fixed vector and a separate encoding/order vector.

The backend accepts only unsigned sandbox widget URLs and listens on loopback when started with the provided script. It never fetches the submitted URL. This is a local demonstration using public placeholder material; a real integration needs server-held credentials and application-specific authentication and signing authorization before deployment.

## Run locally

Use Node.js 22.22.2 or newer supported by the locked dependencies (verified here with 22.22.3):

```sh
npm ci
npm run check       # tsc --noEmit, then all Vitest tests
npm test            # tests, including a compiler regression test
npm run typecheck   # compiler only
npm run start:backend
```

In another terminal, try the local backend with MoonPay's public test vector:

```sh
curl --fail-with-body http://127.0.0.1:3001/api/sign-url \
  -H 'Content-Type: application/json' \
  --data '{"url":"https://buy-sandbox.moonpay.com/?apiKey=pk_test_DocsVector00&currencyCode=eth&walletAddress=0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe"}'
```

Expected response:

```json
{"signature":"oIJxSghyzll/BLhUFdQZhkxf7DAS8REFaWr/ibO+K8Q="}
```

The React file is an integration example, not a bundled frontend. Mount it in your React application and route `/api/sign-url` to the backend, for example through your development server's proxy.

## Verification and limits

The tests cover accepted messages, lookalike origins, wrong windows, channel mismatch, malformed data, handshake replies, and disposal. Signing tests cover the documented vector, query preservation, callback failures, invalid requests, and an actual callback-to-Express HTTP round trip on loopback. A compiler test runs `tsc --noEmit` for the complete project; another confirms the original return-type mismatch produces `TS2322`. Its intentionally invalid fixture is excluded from the main TypeScript project.

Iframe tests dispatch synthetic `MessageEvent`s in jsdom. They check the handler's decisions, not a real browser's cross-origin delivery. No live widget flow, MoonPay credential, transaction, or deployed SDK behavior was tested. No requests to MoonPay services occur during the tests; only the backend tests open a local HTTP server.

The repository includes a lockfile for repeatable installs.
