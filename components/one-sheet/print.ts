/**
 * Chromium embeds source JPEGs almost verbatim in print PDFs. Press photos can therefore
 * turn a one-page document into a multi-megabyte file even when each image occupies only a
 * few centimetres on A4. The web preview keeps the original pixels; immediately before
 * printing we replace only the one-sheet photos with 300 dpi JPEGs cropped exactly like
 * `object-fit: cover`, then restore the originals after printing.
 *
 * This is deliberately a static script. It contains no site data and requires no client
 * bundle or second PDF template, so the HTML route remains the single visual source of truth.
 */
export const ONE_SHEET_PRINT_DPI = 300;
export const ONE_SHEET_PRINT_JPEG_QUALITY = 0.9;
export const ONE_SHEET_PRINT_SELECTOR = "img[data-one-sheet-photo]";

export const ONE_SHEET_PRINT_OPTIMIZER_SCRIPT = `(() => {
  const DPI = ${ONE_SHEET_PRINT_DPI};
  const JPEG_QUALITY = ${ONE_SHEET_PRINT_JPEG_QUALITY};
  const SELECTOR = ${JSON.stringify(ONE_SHEET_PRINT_SELECTOR)};
  const originals = new Map();

  const optimize = () => {
    document.querySelectorAll(SELECTOR).forEach((img) => {
      if (!img.complete || !img.naturalWidth || !img.naturalHeight || originals.has(img)) return;

      const rect = img.getBoundingClientRect();
      const printScale = DPI / 96;
      const targetWidth = Math.max(1, Math.min(img.naturalWidth, Math.ceil(rect.width * printScale)));
      const targetHeight = Math.max(1, Math.min(img.naturalHeight, Math.ceil(rect.height * printScale)));
      if (targetWidth >= img.naturalWidth && targetHeight >= img.naturalHeight) return;

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext("2d");
      if (!context) return;

      const sourceRatio = img.naturalWidth / img.naturalHeight;
      const targetRatio = targetWidth / targetHeight;
      let sourceX = 0;
      let sourceY = 0;
      let sourceWidth = img.naturalWidth;
      let sourceHeight = img.naturalHeight;

      if (sourceRatio > targetRatio) {
        sourceWidth = img.naturalHeight * targetRatio;
        sourceX = (img.naturalWidth - sourceWidth) / 2;
      } else if (sourceRatio < targetRatio) {
        sourceHeight = img.naturalWidth / targetRatio;
        sourceY = (img.naturalHeight - sourceHeight) / 2;
      }

      const sheet = img.closest("[data-one-sheet]");
      context.fillStyle = sheet ? getComputedStyle(sheet).backgroundColor : "#ffffff";
      context.fillRect(0, 0, targetWidth, targetHeight);
      context.drawImage(
        img,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        targetWidth,
        targetHeight,
      );

      originals.set(img, img.src);
      img.src = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    });
  };

  const restore = () => {
    originals.forEach((src, img) => {
      img.src = src;
    });
    originals.clear();
  };

  addEventListener("beforeprint", optimize);
  addEventListener("afterprint", restore);
})();`;
