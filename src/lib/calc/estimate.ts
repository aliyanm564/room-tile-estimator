import type { FlooringProduct, RoomInput, RoomResult, Settings } from "@/types";
import { roomAreaSqft } from "./area";
import { materialCost, resolvePrice } from "./cost";
import { CalcError } from "./errors";
import { approxPlanks, boxesNeeded, purchasedSqft, sqftNeeded } from "./flooring";
import { isExact } from "./range";

/** Full estimate for one room. Pure: product and settings are passed in. */
export function estimateRoom(
  input: RoomInput,
  product: FlooringProduct,
  settings: Settings,
): RoomResult {
  if (input.productId !== product.id) {
    throw new CalcError(`Product mismatch: expected "${input.productId}", got "${product.id}".`);
  }
  const wasteFactor = settings.wasteFactors[input.layout];
  if (wasteFactor === undefined) {
    throw new CalcError(`Unknown layout "${input.layout}".`);
  }

  const area = roomAreaSqft(input.sections, input.obstacles, input.unit);
  const needed = sqftNeeded(area.net, wasteFactor);
  const boxes = boxesNeeded(needed, product.sqftPerBox);
  const purchased = purchasedSqft(boxes, product.sqftPerBox);
  const price = resolvePrice(product, input.priceOverridePerSqft);

  return {
    productId: product.id,
    isRange: !isExact(area.net),
    grossAreaSqft: area.gross,
    obstacleAreaSqft: area.obstacles,
    areaSqft: area.net,
    wasteFactor,
    sqftNeeded: needed,
    boxes,
    purchasedSqft: purchased,
    approxPlanks: approxPlanks(
      needed,
      product.plankWidthIn,
      product.plankLengthIn,
      product.randomLengths,
    ),
    pricePerSqft: price.pricePerSqft,
    priceSource: price.source,
    cost: materialCost(purchased, price.pricePerSqft),
    currency: product.currency,
  };
}
