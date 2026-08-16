import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

type Rgb = readonly [number, number, number];

function parseRgb(value: string): Rgb {
  const values = value.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number);
  if (!values || values.length !== 3) throw new Error(`Colore non interpretabile: ${value}`);
  return values as unknown as Rgb;
}

function linear(channel: number) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function contrast(foreground: Rgb, background: Rgb) {
  const luminance = ([red, green, blue]: Rgb) => 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
  const [light = 0, dark = 0] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

test("le quattro palette sono accessibili e semanticamente pulite", async ({ page }) => {
  await page.goto("/");
  const shells = page.locator("[data-palette]");
  await expect(shells).toHaveCount(4);

  for (let index = 0; index < await shells.count(); index += 1) {
    const shell = shells.nth(index);
    const results = await new AxeBuilder({ page }).include(await shell.evaluate((element) => `[data-palette="${element.getAttribute("data-palette")}"]`)).analyze();
    expect(results.violations, `axe palette ${await shell.getAttribute("data-palette")}`).toEqual([]);

    for (const selector of [".dock-center", ".player-shell button"]) {
      const ratio = await shell.locator(selector).evaluate((element) => {
        const style = getComputedStyle(element);
        return { foreground: style.color, background: style.backgroundColor };
      });
      expect(contrast(parseRgb(ratio.foreground), parseRgb(ratio.background)), `${await shell.getAttribute("data-palette")} ${selector}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});

/**
 * La porta d'ingresso è la prima pagina che un artista vede, e finora `/` non era una pagina
 * di prodotto: era il banco del filone A. Questo banco non misura l'estetica — misura che
 * l'ingresso esista, sia raggiungibile da tastiera e non introduca barriere.
 *
 * Nota onesta: a differenza dei banchi unitari di questa PR, per questo non esiste una prova
 * di mutazione, perche' la suite e2e richiede Docker e non e' eseguibile dove e' stato
 * scritto. La CI e' la sua prima esecuzione.
 */
test("la radice ha un ingresso accessibile", async ({ page }) => {
  await page.goto("/");

  const landing = page.locator(".landing");
  await expect(landing).toHaveCount(1);

  const results = await new AxeBuilder({ page }).include(".landing").analyze();
  expect(results.violations, "axe sulla landing").toEqual([]);

  // L'ingresso deve essere raggiungibile da tastiera e portare all'accesso, non solo esistere.
  const cta = landing.locator("a.landing-cta");
  await expect(cta).toHaveAttribute("href", "/login?next=/app/wizard");
  await cta.focus();
  await expect(cta).toBeFocused();
});
