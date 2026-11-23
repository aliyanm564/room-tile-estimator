import type { RoomStatus } from "@/lib/project/model";
import type { BadgeTone } from "./ui";
import type { FlooringProduct, Layout } from "@/types";

export const LAYOUT_LABELS: Record<Layout, string> = {
  straight: "Straight",
  diagonal: "Diagonal",
  herringbone: "Herringbone",
};

export const STATUS: Record<RoomStatus, { label: string; tone: BadgeTone; needsAction: boolean }> = {
  measured: { label: "Measured", tone: "green", needsAction: false },
  estimated: { label: "Estimated", tone: "blue", needsAction: false },
  needs_input: { label: "Needs photos or measurements", tone: "amber", needsAction: true },
  needs_photos: { label: "Needs photos or the other wall", tone: "amber", needsAction: true },
  unusable: { label: "Photos couldn't be used", tone: "orange", needsAction: true },
  invalid: { label: "Check the measurements", tone: "red", needsAction: true },
};

export function productName(products: FlooringProduct[], id: string): string {
  return (products.find((p) => p.id === id)?.name ?? "Flooring no longer in the catalog").replace(/\s*\(placeholder\)$/, "");
}
