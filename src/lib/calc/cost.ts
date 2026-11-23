import type { FlooringProduct, PriceSource, Range, ResultRange } from "@/types";
import { CalcError } from "./errors";
import { mapRange } from "./range";

export interface ResolvedPrice {
  pricePerSqft: number;
  source: PriceSource;
}

/** User override wins; otherwise the catalog price, flagged if it isn't verified. */
export function resolvePrice(
  product: FlooringProduct,
  overridePerSqft?: number | null,
): ResolvedPrice {
  if (overridePerSqft != null) {
    if (!Number.isFinite(overridePerSqft) || overridePerSqft <= 0) {
      throw new CalcError("Your price must be greater than zero.");
    }
    return { pricePerSqft: overridePerSqft, source: "user" };
  }
  const isPlaceholder = !product.verified || product.source === "placeholder";
  return {
    pricePerSqft: product.pricePerSqft,
    source: isPlaceholder ? "placeholder" : "catalog",
  };
}

/** You pay for whole boxes: cost = purchasedSqft × pricePerSqft. */
export function materialCost(purchasedSqft: Range, pricePerSqft: number): ResultRange {
  return mapRange(purchasedSqft, (s) => s * pricePerSqft);
}
