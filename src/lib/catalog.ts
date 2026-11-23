import { z } from "zod";
import type { FlooringProduct, Settings } from "@/types";
import catalogJson from "../../config/flooring-catalog.json";
import settingsJson from "../../config/settings.json";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const positive = z.number().positive();

export const FlooringProductSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    category: z.literal("hardwood"),
    construction: z.enum(["solid", "engineered"]),
    plankWidthIn: positive,
    plankLengthIn: positive.nullable(),
    randomLengths: z.boolean(),
    sqftPerBox: positive,
    pricePerSqft: positive,
    currency: z.literal("CAD"),
    source: z.enum(["Home Depot", "Rona", "placeholder"]),
    sourceUrl: z.url().nullable(),
    lastChecked: z.iso.date().nullable(),
    verified: z.boolean(),
  })
  .strict()
  .refine((p) => p.randomLengths || p.plankLengthIn !== null, {
    message: "plankLengthIn is required unless randomLengths is true",
    path: ["plankLengthIn"],
  })
  .refine((p) => !(p.verified && p.source === "placeholder"), {
    message: 'a product with source "placeholder" cannot be verified',
    path: ["verified"],
  }) satisfies z.ZodType<FlooringProduct>;

export const CatalogSchema = z
  .object({ products: z.array(FlooringProductSchema).min(1) })
  .strict()
  .refine((c) => new Set(c.products.map((p) => p.id)).size === c.products.length, {
    message: "product ids must be unique",
    path: ["products"],
  });

const wasteFactor = z.number().min(0).max(1);

export const SettingsSchema = z
  .object({
    wasteFactors: z
      .object({ straight: wasteFactor, diagonal: wasteFactor, herringbone: wasteFactor })
      .strict(),
    defaultUnits: z.enum(["imperial", "metric"]),
  })
  .strict() satisfies z.ZodType<Settings>;

function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown, file: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new ConfigError(`Invalid ${file}:\n${issues}`);
  }
  return result.data;
}

export function parseCatalog(data: unknown): FlooringProduct[] {
  return parseOrThrow(CatalogSchema, data, "config/flooring-catalog.json").products;
}

export function parseSettings(data: unknown): Settings {
  return parseOrThrow(SettingsSchema, data, "config/settings.json");
}

let cached: { products: FlooringProduct[]; settings: Settings } | null = null;

/** Load and validate both config files. Throws ConfigError on bad config. */
export function loadConfig(): { products: FlooringProduct[]; settings: Settings } {
  if (!cached) {
    cached = { products: parseCatalog(catalogJson), settings: parseSettings(settingsJson) };
  }
  return cached;
}

export const loadCatalog = (): FlooringProduct[] => loadConfig().products;
export const loadSettings = (): Settings => loadConfig().settings;
