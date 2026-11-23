import { describe, expect, it } from "vitest";
import { ConfigError, brandTextColor, loadConfig, parseBranding } from "@/lib/catalog";

describe("branding config", () => {
  it("the shipped config/branding.json is valid", () => {
    expect(loadConfig().branding).toMatchObject({ appName: "Flooring Estimator", logoPath: null });
  });

  it("accepts a client's branding with a logo in public/", () => {
    expect(parseBranding({ appName: "Acme Floors", primaryColor: "#1D4ED8", logoPath: "/acme-logo.svg" })).toMatchObject({ appName: "Acme Floors" });
  });

  it("rejects bad colours, logo paths and unknown fields with a clear error", () => {
    const ok = { appName: "X", primaryColor: "#000000", logoPath: null };
    expect(() => parseBranding({ ...ok, primaryColor: "blue" })).toThrow(/branding\.json[\s\S]*primaryColor: must be a hex colour/);
    expect(() => parseBranding({ ...ok, logoPath: "https://evil.example/logo.png" })).toThrow(ConfigError);
    expect(() => parseBranding({ ...ok, logoPath: "/logo.gif" })).toThrow(ConfigError);
    expect(() => parseBranding({ ...ok, appName: "  " })).toThrow(ConfigError);
    expect(() => parseBranding({ ...ok, colour: "#fff" })).toThrow(ConfigError);
  });

  it("picks readable text on the brand colour", () => {
    expect(brandTextColor("#1c1917")).toBe("#ffffff");
    expect(brandTextColor("#1d4ed8")).toBe("#ffffff");
    expect(brandTextColor("#facc15")).toBe("#000000");
    expect(brandTextColor("#ffffff")).toBe("#000000");
  });
});
