import { z } from "zod";

export const planCodeSchema = z.enum(["base", "pro", "max"]);
export const billingStatusSchema = z.enum([
  "not_started",
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
]);
export const publicationStatusSchema = z.enum([
  "draft",
  "pending_review",
  "published",
  "suspended",
]);
export const surfaceIdSchema = z.enum(["feed", "listen", "epk", "merch", "home"]);

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const themeSchema = z
  .object({
    ink: hexColor,
    panel: hexColor,
    paper: hexColor,
    muted: hexColor,
    dim: hexColor,
    line: hexColor,
    acid: hexColor,
  })
  .strict();

const identityDraftSchema = z
  .object({
    name: z.string().nullable(),
    handle: z.string().nullable(),
    claim: z.string().nullable(),
    shortBio: z.string().nullable(),
    longBio: z.string().nullable(),
    location: z.string().nullable(),
    locale: z.literal("it-IT"),
  })
  .strict();

const surfaceSchema = z
  .object({ id: surfaceIdSchema, enabled: z.boolean() })
  .strict();

const siteConfigBaseSchema = z
  .object({
    version: z.literal(1),
    identity: identityDraftSchema,
    theme: themeSchema,
    fontPair: z.enum(["grotesk-mono", "serif-sans", "display-grotesk"]),
    iconFamily: z.enum(["line", "block", "stencil"]),
    grain: z.boolean(),
    surfaces: z.tuple([surfaceSchema, surfaceSchema, surfaceSchema, surfaceSchema, surfaceSchema]),
    sectionCopy: z
      .object({
        version: z.literal(1),
        home: z.string().optional(),
        feed: z.string().optional(),
        listen: z.string().optional(),
        epk: z.string().optional(),
        merch: z.string().optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine(({ surfaces }, context) => {
    const expected: z.infer<typeof surfaceIdSchema>[] = ["feed", "listen", "epk", "merch", "home"];
    if (surfaces.some((surface, index) => surface.id !== expected[index])) {
      context.addIssue({ code: "custom", message: "Le superfici devono rispettare l'ordine canonico." });
    }
    if (!surfaces[2].enabled || !surfaces[4].enabled) {
      context.addIssue({ code: "custom", message: "EPK e HOME devono restare abilitate." });
    }
  });

export const siteConfigDraftSchema = siteConfigBaseSchema;
export const siteConfigSchema = siteConfigBaseSchema.superRefine(({ identity }, context) => {
  for (const key of ["name", "handle", "claim", "shortBio", "longBio", "location"] as const) {
    if (!identity[key]?.trim()) {
      context.addIssue({ code: "custom", path: ["identity", key], message: "Campo obbligatorio per la pubblicazione." });
    }
  }
});

export const trackSchema = z.discriminatedUnion("source", [
  z
    .object({
      source: z.literal("upload"),
      title: z.string().trim().min(1),
      storagePath: z.string().trim().min(1),
      mimeType: z.string().regex(/^audio\//),
      byteSize: z.number().int().positive(),
      durationSeconds: z.number().int().positive().nullable(),
    })
    .strict(),
  z
    .object({
      source: z.literal("embed"),
      title: z.string().trim().min(1),
      provider: z.enum(["spotify", "apple_music", "youtube", "soundcloud"]),
      url: z.string().url().startsWith("https://"),
    })
    .strict(),
]);

export const validBillingForPublication = (status: z.infer<typeof billingStatusSchema>) =>
  status === "active" || status === "trialing";

export type SiteConfigDraft = z.infer<typeof siteConfigDraftSchema>;
export type SiteConfig = z.infer<typeof siteConfigSchema>;
export type Track = z.infer<typeof trackSchema>;
