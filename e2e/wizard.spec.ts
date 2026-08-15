import { expect, test } from "@playwright/test";

/**
 * Smoke test senza login. Verifica solo il confine C: il builder vive sotto il
 * prefisso `app`, già riservato dal contratto, e dichiara al login dove vorrebbe
 * tornare. Il passaggio effettivo del `next` dentro il magic link appartiene a B.
 */
test("/app/wizard richiede autenticazione e dichiara il ritorno", async ({ page }) => {
  await page.goto("/app/wizard");
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fwizard/);
});
