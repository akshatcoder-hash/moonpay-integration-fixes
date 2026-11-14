// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { attachFrameChannel, FRAME_ORIGINS } from "../src/frames.js";

const origin = FRAME_ORIGINS[0];
const channelId = "ch_reference_test";
const ready = { version: 2, meta: { channelId }, kind: "ready" };
const disposers: Array<() => void> = [];

function setup() {
  const iframe = document.createElement("iframe");
  iframe.src = `${origin}/platform/v1/connect?channelId=${channelId}`;
  document.body.append(iframe);
  const source = iframe.contentWindow!;
  const onMessage = vi.fn();
  const channel = attachFrameChannel({ iframe, channelId, onMessage });
  disposers.push(channel.dispose);
  const send = (overrides: MessageEventInit<unknown> = {}) => {
    window.dispatchEvent(new MessageEvent("message", {
      origin, source, data: ready, ...overrides,
    }));
  };
  return { iframe, source, onMessage, send, ...channel };
}

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  document.body.replaceChildren();
});

describe("frame message boundary", () => {
  it.each([ready, JSON.stringify(ready)])("accepts a valid object or JSON message: %j", (data) => {
    const { send, onMessage } = setup();
    send({ data });
    expect(onMessage).toHaveBeenCalledExactlyOnceWith(ready);
  });

  it("acknowledges a handshake only to the exact frame origin", () => {
    const { send, source, onMessage } = setup();
    const postMessage = vi.spyOn(source, "postMessage").mockImplementation(() => {});
    send({ data: { ...ready, kind: "handshake" } });
    expect(postMessage).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({ version: 2, meta: { channelId }, kind: "ack" }), origin,
    );
    expect(onMessage).toHaveBeenCalledOnce();
  });

  it.each([
    "https://moonpay.com.attacker.example",
    "https://platform.moonpay.com.attacker.example",
    "https://notmoonpay.com",
    "https://moonpay.com-attacker.example",
    "https://unlisted.moonpay.com",
    "http://platform.moonpay.com",
    "https://platform.moonpay.com:444",
    "null",
  ])("rejects an unlisted origin: %s", (untrustedOrigin) => {
    const { send, onMessage, source } = setup();
    const postMessage = vi.spyOn(source, "postMessage").mockImplementation(() => {});
    send({ origin: untrustedOrigin, data: { ...ready, kind: "handshake" } });
    expect(onMessage).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("rejects the parent and another iframe even with a valid origin and channel", () => {
    const { send, onMessage } = setup();
    const sibling = document.createElement("iframe");
    document.body.append(sibling);
    send({ source: window });
    send({ source: sibling.contentWindow });
    send({ source: null });
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("rejects a channel mismatch", () => {
    const { send, onMessage } = setup();
    send({ data: { ...ready, meta: { channelId: "another-channel" } } });
    expect(onMessage).not.toHaveBeenCalled();
  });

  it.each([null, 42, [], "{", {}, { ...ready, version: 1 }, { ...ready, meta: null },
    { ...ready, kind: 42 }, { ...ready, kind: "" }])("ignores malformed messages: %j", (data) => {
    const { send, onMessage } = setup();
    expect(() => send({ data })).not.toThrow();
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("removes the listener and iframe on dispose, ignores later messages, and permits repeat disposal", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { send, onMessage, iframe, dispose } = setup();
    const listener = add.mock.calls.find(([type]) => type === "message")?.[1];
    expect(listener).toBeTypeOf("function");
    send();
    dispose();
    dispose();
    expect(remove).toHaveBeenCalledExactlyOnceWith("message", listener);
    expect(iframe.isConnected).toBe(false);
    send();
    expect(onMessage).toHaveBeenCalledOnce();
  });

  it("rejects attaching a frame outside the explicit allowlist", () => {
    const iframe = document.createElement("iframe");
    iframe.src = "https://moonpay.com.attacker.example";
    document.body.append(iframe);
    expect(() => attachFrameChannel({ iframe, channelId, onMessage: vi.fn() }))
      .toThrow("Iframe origin is not allowed");
  });

  it("requires a mounted iframe and non-empty channel", () => {
    const iframe = document.createElement("iframe");
    iframe.src = origin;
    expect(() => attachFrameChannel({ iframe, channelId, onMessage: vi.fn() }))
      .toThrow("Mount the iframe");
    document.body.append(iframe);
    expect(() => attachFrameChannel({ iframe, channelId: "", onMessage: vi.fn() }))
      .toThrow("non-empty channel");
  });

  it("before/after: the documented substring guard accepts a lookalike; the corrected handler ignores it", () => {
    const { send, onMessage, source } = setup();
    const lookalike = "https://moonpay.com.attacker.example";
    const originalOnMessage = vi.fn();
    // Reproduce the documented origin, version, and channel checks in a test only.
    const originalHandler = (event: MessageEvent<typeof ready>) => {
      if (!event.origin.includes("moonpay.com")) return;
      if (event.data.version !== 2 || event.data.meta?.channelId !== channelId) return;
      originalOnMessage(event.data);
    };
    const event = new MessageEvent("message", { origin: lookalike, source, data: ready });
    originalHandler(event);
    expect(originalOnMessage).toHaveBeenCalledExactlyOnceWith(ready);
    send({ origin: lookalike });
    expect(onMessage).not.toHaveBeenCalled();
  });
});
