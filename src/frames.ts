export const FRAME_ORIGINS = ["https://platform.moonpay.com"] as const;
const allowedOrigins = new Set<string>(FRAME_ORIGINS);

export interface FrameMessage {
  version: 2;
  meta: { channelId: string };
  kind: string;
  payload?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMessage(data: unknown, channelId: string): FrameMessage | null {
  let value: unknown;
  try {
    value = typeof data === "string" ? JSON.parse(data) : data;
  } catch {
    return null;
  }

  if (
    !isRecord(value) ||
    value.version !== 2 ||
    !isRecord(value.meta) ||
    value.meta.channelId !== channelId ||
    typeof value.kind !== "string" ||
    value.kind.length === 0
  ) {
    return null;
  }

  return {
    version: 2,
    meta: { channelId },
    kind: value.kind,
    payload: value.payload,
  };
}

/** Attach to a mounted iframe. Disposing also removes that iframe. */
export function attachFrameChannel({
  iframe,
  channelId,
  onMessage,
}: {
  iframe: HTMLIFrameElement;
  channelId: string;
  onMessage: (message: FrameMessage) => void;
}): { dispose: () => void } {
  const hostWindow = iframe.ownerDocument.defaultView;
  const frameWindow = iframe.contentWindow;
  const frameOrigin = new URL(iframe.src).origin;
  if (!hostWindow || !frameWindow || !iframe.isConnected) {
    throw new Error("Mount the iframe before attaching its channel");
  }
  if (!allowedOrigins.has(frameOrigin)) {
    throw new Error("Iframe origin is not allowed");
  }
  if (channelId.length === 0) {
    throw new Error("A non-empty channel ID is required");
  }

  let disposed = false;
  const handleMessage = (event: MessageEvent<unknown>): void => {
    if (
      disposed ||
      !allowedOrigins.has(event.origin) ||
      event.origin !== frameOrigin ||
      event.source !== frameWindow
    ) {
      return;
    }
    const message = parseMessage(event.data, channelId);
    if (!message) return;

    if (message.kind === "handshake") {
      const ack: FrameMessage = { version: 2, meta: { channelId }, kind: "ack" };
      frameWindow.postMessage(JSON.stringify(ack), frameOrigin);
    }
    onMessage(message);
  };

  hostWindow.addEventListener("message", handleMessage);
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      hostWindow.removeEventListener("message", handleMessage);
      iframe.remove();
    },
  };
}
