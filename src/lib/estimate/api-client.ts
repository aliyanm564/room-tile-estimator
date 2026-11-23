// Browser-side client for POST /api/estimate. Never shows raw errors: the server already sends a
// plain-language message; if it can't (network down, proxy error page, timeout), we fall back to
// a friendly message for the error code or HTTP status.

import type { KnownMeasurement, RoomAnalysis } from "@/lib/ai/schema";
import type { PreparedPhoto } from "@/lib/images/shrink-client";

/** Friendly fallback for EVERY error code the server can return (a test enforces this). */
export const API_ERROR_MESSAGES: Record<string, string> = {
  // input / photos
  no_images: "Add at least one photo of the room.",
  too_many_images: "You can send up to 6 photos per room.",
  file_too_large: "One of the photos is too large. Each photo must be 20MB or smaller.",
  unreadable_image: "One of the photos couldn't be read. Try taking or choosing it again.",
  unsupported_format: "One of the files isn't a supported photo type. Use JPEG, PNG, WebP, or HEIC photos.",
  heic_conversion_failed: "An iPhone (HEIC) photo couldn't be converted. Try sharing it as a JPEG instead.",
  file_not_found: "One of the photos couldn't be found. Try choosing it again.",
  invalid_known_measurement: "The wall measurement doesn't look right. Check it and try again.",
  invalid_request: "The photos couldn't be sent. Please try again.",
  // AI service
  missing_api_key: "Photo analysis isn't set up on this server yet. You can still measure both walls.",
  auth_failed: "Photo analysis isn't available right now. You can still measure both walls.",
  unknown_model: "Photo analysis isn't available right now. You can still measure both walls.",
  rate_limited: "The photo analyzer is busy. Please try again in a minute.",
  timeout: "Analyzing the photos took too long. Please try again, maybe with fewer photos.",
  connection_failed: "The server couldn't reach the photo analyzer. Please try again in a minute.",
  ai_unavailable: "The photo analyzer is temporarily unavailable. Please try again in a few minutes.",
  ai_failed: "Something went wrong analyzing the photos. Please try again.",
  invalid_output: "The photo analyzer returned a result we couldn't use. Please try again.",
  refused: "The photo analyzer couldn't process these photos. Try different photos of the room.",
  internal_error: "Something went wrong on our side. Please try again.",
  // client-side only
  network_error: "Couldn't reach the server. Check your internet connection and try again.",
  client_timeout: "Analyzing the photos took too long. Please try again, maybe with fewer photos.",
};

function messageForStatus(status: number): { code: string; message: string } {
  if (status === 413) return { code: "file_too_large", message: API_ERROR_MESSAGES.file_too_large };
  if (status === 429) return { code: "rate_limited", message: API_ERROR_MESSAGES.rate_limited };
  if (status === 504) return { code: "timeout", message: API_ERROR_MESSAGES.timeout };
  if (status >= 500) return { code: "ai_unavailable", message: API_ERROR_MESSAGES.ai_unavailable };
  return { code: "internal_error", message: API_ERROR_MESSAGES.internal_error };
}

export class EstimateApiError extends Error {
  constructor(
    readonly code: string,
    /** Plain-language message, safe to show. */
    message: string,
  ) {
    super(message);
    this.name = "EstimateApiError";
  }
}

/** Every call costs money, so the client gives up after this long rather than waiting forever. */
export const CLIENT_TIMEOUT_MS = 200_000;

export interface TransportOptions {
  timeoutMs: number;
  /** 0..1 as the request body uploads. */
  onUploadProgress?: (fraction: number) => void;
}

/** Sends the form; resolves with the status and body text. Rejects with kind "network" | "timeout". */
export type Transport = (url: string, form: FormData, opts: TransportOptions) => Promise<{ status: number; text: string }>;

export class TransportError extends Error {
  constructor(readonly kind: "network" | "timeout") {
    super(kind);
  }
}

/** XMLHttpRequest transport: unlike fetch, it reports upload progress. */
export const xhrTransport: Transport = (url, form, { timeoutMs, onUploadProgress }) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.timeout = timeoutMs;
    if (onUploadProgress) {
      xhr.upload.onprogress = (e) => e.lengthComputable && onUploadProgress(e.loaded / e.total);
      xhr.upload.onload = () => onUploadProgress(1);
    }
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
    xhr.onerror = () => reject(new TransportError("network"));
    xhr.ontimeout = () => reject(new TransportError("timeout"));
    xhr.send(form);
  });

export async function requestAnalysis(
  photos: PreparedPhoto[],
  knownMeasurement?: KnownMeasurement,
  opts: { transport?: Transport; timeoutMs?: number; roomName?: string; onUploadProgress?: (fraction: number) => void } = {},
): Promise<RoomAnalysis> {
  const form = new FormData();
  for (const p of photos) form.append("images", p.file, p.name);
  if (photos.some((p) => p.lensHint)) form.append("lensHints", JSON.stringify(photos.map((p) => p.lensHint)));
  if (knownMeasurement) form.append("knownMeasurement", JSON.stringify(knownMeasurement));
  if (opts.roomName) form.append("roomName", opts.roomName);

  let res: { status: number; text: string };
  try {
    res = await (opts.transport ?? xhrTransport)("/api/estimate", form, {
      timeoutMs: opts.timeoutMs ?? CLIENT_TIMEOUT_MS,
      onUploadProgress: opts.onUploadProgress,
    });
  } catch (e) {
    throw e instanceof TransportError && e.kind === "timeout"
      ? new EstimateApiError("client_timeout", API_ERROR_MESSAGES.client_timeout)
      : new EstimateApiError("network_error", API_ERROR_MESSAGES.network_error);
  }

  let body: unknown = null;
  try {
    body = JSON.parse(res.text);
  } catch {
    body = null; // e.g. an HTML error page from a proxy
  }

  if (res.status < 200 || res.status >= 300) {
    const err = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
    const code = typeof err?.code === "string" ? err.code : null;
    const serverMessage = typeof err?.message === "string" && err.message.trim() ? err.message : null;
    if (code && serverMessage) throw new EstimateApiError(code, serverMessage);
    if (code && API_ERROR_MESSAGES[code]) throw new EstimateApiError(code, API_ERROR_MESSAGES[code]);
    const fallback = messageForStatus(res.status);
    throw new EstimateApiError(fallback.code, fallback.message);
  }
  if (!body || typeof body !== "object" || !("meta" in body)) {
    throw new EstimateApiError("internal_error", API_ERROR_MESSAGES.internal_error);
  }
  return body as RoomAnalysis;
}
