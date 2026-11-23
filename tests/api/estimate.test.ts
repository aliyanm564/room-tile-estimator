import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalysisError, type RoomAnalyzer } from "@/lib/ai";
import { buildRoomAnalysis } from "@/lib/ai/provider";
import { MAX_FILE_BYTES } from "@/lib/images/preprocess";
import { makeImage, validOutput } from "../helpers/images";

const analyzeRoom = vi.fn<RoomAnalyzer["analyzeRoom"]>();

vi.mock("@/lib/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai")>()),
  getAnalyzer: () => ({ analyzeRoom }),
}));

const { POST } = await import("@/app/api/estimate/route");

const meta = { model: "claude-sonnet-5-5" as const, promptVersion: "test", inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0, durationMs: 1, attempts: 1 };

async function post(fields: Record<string, string | File | File[]>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    for (const item of Array.isArray(v) ? v : [v]) form.append(k, item);
  }
  const res = await POST(new Request("http://localhost/api/estimate", { method: "POST", body: form }));
  return { status: res.status, body: await res.json() };
}

const photo = async (name = "room.jpg", opts = {}) =>
  new File([new Uint8Array(await makeImage({ width: 400, height: 300, ...opts }))], name, { type: "image/jpeg" });

beforeEach(() => {
  analyzeRoom.mockReset();
  analyzeRoom.mockImplementation(async (images) => buildRoomAnalysis(images, validOutput(), meta));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/estimate", () => {
  it("returns the analysis for valid photos, passing room name and known measurement", async () => {
    const { status, body } = await post({
      images: [await photo("a.jpg", { focal35: 26 }), await photo("b.jpg", { focal35: 13 })],
      roomName: "  Main bedroom ",
      knownMeasurement: JSON.stringify({ valueFt: 14, which: "longest" }),
    });
    expect(status).toBe(200);
    expect(body.roomType).toBe("bedroom");
    expect(body.photos.map((p: { lens: string }) => p.lens)).toEqual(["standard", "ultra_wide"]);
    expect(body.issues[0]).toMatchObject({ code: "ultra_wide_lens", photoIndex: 2, source: "app" });
    const [images, options] = analyzeRoom.mock.calls[0];
    expect(images).toHaveLength(2);
    expect(images[0].mediaType).toBe("image/jpeg");
    expect(options).toEqual({ roomName: "Main bedroom", knownMeasurement: { valueFt: 14, which: "longest" } });
  });

  it("400 when no photos are sent", async () => {
    const { status, body } = await post({ roomName: "Kitchen" });
    expect(status).toBe(400);
    expect(body.error).toEqual({ code: "no_images", message: "Add at least one photo of the room." });
    expect(analyzeRoom).not.toHaveBeenCalled();
  });

  it("413 for more than 6 photos", async () => {
    const p = await photo();
    const { status, body } = await post({ images: Array(7).fill(p) });
    expect(status).toBe(413);
    expect(body.error.code).toBe("too_many_images");
  });

  it("413 for a file over 20MB", async () => {
    const huge = new File([new Uint8Array(MAX_FILE_BYTES + 1)], "huge.jpg", { type: "image/jpeg" });
    const { status, body } = await post({ images: huge });
    expect(status).toBe(413);
    expect(body.error.message).toMatch(/"huge\.jpg"/);
  });

  it("415 for an unsupported file type", async () => {
    const gif = new File([new Uint8Array(await makeImage({ format: "gif" }))], "anim.gif", { type: "image/gif" });
    const { status, body } = await post({ images: gif });
    expect(status).toBe(415);
    expect(body.error.code).toBe("unsupported_format");
  });

  it("400 for a malformed known measurement", async () => {
    const { status, body } = await post({ images: await photo(), knownMeasurement: '{"valueFt": -3}' });
    expect(status).toBe(400);
    expect(body.error.code).toBe("invalid_known_measurement");
  });

  it("400 for a non-multipart body", async () => {
    const res = await POST(new Request("http://localhost/api/estimate", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_request");
  });

  it("provider errors → friendly message and status; internal detail is not leaked", async () => {
    analyzeRoom.mockRejectedValueOnce(
      new AnalysisError("rate_limited", "The photo analyzer is busy. Please try again in a minute.", 429, "RateLimitError: org_123 exceeded 50 RPM"),
    );
    const { status, body } = await post({ images: await photo() });
    expect(status).toBe(429);
    expect(body).toEqual({ error: { code: "rate_limited", message: "The photo analyzer is busy. Please try again in a minute." } });
    expect(JSON.stringify(body)).not.toMatch(/org_123/);
  });

  it("unexpected errors → generic 500 with no internals", async () => {
    analyzeRoom.mockRejectedValueOnce(new Error("TypeError at /Users/x/secret.ts: sk-ant-api-key"));
    const { status, body } = await post({ images: await photo() });
    expect(status).toBe(500);
    expect(body.error.code).toBe("internal_error");
    expect(JSON.stringify(body)).not.toMatch(/sk-ant|secret|TypeError/);
  });
});
