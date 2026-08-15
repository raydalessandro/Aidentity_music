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
