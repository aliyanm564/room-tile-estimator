import { z } from "zod";
import type { FlooringProduct, Settings } from "@/types";
import catalogJson from "../../config/flooring-catalog.json";
import settingsJson from "../../config/settings.json";
import brandingJson from "../../config/branding.json";

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

/** Per-client branding (config/branding.json). Rebrand by editing that file; no code changes. */
export const BrandingSchema = z
  .object({
    appName: z.string().trim().min(1).max(60),
    tagline: z.string().max(120).optional(),
    /** Hex colour for buttons and accents, e.g. "#1d4ed8". Text on it is black or white automatically. */
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a hex colour like "#1d4ed8"'),
    /** Path to an image in public/, e.g. "/logo.svg", or null for no logo. */
    logoPath: z
      .string()
      .regex(/^\/[\w./-]+\.(svg|png|jpe?g|webp)$/i, 'must be a path in public/ like "/logo.svg"')
      .nullable(),
  })
  .strict();

export type Branding = z.infer<typeof BrandingSchema>;

/** Black or white text, whichever reads better on the brand colour (WCAG relative luminance). */
export function brandTextColor(hex: string): "#000000" | "#ffffff" {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.179 ? "#000000" : "#ffffff";
}

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

export function parseBranding(data: unknown): Branding {
  return parseOrThrow(BrandingSchema, data, "config/branding.json");
}

let cached: { products: FlooringProduct[]; settings: Settings; branding: Branding } | null = null;

/** Load and validate the config files. Throws ConfigError on bad config. */
export function loadConfig(): { products: FlooringProduct[]; settings: Settings; branding: Branding } {
  if (!cached) {
    cached = { products: parseCatalog(catalogJson), settings: parseSettings(settingsJson), branding: parseBranding(brandingJson) };
  }
  return cached;
}

export const loadCatalog = (): FlooringProduct[] => loadConfig().products;
export const loadSettings = (): Settings => loadConfig().settings;
