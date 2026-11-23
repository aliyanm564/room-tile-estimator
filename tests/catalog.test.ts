import { describe, expect, it } from "vitest";
import { ConfigError, loadCatalog, loadSettings, parseCatalog, parseSettings } from "@/lib/catalog";
import { product } from "./fixtures";

describe("config loading", () => {
  it("the shipped config files are valid", () => {
    const products = loadCatalog();
    expect(products.length).toBeGreaterThanOrEqual(5);
    expect(products.every((p) => p.category === "hardwood")).toBe(true);
    expect(loadSettings().wasteFactors.straight).toBe(0.1);
    expect(loadSettings().defaultUnits).toBe("imperial");
  });

  it("accepts a valid catalog", () => {
    expect(parseCatalog({ products: [product] })).toHaveLength(1);
  });

  it.each([
    ["negative price", { ...product, pricePerSqft: -1 }],
    ["zero box size", { ...product, sqftPerBox: 0 }],
    ["wrong category", { ...product, category: "tile" }],
    ["bad currency", { ...product, currency: "USD" }],
    ["missing length for fixed-length product", { ...product, plankLengthIn: null }],
    ["bad date", { ...product, lastChecked: "last week" }],
    ["bad url", { ...product, sourceUrl: "not a url" }],
    ["verified placeholder", { ...product, verified: true }],
    ["unknown field", { ...product, sku: "123" }],
  ])("rejects a bad catalog: %s", (_label, bad) => {
    expect(() => parseCatalog({ products: [bad] })).toThrow(ConfigError);
  });

  it("rejects duplicate ids and an empty catalog", () => {
    expect(() => parseCatalog({ products: [product, product] })).toThrow(/unique/);
    expect(() => parseCatalog({ products: [] })).toThrow(ConfigError);
    expect(() => parseCatalog(null)).toThrow(ConfigError);
  });

  it("error message names the file and the field", () => {
    expect(() => parseCatalog({ products: [{ ...product, pricePerSqft: "5" }] })).toThrow(
      /flooring-catalog\.json[\s\S]*products\.0\.pricePerSqft/,
    );
  });

  it("rejects bad settings", () => {
    const good = { wasteFactors: { straight: 0.1, diagonal: 0.15, herringbone: 0.15 }, defaultUnits: "imperial" };
    expect(parseSettings(good)).toEqual(good);
    expect(() => parseSettings({ ...good, defaultUnits: "cubits" })).toThrow(ConfigError);
    expect(() => parseSettings({ ...good, wasteFactors: { straight: 0.1, diagonal: 0.15 } })).toThrow(ConfigError);
    expect(() => parseSettings({ ...good, wasteFactors: { ...good.wasteFactors, straight: -0.1 } })).toThrow(
      ConfigError,
    );
  });
});
