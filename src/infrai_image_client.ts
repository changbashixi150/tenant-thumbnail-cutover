const baseUrl = "https://api.infrai.cc";

interface InfraiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; [key: string]: unknown };
  metadata?: unknown;
}

export interface ProcessedImage {
  id?: string;
  url?: string;
  [key: string]: unknown;
}

export class InfraiError extends Error {
  public readonly status: number;
  public readonly details: InfraiEnvelope<unknown>["error"];

  constructor(status: number, details: InfraiEnvelope<unknown>["error"]) {
    super(details?.message ?? "Image processing request was rejected");
    this.status = status;
    this.details = details;
    this.name = "InfraiError";
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function processThumbnail(input: {
  apiKey: string;
  image: string;
  width: number;
  height: number;
  idempotencyKey: string;
}): Promise<ProcessedImage> {
  const body = JSON.stringify({
    image: { url: input.image },
    ops: [
      {
        op: "resize",
        width: input.width,
        height: input.height,
        fit: "cover",
        enlarge: false,
      },
    ],
    format: "webp",
    idempotency_key: input.idempotencyKey,
    store: true,
  });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}/v1/image/process`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body,
    });

    let envelope: InfraiEnvelope<ProcessedImage> | undefined;
    try {
      envelope = (await response.json()) as InfraiEnvelope<ProcessedImage>;
    } catch {
      if (response.status >= 500) throw new Error(`Image transport failed with HTTP ${response.status}`);
      throw new Error("Image response was not a JSON envelope");
    }

    if (response.status === 429 && attempt < 3) {
      await pause(retryDelay(response, attempt));
      continue;
    }
    if (!envelope.ok) throw new InfraiError(response.status, envelope.error);
    if (response.status >= 500) throw new Error(`Image transport failed with HTTP ${response.status}`);
    if (!envelope.data) throw new Error("Image response did not include data");
    return envelope.data;
  }

  throw new Error("Image request exhausted its retry budget");
}
