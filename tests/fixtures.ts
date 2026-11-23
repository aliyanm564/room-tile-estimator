import type { FlooringProduct, RoomInput, Settings } from "@/types";

export const settings: Settings = {
  wasteFactors: { straight: 0.1, diagonal: 0.15, herringbone: 0.15 },
  defaultUnits: "imperial",
};

/** 20 sq ft/box, 5" × 48" fixed-length planks, $5/sq ft placeholder. */
export const product: FlooringProduct = {
  id: "test-eng-5",
  name: "Test Engineered 5in",
  category: "hardwood",
  construction: "engineered",
  plankWidthIn: 5,
  plankLengthIn: 48,
  randomLengths: false,
  sqftPerBox: 20,
  pricePerSqft: 5,
  currency: "CAD",
  source: "placeholder",
  sourceUrl: null,
  lastChecked: null,
  verified: false,
};

export const verifiedProduct: FlooringProduct = {
  ...product,
  id: "test-verified",
  source: "Rona",
  sourceUrl: "https://example.com/product",
  lastChecked: "2026-11-01",
  verified: true,
};

export function room(overrides: Partial<RoomInput> = {}): RoomInput {
  return {
    unit: "ft",
    sections: [{ length: 10, width: 10 }],
    layout: "straight",
    productId: product.id,
    ...overrides,
  };
}
