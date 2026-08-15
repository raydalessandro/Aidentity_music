import type { SiteConfigDraft } from "../contract";

export type WizardSite = {
  id: string;
  slug: string;
  publication_status: "draft" | "pending_review" | "published" | "suspended";
};

export type WizardAsset = {
  id: string;
  kind: "logo" | "visual" | "photo_hi" | "merch" | "video";
  mime_type: string;
  byte_size: number;
  sort_order: number;
};

export type WizardTrack = {
  id: string;
  title: string;
  source: "upload" | "embed";
  duration_seconds: number | null;
  embed_provider: "spotify" | "apple_music" | "youtube" | "soundcloud" | null;
  embed_url: string | null;
  sort_order: number;
};

export type WizardPost = {
  id: string;
  kind: "visual" | "track";
  visual_asset_id: string | null;
  track_id: string | null;
  cover_asset_id: string | null;
  caption: string | null;
  sort_order: number;
};

export type WizardLink = {
  id: string;
  provider: "spotify" | "apple_music" | "youtube" | "soundcloud" | "instagram" | "tiktok";
  url: string;
  sort_order: number;
};

export type WizardPress = {
  id: string;
  publication: string;
  quote: string;
  published_on: string | null;
  url: string | null;
  sort_order: number;
};

export type WizardDate = {
  id: string;
  starts_at: string;
  city: string;
  venue: string;
  ticket_url: string | null;
  sort_order: number;
};

export type WizardMetric = {
  id: string;
  label: string;
  value: string;
  sort_order: number;
};

export type WizardContact = {
  id: string;
  role: "booking" | "management" | "press";
  name: string;
  email: string;
  consent_confirmed_at: string | null;
  sort_order: number;
};

export type WizardPreviewLink = {
  id: string;
  expires_at: string;
  revoked_at: string | null;
};

export type WizardInitialData = {
  site: WizardSite | null;
  config: SiteConfigDraft | null;
  heroAssetId: string | null;
  assets: WizardAsset[];
  tracks: WizardTrack[];
  posts: WizardPost[];
  links: WizardLink[];
  press: WizardPress[];
  dates: WizardDate[];
  metrics: WizardMetric[];
  contacts: WizardContact[];
  previewLinks: WizardPreviewLink[];
};
