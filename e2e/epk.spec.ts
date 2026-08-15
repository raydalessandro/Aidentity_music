import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { shellPalettes } from "../components/site-shell/palettes";

/**
 * Prova dell'EPK sulle quattro palette, montato in `app/diagnostica/epk`.
 *
 * Sul contrasto: qui **non** si riusa la `parseRgb` di `e2e/shell.spec.ts`.
 * Quella scarta il canale alfa, quindi legge `rgba(0, 0, 0, 0)` — trasparente —
 * come nero pieno, e restituisce un rapporto inventato (debito già registrato
 * in `TODO.md`). La funzione qui sotto risolve lo sfondo effettivo componendo
 * gli strati traslucidi risalendo gli antenati, e compone anche il testo se ha
 * alfa < 1. Non tocca quel file: ne evita l'errore.
 */

type Rgb = readonly [number, number, number];
type Colore = { rgb: Rgb; alpha: number };

function leggiColore(value: string): Colore {
  const numeri = value.match(/[\d.]+/g)?.map(Number) ?? [];
  const [rosso = 0, verde = 0, blu = 0, alfa] = numeri;
  return { rgb: [rosso, verde, blu], alpha: numeri.length >= 4 ? (alfa ?? 1) : 1 };
}

/** Composizione "source over": il colore con alfa sopra uno sfondo opaco. */
function componi(sopra: Colore, sotto: Rgb): Rgb {
  return [0, 1, 2].map((canale) => {
    const alto = sopra.rgb[canale] ?? 0;
    const basso = sotto[canale] ?? 0;
    return alto * sopra.alpha + basso * (1 - sopra.alpha);
  }) as unknown as Rgb;
}

/** `strati` arriva dal nodo verso la radice; si compone dalla radice in giù. */
function sfondoEffettivo(strati: readonly string[]): Rgb {
  let risultato: Rgb = [255, 255, 255];
  for (const strato of [...strati].reverse()) {
    risultato = componi(leggiColore(strato), risultato);
  }
  return risultato;
}

function luminanza([rosso, verde, blu]: Rgb): number {
  const lineare = (canale: number) => {
    const valore = canale / 255;
    return valore <= 0.04045 ? valore / 12.92 : ((valore + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lineare(rosso) + 0.7152 * lineare(verde) + 0.0722 * lineare(blu);
}

function contrasto(testo: Rgb, sfondo: Rgb): number {
  const [chiaro = 0, scuro = 0] = [luminanza(testo), luminanza(sfondo)].sort((a, b) => b - a);
  return (chiaro + 0.05) / (scuro + 0.05);
}

/**
 * Nessun `baseURL` locale: si usa quello di progetto, `http://127.0.0.1:3000`.
 *
 * È voluto. I test di idratazione qui sotto sono la prova di regressione di
 * `allowedDevOrigins` in `next.config.ts`: senza quella voce il dev server
 * risponde 403 ai chunk client, nessun componente `"use client"` si idrata e
 * questi test diventano rossi. Un override locale li farebbe passare comunque
 * e lascerebbe la trappola armata per chi arriva dopo — il fallimento, senza,
 * è silenzioso: HTML completo, nessun errore in pagina, niente in console.
 */
const PAGINA = "/diagnostica/epk";

test("axe è pulito su tutte e quattro le palette e sulla pagina intera", async ({ page }) => {
  await page.goto(PAGINA);

  for (const palette of shellPalettes) {
    const blocco = page.locator(`[data-epk-palette="${palette.id}"]`);
    await expect(blocco).toHaveCount(1);
    const esito = await new AxeBuilder({ page })
      .include(`[data-epk-palette="${palette.id}"]`)
      .analyze();
    expect(esito.violations, `axe palette ${palette.id}`).toEqual([]);
  }

  // Anche la pagina intera: id duplicati e landmark non unici si vedono solo qui.
  const intera = await new AxeBuilder({ page }).analyze();
  expect(intera.violations, "axe pagina intera").toEqual([]);
});

test("il contatto senza consenso non esiste nel DOM di nessuna palette", async ({ page }) => {
  await page.goto(PAGINA);

  // Esito atteso dichiarato: queste due stringhe esatte non devono comparire.
  await expect(page.getByText("nonconsentito@nvllclick.example")).toHaveCount(0);
  await expect(page.getByText("Luca Ferrante")).toHaveCount(0);
  await expect(page.locator('a[href*="nonconsentito"]')).toHaveCount(0);

  const html = await page.content();
  expect(html).not.toContain("nonconsentito@nvllclick.example");
  expect(html).not.toContain("Luca Ferrante");

  // Contrappeso: i contatti con consenso ci sono, uno per ciascuna palette.
  await expect(page.locator('a[href="mailto:booking@nvllclick.example"]')).toHaveCount(
    shellPalettes.length,
  );
});

test("provider fuori set e URL non https non arrivano nel DOM", async ({ page }) => {
  await page.goto(PAGINA);
  const html = await page.content();

  expect(html, "provider fuori dall'insieme chiuso di L0.7 §5").not.toContain("bandcamp");
  expect(html, "link con URL non https").not.toContain("http://www.youtube.com/@nvllclick");
  expect(html, "URL della quote stampa non https").not.toContain("http://blowup.example");
  expect(html, "schema pericoloso").not.toContain("javascript:alert");
  await expect(page.locator('a[href="https://www.tiktok.com/@nvllclick"]')).toHaveCount(
    shellPalettes.length,
  );
});

/**
 * L'invariante del bottone ha due metà e vanno misurate entrambe.
 *
 * Averne verificata una sola — “0 bottoni nell'HTML servito” — è ciò che ha
 * lasciato passare un EPK in cui la copia era semplicemente sparita: quella
 * misura dice cosa succede *prima* dell'idratazione e tace su *dopo*.
 */
test("dopo l'idratazione i bottoni di copia esistono, due per EPK su quattro palette", async ({
  page,
}) => {
  await page.goto(PAGINA);
  await expect(page.locator("#epk-nocturne").getByRole("button")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /^Copia la bio/ })).toHaveCount(
    shellPalettes.length * 2,
  );
});

test.describe("senza JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("la bio resta leggibile e non si mostra nessun comando inerte", async ({ page }) => {
    await page.goto(PAGINA);
    await expect(page.locator('#epk-nocturne [data-epk-bio="short"]')).toBeVisible();
    // Un bottone che non risponde e non annuncia niente è peggio di nessun bottone.
    await expect(page.locator("button")).toHaveCount(0);
    // La regione c'è comunque: è il contenitore dell'annuncio, non l'annuncio.
    await expect(page.locator('#epk-nocturne [role="status"]')).toHaveCount(1);
    await expect(page.locator('#epk-nocturne a[href^="mailto:"]')).toHaveCount(2);
  });
});

test("la copia della bio annuncia l'esito riuscito agli screen reader", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(PAGINA);

  const epk = page.locator("#epk-nocturne");
  const stato = epk.locator('[role="status"]');
  const bottone = epk.getByRole("button", { name: "Copia la bio breve" });

  // Il bottone è reso dopo il mount: la sua comparsa è la prova che il
  // componente è idratato. Cliccare prima significherebbe cliccare un disegno.
  await expect(bottone).toBeVisible();

  // Prima del click la regione esiste ed è vuota: l'annuncio non è precotto.
  await expect(stato).toHaveAttribute("aria-live", "polite");
  await expect(stato).toHaveText("");

  await bottone.click();
  await expect(stato).toHaveText("Bio breve copiata negli appunti.");

  // La bio lunga usa la stessa regione e la riscrive.
  await epk.getByRole("button", { name: "Copia la bio lunga" }).click();
  await expect(stato).toHaveText("Bio lunga copiata negli appunti.");
});

test("negli appunti finisce il testo reso, non una seconda copia della stringa", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(PAGINA);

  const epk = page.locator("#epk-nocturne");
  const reso = (await epk.locator('[data-epk-bio="short"]').textContent()) ?? "";
  expect(reso.trim().length).toBeGreaterThan(0);

  const bottone = epk.getByRole("button", { name: "Copia la bio breve" });
  await expect(bottone).toBeVisible();
  await bottone.click();
  await expect(epk.locator('[role="status"]')).toHaveText("Bio breve copiata negli appunti.");

  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(reso);
});

test("anche la copia fallita viene annunciata, con l'azione da fare a mano", async ({ page }) => {
  // Si nega tutto: la Clipboard API rifiuta e la ricaduta storica fallisce.
  // È la condizione in cui, prima, l'utente riceveva silenzio.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("permesso negato")) },
    });
    document.execCommand = () => false;
  });
  await page.goto(PAGINA);

  const epk = page.locator("#epk-nocturne");
  const stato = epk.locator('[role="status"]');
  const bottone = epk.getByRole("button", { name: "Copia la bio breve" });

  await expect(bottone).toBeVisible();
  await expect(stato).toHaveText("");
  await bottone.click();

  await expect(stato).toHaveText(
    "Copia non riuscita: seleziona il testo della bio breve e copialo a mano.",
  );
});

test("l'azione principale resta leggibile su tutte e quattro le palette", async ({ page }) => {
  await page.goto(PAGINA);

  for (const palette of shellPalettes) {
    for (const selettore of ['a[href^="mailto:"]', '[data-epk-bio="short"]', "h2", "dt", "button"]) {
      const misura = await page
        .locator(`[data-epk-palette="${palette.id}"] ${selettore}`)
        .first()
        .evaluate((elemento) => {
          const strati: string[] = [];
          let nodo: Element | null = elemento;
          while (nodo !== null) {
            strati.push(getComputedStyle(nodo).backgroundColor);
            nodo = nodo.parentElement;
          }
          return { testo: getComputedStyle(elemento).color, strati };
        });

      const sfondo = sfondoEffettivo(misura.strati);
      const testo = componi(leggiColore(misura.testo), sfondo);
      expect(contrasto(testo, sfondo), `${palette.id} ${selettore}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});
