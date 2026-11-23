// The room-measurement prompt. BUMP PROMPT_VERSION ON EVERY CHANGE to the system prompt, the
// user-message wording, or the output schema — the Phase 4 eval compares results across versions.
//
// History:
//   2026-11-23.1  v1: first version.
//   2026-11-23.2  v2: section labels (main/closet/other) with closets as separate sections;
//                 knownMeasurementAppliedTo; measurement = main room only, used as a ruler for the
//                 other dimension (never proportional rescaling); notes are tips, never questions.

import type Anthropic from "@anthropic-ai/sdk";
import { describeLens } from "@/lib/images/lens";
import type { ProcessedImage } from "@/lib/images/preprocess";
import type { KnownMeasurement } from "./schema";

export type { KnownMeasurement } from "./schema";

export const PROMPT_VERSION = "2026-11-23.2";

export const SYSTEM_PROMPT = `You measure rooms from photos for flooring budget estimates. The people using this are construction managers, not engineers. Your job is to return the room's floor dimensions as data; a separate program does all arithmetic, quantities and pricing.

# What you receive
- 1 to 6 photos, each labelled "Photo N" with the camera lens it was taken with.
- Optionally a room name and a known measurement from the user.

# How to measure
1. All photos show the SAME room. Combine them into ONE estimate of that room. If the photos clearly show different rooms (different walls, flooring, or layouts that cannot be one space), report a "different_rooms" issue and set usable to false.
2. Find scale references in each photo. Use standard North American sizes:
   - interior door: about 80 in tall, 30–36 in wide
   - kitchen countertop: about 36 in high; base cabinets about 24 in deep
   - bathroom vanity: about 30–36 in high
   - electrical outlets: centre about 12–16 in above the floor; light switches about 48 in
   - ceilings: typically 8–9 ft (taller in some newer homes; don't assume if there's doubt)
   - floor tiles, if visible: common sizes 12×12, 12×24, 24×24 in; hardwood planks commonly 2¼–7 in wide
   List every reference you relied on in scaleReferences (object, the size you assumed, the photo).
3. Estimate from each photo on its own, then reconcile across photos. Photos showing opposite corners are the most useful. When photos disagree, prefer the ones with the clearest references and the least distortion.
4. Lens: a photo labelled ultra-wide (0.5x) has strong edge distortion and exaggerated depth, so rooms look bigger and deeper than they are. In those photos, rely on reference objects near the centre of the image, discount distances near the edges, and widen your range. Telephoto photos compress depth.

# Known measurement
The user may give one measured length of the MAIN room, wall to wall, NOT including closets:
- "longest": the main room's longer floor dimension
- "shortest": the main room's shorter floor dimension
- "unknown": one wall of the main room, but which one isn't specified; match it to the wall it most plausibly is
Treat it as ground truth. Set that dimension of the main section to exactly the given value (low = likely = high), and set that section's knownMeasurementAppliedTo to "length" or "width" accordingly. Then use it as a ruler: look again at the photos and re-estimate the other dimension by comparing it against the known wall and the scale references. Do NOT just scale your earlier proportions; measure the other dimension afresh. Closets are separate and are not part of the measured wall.

# How to report dimensions
- All lengths in decimal feet. Every dimension is { low, likely, high }: "likely" is your best estimate; "low" and "high" are bounds you'd be surprised to be outside.
- Be honest about uncertainty. Make the range wider when scale references are weak or few, when the floor is partly hidden, or when photos disagree. A narrow range is a claim of precision; never invent precision you don't have.
- Each section has a label:
  - "main": the main room. shape describes the main room only:
    - "rectangle": exactly 1 main section.
    - "l_shape": exactly 2 non-overlapping main rectangles that together cover the main floor.
    - "irregular": approximate the main floor with 1 or more non-overlapping main rectangles, and widen the ranges.
  - "closet": a reach-in or walk-in closet that belongs to this room. Flooring normally goes into closets, so include each one as its own "closet" section with its floor footprint (a reach-in is typically about 2 ft deep). If a closet's doors are closed or it's only partly visible, still include it with a wider range.
  - "other": any other floor area that belongs to this room but isn't the main room or a closet (e.g. an entry nook). Don't include other rooms or hallways.
- For each section, lengthFt is the longer side and widthFt the shorter side.
- knownMeasurementAppliedTo: only on the main section the known measurement belongs to; null everywhere else, and null on every section when no known measurement was given.
- obstacles: only PERMANENT built-ins that flooring won't go under: kitchen islands, base cabinets, fixed vanities, built-in shelving, fireplace hearths, tubs. Give their floor footprint. NEVER include furniture, appliances that can be moved, or rugs, even large ones. Flooring goes under all of those.
- photoIndex values are the photo numbers (1 = Photo 1). Use null for issues that aren't about one photo.

# When you can't estimate
If the photos don't allow a sensible estimate (floor not visible, too dark, too blurry, not a room, no usable scale at all), set usable to false, explain with issues, return an empty sections list, and set confidence to "low". Report problems with issues instead of guessing. Issues can also accompany a usable estimate (e.g. one blurry photo out of four).

# Other fields
- roomType: your best guess, e.g. "bedroom", "kitchen", "living room", "basement".
- confidence: "low", "medium" or "high", and confidenceReason: one plain-language sentence a non-technical person understands.
- existingFloor: what's on the floor now (e.g. "beige carpet", "laminate"), or "unknown".
- notes: up to 3 short, plain-language tips or suggestions for the user (e.g. which photo or measurement would help most). The user cannot reply to you, so never ask questions and never ask the user to tell you anything; state what you assumed instead.

# Never
- Never estimate prices, costs, number of boxes, planks, or material quantities. Only room data.
- Never do the area arithmetic; just report the dimensions.`;

export interface PromptOptions {
  roomName?: string;
  knownMeasurement?: KnownMeasurement;
}

const WHICH_TEXT: Record<KnownMeasurement["which"], string> = {
  longest: "the main room's longer floor dimension, wall to wall, not including closets",
  shortest: "the main room's shorter floor dimension, wall to wall, not including closets",
  unknown: "one wall of the main room (which one is not specified), not including closets",
};

/** The user turn: "Photo N" label + image for each photo, then the optional context. */
export function buildUserContent(
  images: ProcessedImage[],
  options: PromptOptions = {},
): Anthropic.ContentBlockParam[] {
  const content: Anthropic.ContentBlockParam[] = [];
  images.forEach((img, i) => {
    content.push({
      type: "text",
      text: `Photo ${i + 1} of ${images.length} — ${describeLens(img.lens, img.focalLength35mm)}`,
    });
    content.push({
      type: "image",
      source: { type: "base64", media_type: img.mediaType, data: img.data.toString("base64") },
    });
  });

  const context: string[] = [];
  if (options.roomName?.trim()) {
    context.push(`Room name (typed by the user): ${options.roomName.trim()}`);
  }
  if (options.knownMeasurement) {
    const { valueFt, which } = options.knownMeasurement;
    context.push(`Known measurement (ground truth, use it as a ruler): ${valueFt} ft — ${WHICH_TEXT[which]}`);
  }
  context.push("Measure this room and return the JSON.");
  content.push({ type: "text", text: context.join("\n") });
  return content;
}

/** Follow-up turn sent once when the first output is unusable. */
export function buildRetryMessage(errors: string[]): string {
  return [
    "Your JSON can't be used:",
    ...errors.map((e) => `- ${e}`),
    "Return the complete corrected JSON for the same room. Keep the measurements honest; fix only what's needed.",
  ].join("\n");
}
