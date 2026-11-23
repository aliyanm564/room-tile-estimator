import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { API_ERROR_MESSAGES, EstimateApiError, TransportError, requestAnalysis, type Transport } from "@/lib/estimate/api-client";
import type { PreparedPhoto } from "@/lib/images/shrink-client";

const photo = (lensHint: PreparedPhoto["lensHint"] = null): PreparedPhoto => ({
  file: new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
  name: "a.jpg",
  lensHint,
  shrunk: !!lensHint,
});

const respond = (status: number, body: unknown, raw = false) =>
  vi.fn<Transport>().mockResolvedValue({ status, text: raw ? String(body) : JSON.stringify(body) });

async function failure(transport: Transport) {
  const err = await requestAnalysis([photo()], undefined, { transport }).catch((e) => e);
  expect(err).toBeInstanceOf(EstimateApiError);
  return err as EstimateApiError;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sourceFiles(p) : p.endsWith(".ts") ? [p] : [];
  });
}

describe("requestAnalysis", () => {
  it("posts photos, known measurement and lens hints as multipart to /api/estimate", async () => {
    const t = respond(200, { meta: {}, usable: true });
    await requestAnalysis([photo({ focalLength35mm: 13, lensModel: "back ultra wide camera" }), photo()], { valueFt: 12.47, which: "longest" }, { transport: t });
    const [url, form] = t.mock.calls[0];
    expect(url).toBe("/api/estimate");
    expect(form.getAll("images")).toHaveLength(2);
    expect(JSON.parse(String(form.get("knownMeasurement")))).toEqual({ valueFt: 12.47, which: "longest" });
    expect(JSON.parse(String(form.get("lensHints")))).toEqual([{ focalLength35mm: 13, lensModel: "back ultra wide camera" }, null]);
  });

  it("omits lensHints when no photo has one", async () => {
    const t = respond(200, { meta: {} });
    await requestAnalysis([photo()], undefined, { transport: t });
    expect(t.mock.calls[0][1].has("lensHints")).toBe(false);
  });

  it("passes upload progress through", async () => {
    const seen: number[] = [];
    const t: Transport = async (_u, _f, o) => {
      o.onUploadProgress?.(0.5);
      o.onUploadProgress?.(1);
      return { status: 200, text: JSON.stringify({ meta: {} }) };
    };
    await requestAnalysis([photo()], undefined, { transport: t, onUploadProgress: (f) => seen.push(f) });
    expect(seen).toEqual([0.5, 1]);
  });

  it("shows the server's friendly message", async () => {
    const err = await failure(respond(429, { error: { code: "rate_limited", message: "Busy, try in a minute." } }));
    expect([err.code, err.message]).toEqual(["rate_limited", "Busy, try in a minute."]);
  });

  it("known code without a message → our fallback for that code", async () => {
    const err = await failure(respond(503, { error: { code: "missing_api_key" } }));
    expect(err.message).toBe(API_ERROR_MESSAGES.missing_api_key);
  });

  it("non-JSON error pages never leak; fall back by status", async () => {
    const err502 = await failure(respond(502, "<html>Bad Gateway nginx/1.2 at /var/www</html>", true));
    expect(err502.message).toBe(API_ERROR_MESSAGES.ai_unavailable);
    const err413 = await failure(respond(413, "Payload Too Large", true));
    expect(err413.code).toBe("file_too_large");
  });

  it("network failure and timeout → friendly messages", async () => {
    expect((await failure(vi.fn<Transport>().mockRejectedValue(new TransportError("network")))).code).toBe("network_error");
    expect((await failure(vi.fn<Transport>().mockRejectedValue(new TransportError("timeout")))).code).toBe("client_timeout");
    expect((await failure(vi.fn<Transport>().mockRejectedValue(new Error("weird")))).code).toBe("network_error");
  });

  it("every error code the server can return has a friendly client message", () => {
    const src = sourceFiles("src").map((p) => readFileSync(p, "utf8")).join("\n");
    const codes = new Set(
      [...src.matchAll(/new (?:ImageError|AnalysisError|UserFacingError)\(\s*"([a-z_]+)"|errorResponse\(\s*"([a-z_]+)"/g)].map(
        (m) => m[1] ?? m[2],
      ),
    );
    expect(codes.size).toBeGreaterThan(15); // sanity: the scan found them
    const missing = [...codes].filter((c) => !API_ERROR_MESSAGES[c]);
    expect(missing).toEqual([]);
  });
});
