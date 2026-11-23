import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { API_ERROR_MESSAGES, EstimateApiError, requestAnalysis } from "@/lib/estimate/api-client";

const photo = new File([new Uint8Array([1, 2, 3])], "a.jpg", { type: "image/jpeg" });

const respond = (status: number, body: unknown, raw = false) =>
  vi.fn<typeof fetch>().mockResolvedValue(new Response(raw ? String(body) : JSON.stringify(body), { status }));

async function failure(fetchImpl: typeof fetch, timeoutMs?: number) {
  const err = await requestAnalysis([photo], undefined, { fetchImpl, timeoutMs }).catch((e) => e);
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
  it("posts the photos and known measurement as multipart to /api/estimate", async () => {
    const f = respond(200, { meta: {}, usable: true });
    await requestAnalysis([photo, photo], { valueFt: 12.47, which: "longest" }, { fetchImpl: f });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("/api/estimate");
    const form = init!.body as FormData;
    expect(form.getAll("images")).toHaveLength(2);
    expect(JSON.parse(String(form.get("knownMeasurement")))).toEqual({ valueFt: 12.47, which: "longest" });
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

  it("network failure and client timeout → friendly messages", async () => {
    expect((await failure(vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch")))).code).toBe("network_error");
    const hang: typeof fetch = (_u, init) =>
      new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))));
    expect((await failure(hang, 5)).code).toBe("client_timeout");
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
