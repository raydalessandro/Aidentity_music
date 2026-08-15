import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

/**
 * La route media contro lo Storage vero.
 *
 * Fino a ieri questi test erano impossibili: il job `e2e` non esportava
 * `SUPABASE_SERVICE_ROLE_KEY`, quindi la route rispondeva 500 «media non
 * configurato» a ogni richiesta — anche a quelle che devono fallire — e un test
 * negativo sarebbe passato per il motivo sbagliato. Ora la chiave c'è (chiave
 * effimera dello stack locale, generata a ogni run) e i dinieghi si possono
 * misurare per quello che sono.
 *
 * ── Perché questa suite scrive nel database, e perché è lecito ─────────────────
 *
 * Servono tre righe che `supabase/seed.sql` non contiene: un asset purgato, una
 * traccia `upload` e i corrispondenti oggetti nello Storage. Non le ho messe nel
 * seed per due motivi. Primo: `supabase/tests/database/public_projections_test.sql`
 * enumera per intero le righe visibili di `public_tracks`, quindi una traccia in
 * più nel seed renderebbe rosso il job Database — un test che dice ancora il vero,
 * su un fixture cambiato sotto di lui. Secondo: un oggetto binario nello Storage
 * non può stare in una migrazione né in un file SQL.
 *
 * Restano quindi qui, create e distrutte dalla suite, dentro uno stack effimero
 * che si spegne con il runner. Nessuna scrittura tocca lo schema.
 */

/**
 * Seriale, contro il `fullyParallel: true` del progetto.
 *
 * `beforeAll` e `afterAll` girano una volta **per worker**: con i test di questo file
 * spalmati su più worker, il teardown di uno cancellerebbe righe e oggetti mentre un altro
 * li sta ancora leggendo. Il fixture qui è stato condiviso e mutabile, quindi il file resta
 * in un worker solo. È anche il motivo per cui il setup è idempotente (`upsert`): un
 * ritentativo non deve trovare macerie.
 */
test.describe.configure({ mode: "serial" });

const SITO_PUBBLICATO = "22222222-2222-2222-2222-222222222222";
const SITO_BOZZA = "55555555-5555-5555-5555-555555555555";
const ASSET_HERO = "33333333-3333-3333-3333-333333333333";
const ASSET_BOZZA = "66666666-6666-6666-6666-666666666666";

/** Righe create da questa suite. Prefisso `e2e` per non collidere con nessun fixture. */
const ASSET_PURGATO = "e2e00001-0000-0000-0000-000000000001";
const TRACCIA_UPLOAD = "e2e00002-0000-0000-0000-000000000002";

const PATH_HERO = "seed/nvll-click-hero.jpg";
const PATH_BOZZA = "seed/owner-b-hero.jpg";
const PATH_PURGATO = "e2e/asset-purgato.jpg";
const PATH_TRACCIA = "e2e/traccia.mp3";

/** JPEG 1×1 valido, 631 byte. Misurato: Chromium lo decodifica, `naturalWidth` = 1. */
const JPEG_1x1 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==";

const BYTES = Buffer.from(JPEG_1x1, "base64");

function servizio(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    // Fallire qui, e dirlo: un test che si auto-salta su una superficie di
    // sicurezza è indistinguibile da un test che non esiste.
    throw new Error(
      "e2e media: servono NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY dallo stack locale.",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

test.beforeAll(async () => {
  const db = servizio();

  // Gli oggetti. Anche quelli che NON devono essere ottenibili esistono davvero:
  // altrimenti un 404 potrebbe essere «file assente» travestito da diniego.
  for (const [bucket, path, tipo] of [
    ["site-assets", PATH_HERO, "image/jpeg"],
    ["site-assets", PATH_BOZZA, "image/jpeg"],
    ["site-assets", PATH_PURGATO, "image/jpeg"],
    ["site-tracks", PATH_TRACCIA, "audio/mpeg"],
  ] as const) {
    const { error } = await db.storage
      .from(bucket)
      .upload(path, BYTES, { contentType: tipo, upsert: true });
    if (error) throw new Error(`upload ${bucket}/${path}: ${error.message}`);
  }

  const asset = await db.from("site_assets").upsert({
    id: ASSET_PURGATO,
    site_id: SITO_PUBBLICATO,
    kind: "photo_hi",
    storage_path: PATH_PURGATO,
    mime_type: "image/jpeg",
    byte_size: BYTES.byteLength,
    sort_order: 9,
    purged_at: new Date().toISOString(),
  });
  if (asset.error) throw new Error(`asset purgato: ${asset.error.message}`);

  const traccia = await db.from("site_tracks").upsert({
    id: TRACCIA_UPLOAD,
    site_id: SITO_PUBBLICATO,
    title: "Traccia e2e",
    source: "upload",
    storage_path: PATH_TRACCIA,
    mime_type: "audio/mpeg",
    byte_size: BYTES.byteLength,
    duration_seconds: 181,
    sort_order: 0,
  });
  if (traccia.error) throw new Error(`traccia upload: ${traccia.error.message}`);
});

test.afterAll(async () => {
  const db = servizio();
  await db.from("site_tracks").delete().eq("id", TRACCIA_UPLOAD);
  await db.from("site_assets").delete().eq("id", ASSET_PURGATO);
  await db.storage.from("site-assets").remove([PATH_HERO, PATH_BOZZA, PATH_PURGATO]);
  await db.storage.from("site-tracks").remove([PATH_TRACCIA]);
});

function urlMedia(kind: "asset" | "track", siteId: string, id: string): string {
  return `/api/media/${kind}/${siteId}/${id}`;
}

// ---------------------------------------------------------------- caso positivo

test("l'asset di un sito pubblicato risponde 302 verso un URL firmato", async ({ request }) => {
  const risposta = await request.get(urlMedia("asset", SITO_PUBBLICATO, ASSET_HERO), {
    maxRedirects: 0,
  });

  expect(risposta.status()).toBe(302);

  const location = risposta.headers()["location"] ?? "";
  expect(location, "il bersaglio deve essere una firma, non un URL pubblico").toContain(
    "/storage/v1/object/sign/site-assets/",
  );
  expect(location).toContain("token=");
  expect(location).not.toContain("/object/public/");

  // Il redirect non si mette in cache: è il punto in cui si verifica la pubblicazione.
  expect(risposta.headers()["cache-control"]).toBe("no-store");
  // Il corpo è vuoto: il path sta nel `Location` e da nessun'altra parte.
  expect(await risposta.body()).toHaveLength(0);
});

test("seguendo il redirect arrivano i byte del file, dallo Storage", async ({ request }) => {
  const risposta = await request.get(urlMedia("asset", SITO_PUBBLICATO, ASSET_HERO));

  expect(risposta.status()).toBe(200);
  expect(risposta.headers()["content-type"]).toContain("image/jpeg");
  expect(Buffer.from(await risposta.body()).equals(BYTES)).toBe(true);
});

/**
 * La ragione per cui Ray ha scelto il redirect: senza `Range`, spostarsi dentro un
 * brano significa riscaricarlo. Qui si misura che lo Storage risponda davvero 206
 * sull'URL firmato che la route consegna.
 */
test("la traccia risponde a una richiesta Range con 206 e un intervallo", async ({ request }) => {
  const redirect = await request.get(urlMedia("track", SITO_PUBBLICATO, TRACCIA_UPLOAD), {
    maxRedirects: 0,
  });
  expect(redirect.status()).toBe(302);

  const firmato = redirect.headers()["location"] ?? "";
  expect(firmato).toContain("/storage/v1/object/sign/site-tracks/");

  const parziale = await request.get(firmato, { headers: { Range: "bytes=0-99" } });

  expect(parziale.status(), "lo Storage deve servire un intervallo, non il file intero").toBe(206);
  expect(parziale.headers()["content-range"]).toBe(`bytes 0-99/${BYTES.byteLength}`);
  expect(await parziale.body()).toHaveLength(100);
});

// ---------------------------------------------------------------- dinieghi

const DINIEGHI = [
  {
    caso: "asset di un sito in bozza",
    url: urlMedia("asset", SITO_BOZZA, ASSET_BOZZA),
  },
  {
    caso: "asset di un altro tenant, chiesto sotto il sito pubblicato",
    url: urlMedia("asset", SITO_PUBBLICATO, ASSET_BOZZA),
  },
  {
    caso: "asset del sito pubblicato, chiesto sotto il sito in bozza",
    url: urlMedia("asset", SITO_BOZZA, ASSET_HERO),
  },
  {
    caso: "riga purgata",
    url: urlMedia("asset", SITO_PUBBLICATO, ASSET_PURGATO),
  },
  {
    caso: "identificativo inesistente",
    url: urlMedia("asset", SITO_PUBBLICATO, "deadbeef-0000-0000-0000-000000000000"),
  },
];

for (const { caso, url } of DINIEGHI) {
  test(`${caso}: 404 «media non disponibile», nessun redirect`, async ({ request }) => {
    const risposta = await request.get(url, { maxRedirects: 0 });

    // Esito atteso dichiarato: codice, corpo esatto, nessun `Location`.
    expect(risposta.status()).toBe(404);
    expect(await risposta.json()).toEqual({ error: "media non disponibile" });
    expect(risposta.headers()["location"]).toBeUndefined();
    expect(JSON.stringify(risposta.headers())).not.toContain("object/sign");
  });
}

test("gli oggetti negati esistono davvero nello Storage: il 404 non è «file assente»", async () => {
  const db = servizio();

  for (const [bucket, path] of [
    ["site-assets", PATH_BOZZA],
    ["site-assets", PATH_PURGATO],
  ] as const) {
    // Con `service_role` l'oggetto si raggiunge: il file c'è. È la route a negarlo.
    const { data, error } = await db.storage.from(bucket).createSignedUrl(path, 60);
    expect(error, `${bucket}/${path}`).toBeNull();
    expect(data?.signedUrl).toContain("token=");
  }
});

test("i dinieghi sono indistinguibili fra loro, header compresi", async ({ request }) => {
  const risposte = [];
  for (const { url } of DINIEGHI) {
    const risposta = await request.get(url, { maxRedirects: 0 });
    risposte.push({
      status: risposta.status(),
      body: await risposta.text(),
      contentType: risposta.headers()["content-type"],
      cacheControl: risposta.headers()["cache-control"],
    });
  }

  const primo = JSON.stringify(risposte[0]);
  for (const [indice, risposta] of risposte.entries()) {
    expect(JSON.stringify(risposta), DINIEGHI[indice]?.caso).toBe(primo);
  }
});

test("nessuna risposta espone il path fuori dal Location del caso concesso", async ({ request }) => {
  for (const { url } of DINIEGHI) {
    const risposta = await request.get(url, { maxRedirects: 0 });
    const tutto = `${await risposta.text()} ${JSON.stringify(risposta.headers())}`;
    expect(tutto).not.toContain(PATH_HERO);
    expect(tutto).not.toContain(PATH_BOZZA);
    expect(tutto).not.toContain(PATH_PURGATO);
  }

  // E nel caso concesso il path sta nel `Location` e in nessun altro header.
  const concesso = await request.get(urlMedia("asset", SITO_PUBBLICATO, ASSET_HERO), {
    maxRedirects: 0,
  });
  const headers = concesso.headers();
  for (const [nome, valore] of Object.entries(headers)) {
    if (nome === "location") continue;
    expect(valore, nome).not.toContain(PATH_HERO);
  }
  expect(await concesso.text()).toBe("");
});

test("un identificativo malformato è 400, e non rivela nulla su cosa esiste", async ({
  request,
}) => {
  const risposta = await request.get(urlMedia("asset", SITO_PUBBLICATO, "non-un-guid"), {
    maxRedirects: 0,
  });

  expect(risposta.status()).toBe(400);
  expect(await risposta.json()).toEqual({ error: "richiesta non valida" });
});

// ---------------------------------------------------------------- le superfici

test("HOME mostra il visual principale, e l'immagine carica davvero", async ({ page }) => {
  await page.goto("/nvll-click");

  const hero = page.locator("img.hero-image");
  await expect(hero).toHaveCount(1);
  await expect(hero).toHaveAttribute("src", urlMedia("asset", SITO_PUBBLICATO, ASSET_HERO));

  // `naturalWidth > 0` è la differenza fra «c'è un tag» e «c'è un'immagine».
  const larghezza = await hero.evaluate(async (element) => {
    const img = element as HTMLImageElement;
    await img.decode().catch(() => undefined);
    return img.naturalWidth;
  });
  expect(larghezza, "immagine non decodificata: il redirect non ha consegnato i byte").toBeGreaterThan(0);

  // L'HTML pubblico non porta né il path né una firma: porta l'URL della route.
  const html = await page.content();
  expect(html).not.toContain(PATH_HERO);
  expect(html).not.toContain("object/sign");
});

test("LISTEN riproduce l'upload: un solo elemento audio, sorgente sulla route media", async ({
  page,
}) => {
  await page.goto("/nvll-click/listen");

  const audio = page.locator("audio");
  // Invariante del filone D: uno solo in tutta l'applicazione.
  await expect(audio).toHaveCount(1);

  const bottone = page.getByRole("button", { name: /Riproduci Traccia e2e/ });
  await expect(bottone).toHaveCount(1);
  await bottone.click();

  await expect(audio).toHaveAttribute(
    "src",
    urlMedia("track", SITO_PUBBLICATO, TRACCIA_UPLOAD),
  );
});
