import { describe, expect, it } from "vitest";

import {
  ASSET_MAX_BYTES,
  TRACK_MAX_BYTES,
  isAssetMimeAllowed,
  isTrackMimeAllowed,
  isUploadAssetKind,
  photoSlotsForAsset,
  storagePath,
} from "./upload";

describe("wizard upload contract", () => {
  it("nega video/svg e applica i tetti dichiarati dal wizard", () => {
    expect(ASSET_MAX_BYTES).toBe(33_554_432);
    expect(TRACK_MAX_BYTES).toBe(268_435_456);
    expect(isAssetMimeAllowed("image/webp")).toBe(true);
    expect(isAssetMimeAllowed("image/svg+xml")).toBe(false);
    expect(isTrackMimeAllowed("audio/mpeg; charset=binary")).toBe(true);
    expect(isTrackMimeAllowed("video/mp4")).toBe(false);
    expect(isUploadAssetKind("video")).toBe(false);
  });

  it("conta logo a zero slot foto e gli asset visuali a uno", () => {
    expect(photoSlotsForAsset("logo")).toBe(0);
    expect(photoSlotsForAsset("visual")).toBe(1);
    expect(photoSlotsForAsset("photo_hi")).toBe(1);
    expect(photoSlotsForAsset("merch")).toBe(1);
  });

  it("costruisce path tenant-scoped senza usare il nome del file", () => {
    expect(storagePath("site-a", "res-b"))
      .toBe("site-a/res-b/object");
  });
});
