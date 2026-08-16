"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { shellPalettes } from "@/components/site-shell/palettes";
import { SiteTemplateHome } from "@/components/site-templates/SiteTemplate";
import { siteConfigDraftSchema, siteConfigSchema, type SiteConfigDraft } from "@/lib/contract";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { createEmbedTrack, uploadAsset, uploadTrack, type AssetKind, type EmbedProvider } from "@/lib/wizard/media-client";
import { paletteForDraft, themeFromPalette } from "@/lib/wizard/palette";
import type {
  WizardContact,
  WizardDate,
  WizardInitialData,
  WizardLink,
  WizardMetric,
  WizardPost,
  WizardPress,
  WizardPreviewLink,
} from "@/lib/wizard/types";

import liveStyles from "./live-builder.module.css";
import styles from "./wizard.module.css";

type Step = "identity" | "theme" | "content" | "epk";
type SaveState = "idle" | "saving" | "saved" | "error";

const steps: readonly { id: Step; label: string; help: string }[] = [
  { id: "identity", label: "1 · Identità", help: "nome, indirizzo, claim e bio" },
  { id: "theme", label: "2 · Tema", help: "palette, token, font, icone e superfici" },
  { id: "content", label: "3 · Contenuti", help: "hero, feed e tracce" },
  { id: "epk", label: "4 · EPK", help: "contatti, link, press, live e numeri" },
];

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "operazione non riuscita";
}

function nullIfBlank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function nextSort<T extends { sort_order: number }>(rows: T[]): number {
  return rows.reduce((max, row) => Math.max(max, row.sort_order), -1) + 1;
}

export default function WizardClient({ initial, userId }: { initial: WizardInitialData; userId: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [site, setSite] = useState(initial.site);
  const [config, setConfig] = useState<SiteConfigDraft | null>(initial.config);
  const [heroAssetId, setHeroAssetId] = useState(initial.heroAssetId);
  const assets = initial.assets;
  const tracks = initial.tracks;
  const [posts, setPosts] = useState(initial.posts);
  const [links, setLinks] = useState(initial.links);
  const [press, setPress] = useState(initial.press);
  const [dates, setDates] = useState(initial.dates);
  const [metrics, setMetrics] = useState(initial.metrics);
  const [contacts, setContacts] = useState(initial.contacts);
  const [previewLinks, setPreviewLinks] = useState(initial.previewLinks);
  const [step, setStep] = useState<Step>("identity");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const firstConfig = useRef(true);
  const saveQueue = useRef<Promise<boolean>>(Promise.resolve(true));
  const saveRevision = useRef(0);

  useEffect(() => {
    if (site || initial.site) return;
    let cancelled = false;
    void (async () => {
      const response = await fetch("/api/wizard/bootstrap", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { site?: typeof site; error?: string } | null;
      if (cancelled) return;
      if (!response.ok || !payload?.site) {
        setError(payload?.error ?? "impossibile inizializzare il draft");
        return;
      }
      setSite(payload.site);
      // Il trigger PR-0 crea config, usage e subscription. Ricarichiamo quella
      // fonte canonica invece di duplicare il bootstrap nel client.
      window.location.reload();
    })();
    return () => { cancelled = true; };
  }, [initial.site, site]);

  const queueConfigSave = useCallback((snapshot: SiteConfigDraft): Promise<boolean> => {
    if (!site) return Promise.resolve(false);
    const parsed = siteConfigDraftSchema.safeParse(snapshot);
    if (!parsed.success) {
      setSaveState("error");
      return Promise.resolve(false);
    }

    const revision = ++saveRevision.current;
    setSaveState("saving");
    const run = saveQueue.current
      .catch(() => false)
      .then(async () => {
        const { data, error: saveError } = await supabase
          .from("site_config")
          .update({ config: parsed.data })
          .eq("site_id", site.id)
          .select("site_id")
          .maybeSingle();
        const ok = !saveError && data !== null;
        if (revision === saveRevision.current) setSaveState(ok ? "saved" : "error");
        return ok;
      })
      .catch(() => {
        if (revision === saveRevision.current) setSaveState("error");
        return false;
      });
    saveQueue.current = run;
    return run;
  }, [site, supabase]);

  useEffect(() => {
    if (!site || !config) return;
    if (firstConfig.current) {
      firstConfig.current = false;
      return;
    }
    const timer = window.setTimeout(() => { void queueConfigSave(config); }, 650);
    return () => window.clearTimeout(timer);
  }, [config, queueConfigSave, site]);

  const completeConfig = config ? siteConfigSchema.safeParse(config).success : false;
  const publishableDraft = completeConfig && Boolean(heroAssetId);
  const liveHeroSrc = heroAssetId ? `/api/wizard/preview-asset/${heroAssetId}` : null;

  function patchIdentity(key: keyof SiteConfigDraft["identity"], value: string) {
    if (!config || key === "locale") return;
    setConfig({ ...config, identity: { ...config.identity, [key]: nullIfBlank(value) } });
  }



  function patchSectionCopy(key: "home" | "feed" | "listen" | "epk" | "merch", value: string) {
    if (!config) return;
    const next = { ...config.sectionCopy };
    const clean = value.trim();
    if (clean) next[key] = value;
    else delete next[key];
    setConfig({ ...config, sectionCopy: next });
  }

  function toggleSurface(index: number) {
    if (!config || index === 2 || index === 4) return;
    const surfaces = config.surfaces.map((surface, current) =>
      current === index ? { ...surface, enabled: !surface.enabled } : surface,
    ) as SiteConfigDraft["surfaces"];
    setConfig({ ...config, surfaces });
  }

  async function updateSlug(value: string) {
    if (!site) return;
    setError(null);
    const response = await fetch("/api/wizard/slug", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ siteId: site.id, slug: value }),
    });
    const payload = (await response.json().catch(() => null)) as { slug?: string; error?: string } | null;
    if (!response.ok || !payload?.slug) return setError(payload?.error ?? "indirizzo non aggiornato");
    setSite({ ...site, slug: payload.slug });
  }

  async function setHero(id: string | null) {
    if (!site) return;
    const { data, error: dbError } = await supabase
      .from("site_config")
      .update({ hero_asset_id: id })
      .eq("site_id", site.id)
      .select("site_id")
      .maybeSingle();
    if (dbError || !data) setError(dbError?.message ?? "hero non aggiornato");
    else setHeroAssetId(id);
  }

  async function addMediaAsset(form: HTMLFormElement) {
    if (!site) return;
    const data = new FormData(form);
    const file = data.get("file");
    const kind = data.get("kind") as AssetKind;
    if (!(file instanceof File) || file.size === 0) return setError("scegli un file");
    setError(null);
    try {
      await uploadAsset({ siteId: site.id, kind, file });
      window.location.reload();
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function addTrack(form: HTMLFormElement) {
    if (!site) return;
    const data = new FormData(form);
    const mode = String(data.get("mode") ?? "embed");
    const title = String(data.get("title") ?? "").trim();
    if (!title) return setError("titolo traccia obbligatorio");
    setError(null);
    try {
      if (mode === "embed") {
        await createEmbedTrack({
          siteId: site.id,
          title,
          provider: String(data.get("provider")) as EmbedProvider,
          url: String(data.get("url") ?? "").trim(),
        });
      } else {
        const file = data.get("file");
        if (!(file instanceof File) || file.size === 0) return setError("scegli il file audio");
        await uploadTrack({ siteId: site.id, title, file });
      }
      window.location.reload();
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  async function insertRow<T>(
    table: string,
    row: Record<string, unknown>,
    select: string,
    setter: React.Dispatch<React.SetStateAction<T[]>>,
  ): Promise<boolean> {
    setError(null);
    const { data, error: dbError } = await supabase.from(table).insert(row).select(select).single();
    if (dbError || !data) {
      setError(dbError?.message ?? "inserimento non riuscito");
      return false;
    }
    setter((current) => [...current, data as T]);
    return true;
  }

  async function deleteRow<T extends { id: string }>(
    table: string,
    id: string,
    setter: React.Dispatch<React.SetStateAction<T[]>>,
  ) {
    const { error: dbError } = await supabase.from(table).delete().eq("id", id);
    if (dbError) return setError(dbError.message);
    setter((current) => current.filter((row) => row.id !== id));
  }

  async function openOwnerPreview() {
    if (!site || !config) return;
    const saved = await queueConfigSave(config);
    if (!saved) return setError("salva la configurazione prima della preview");
    window.open(`/app/wizard/preview/${site.id}`, "_blank", "noopener,noreferrer");
  }

  async function createPreviewLink() {
    if (!site || !config) return;
    const saved = await queueConfigSave(config);
    if (!saved) return setError("salva la configurazione prima di creare il link");

    const response = await fetch("/api/wizard/preview-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ siteId: site.id, hours: 24 }),
    });
    const payload = (await response.json().catch(() => null)) as {
      id?: string; expiresAt?: string; url?: string; error?: string;
    } | null;
    if (!response.ok || !payload?.id || !payload.url || !payload.expiresAt) {
      return setError(payload?.error ?? "link non creato");
    }
    setPreviewLinks((current) => [{ id: payload.id!, expires_at: payload.expiresAt!, revoked_at: null }, ...current]);
    setShareUrl(`${window.location.origin}${payload.url}`);
  }

  async function revokePreviewLink(link: WizardPreviewLink) {
    const response = await fetch("/api/wizard/preview-link", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ linkId: link.id }),
    });
    if (!response.ok) return setError("revoca non riuscita");
    setPreviewLinks((current) => current.map((item) =>
      item.id === link.id ? { ...item, revoked_at: new Date().toISOString() } : item,
    ));
  }

  if (!site || !config) {
    return (
      <section className={styles.panel}>
        <p className={styles.status}>Preparazione del primo draft…</p>
        {error && <p className={styles.error}>{error}</p>}
      </section>
    );
  }

  return (
    <div className={liveStyles.builder} data-live-builder>
      {/*
        La barra vive FUORI dal foglio e porta il solo dato che non si puo'
        perdere di vista mentre si scrive: se il salvataggio automatico e'
        andato a buon fine. Su telefono l'intestazione del pannello e' nascosta,
        quindi questa e' l'unica riga che lo dice.
      */}
      <header className={liveStyles.bar}>
        <span className={liveStyles.barCopy}>
          <strong>{steps.find((item) => item.id === step)?.label ?? "Modifica"}</strong>
          <small data-save-state={saveState}>
            {saveState === "saving"
              ? "salvataggio…"
              : saveState === "saved"
                ? "salvato"
                : saveState === "error"
                  ? "errore salvataggio"
                  : `/${site.slug}`}
          </small>
        </span>
      </header>

      {/*
        Il sito NON si guarda qui dentro. Si guarda con «Apri pagina completa»,
        che lo apre a schermo pieno in una pagina sua: senza barre sopra, senza
        controlli accanto, esattamente come lo vedra' chi riceve il link — e si
        torna a lavorare chiudendo la scheda.

        Quello che resta qui e' uno sfondo: la home vera, costruita dalla config
        in memoria, dove si vede cambiare il nome, i colori, i caratteri e
        comparire la hero. Non e' interattiva e non deve esserlo. Il foglio dei
        controlli viene DOPO, nel flusso normale della pagina: non gli sta sopra,
        quindi non puo' tagliare a meta' la hero come faceva il primo modello.
      */}
      <section className={liveStyles.stage} data-builder-stage>
        <div className={liveStyles.viewport} data-builder-preview aria-label="Anteprima live del sito">
          <SiteTemplateHome
            config={config}
            palette={paletteForDraft(config)}
            previewId={`builder-${site.id}`}
            heroSrc={liveHeroSrc}
            embedded
            interactive={false}
          />
        </div>
      </section>

      <section className={liveStyles.sheet} data-builder-sheet>
        <div className={liveStyles.body}>
          <header className={styles.head}>
            <div>
              <p className={styles.eyebrow}>AIDENTITY / BUILDER</p>
              <h1 className={styles.title}>Costruisci il tuo sito.</h1>
              <p className={styles.muted}>Draft: /{site.slug}</p>
            </div>
            <div>
              <p className={styles.status}>autosave: <strong>{saveState}</strong></p>
              <p className={styles.status}>{publishableDraft ? "config + hero complete" : "draft ancora incompleto"}</p>
            </div>
          </header>

          <nav className={styles.steps} aria-label="Passi del wizard">
            {steps.map((item) => (
              <button key={item.id} type="button" className={styles.step} data-active={step === item.id} onClick={() => setStep(item.id)}>
                <strong>{item.label}</strong><br /><small>{item.help}</small>
              </button>
            ))}
          </nav>

          {error && <div className={`${styles.notice} ${styles.error}`} role="alert">{error}</div>}

          {step === "identity" && <IdentityStep siteSlug={site.slug} config={config} patchIdentity={patchIdentity} updateSlug={updateSlug} />}
          {step === "theme" && (
            <ThemeStep
              config={config}
              setConfig={setConfig}
              patchSectionCopy={patchSectionCopy}
              toggleSurface={toggleSurface}
            />
          )}
          {step === "content" && (
            <ContentStep
              siteId={site.id}
              assets={assets}
              tracks={tracks}
              posts={posts}
              heroAssetId={heroAssetId}
              setHero={setHero}
              addAsset={addMediaAsset}
              addTrack={addTrack}
              insertRow={insertRow}
              deleteRow={deleteRow}
              setPosts={setPosts}
            />
          )}
          {step === "epk" && (
            <EpkStep
              siteId={site.id}
              userId={userId}
              links={links}
              press={press}
              dates={dates}
              metrics={metrics}
              contacts={contacts}
              insertRow={insertRow}
              deleteRow={deleteRow}
              setLinks={setLinks}
              setPress={setPress}
              setDates={setDates}
              setMetrics={setMetrics}
              setContacts={setContacts}
            />
          )}

          <section className={styles.panel}>
            <h2>Condividi</h2>
            <p className={styles.muted}>
              Apri la pagina completa come la vedrà chi riceve il link, oppure crea un link temporaneo da inviare.
            </p>
            <div className={styles.actions}>
              <button className={`${styles.button} ${styles.primary}`} type="button" onClick={() => void openOwnerPreview()}>Apri pagina completa</button>
              <button className={styles.button} type="button" onClick={() => void createPreviewLink()}>Crea link 24h</button>
            </div>
            {shareUrl && (
              <div className={styles.notice}>
                <strong>Link appena creato</strong><br />
                <a href={shareUrl} target="_blank" rel="noreferrer">{shareUrl}</a>
              </div>
            )}
            <div className={styles.cards}>
              {previewLinks.filter((link) => !link.revoked_at).map((link) => (
                <div className={styles.card} key={link.id}>
                  <div className={styles.cardRow}>
                    <span>Scade {new Date(link.expires_at).toLocaleString("it-IT")}</span>
                    <button className={`${styles.button} ${styles.danger}`} type="button" onClick={() => void revokePreviewLink(link)}>Revoca</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className={styles.footerNav}>
            <button
              className={styles.button}
              type="button"
              disabled={step === "identity"}
              onClick={() => setStep(steps[Math.max(0, steps.findIndex((item) => item.id === step) - 1)]!.id)}
            >
              Indietro
            </button>
            <button
              className={`${styles.button} ${styles.primary}`}
              type="button"
              disabled={step === "epk"}
              onClick={() => setStep(steps[Math.min(steps.length - 1, steps.findIndex((item) => item.id === step) + 1)]!.id)}
            >
              Continua
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function IdentityStep({
  siteSlug,
  config,
  patchIdentity,
  updateSlug,
}: {
  siteSlug: string;
  config: SiteConfigDraft;
  patchIdentity: (key: keyof SiteConfigDraft["identity"], value: string) => void;
  updateSlug: (value: string) => Promise<void>;
}) {
  const [slug, setSlug] = useState(siteSlug);
  // Risincronizza il campo quando lo slug del sito cambia da fuori. E' il
  // pattern React per adeguare lo stato a una prop: si confronta col valore
  // precedente durante il render, invece di farlo in un effetto. Stesso esito,
  // senza il passaggio di render in piu' in cui il campo mostra ancora il
  // valore vecchio.
  const [lastSiteSlug, setLastSiteSlug] = useState(siteSlug);
  if (siteSlug !== lastSiteSlug) {
    setLastSiteSlug(siteSlug);
    setSlug(siteSlug);
  }
  const fields: readonly [keyof SiteConfigDraft["identity"], string, boolean][] = [
    ["name", "Nome artista", false], ["handle", "Handle", false], ["claim", "Claim", false], ["location", "Luogo", false],
    ["shortBio", "Bio breve", true], ["longBio", "Bio lunga", true],
  ];

  return (
    <section className={styles.panel}>
      <h2>Identità</h2>
      <p className={styles.muted}>Puoi lasciare campi vuoti: SiteConfigDraft è fatto apposta per il salvataggio continuo.</p>
      <div className={styles.grid}>
        <label className={styles.label}>
          Indirizzo pubblico
          <input className={styles.input} value={slug} onChange={(event) => setSlug(event.target.value)} />
          <small>Salvabile finché il sito non è mai stato pubblicato.</small>
        </label>
        <div className={styles.actions}>
          <button className={styles.button} type="button" onClick={() => void updateSlug(slug)}>Salva indirizzo</button>
        </div>
        {fields.map(([key, label, multiline]) => (
          <label className={`${styles.label} ${multiline ? styles.full : ""}`} key={key}>
            {label}
            {multiline ? (
              <textarea className={styles.textarea} value={config.identity[key] ?? ""} onChange={(event) => patchIdentity(key, event.target.value)} />
            ) : (
              <input className={styles.input} value={config.identity[key] ?? ""} onChange={(event) => patchIdentity(key, event.target.value)} />
            )}
          </label>
        ))}
      </div>
    </section>
  );
}

function ThemeStep({
  config,
  setConfig,
  patchSectionCopy,
  toggleSurface,
}: {
  config: SiteConfigDraft;
  setConfig: React.Dispatch<React.SetStateAction<SiteConfigDraft | null>>;
  patchSectionCopy: (key: "home" | "feed" | "listen" | "epk" | "merch", value: string) => void;
  toggleSurface: (index: number) => void;
}) {
  return (
    <section className={styles.panel}>
      <h2>Tema</h2>
      <p className={styles.muted}>Scegli una delle quattro palette accessibili del guscio; i sette token salvati restano la fonte canonica del renderer.</p>
      <div className={styles.choice}>
        {shellPalettes.map((palette) => (
          <button type="button" className={styles.step} key={palette.id} onClick={() => setConfig({ ...config, theme: themeFromPalette(palette) })}>
            <strong>{palette.label}</strong>
            <div className={styles.swatch} style={{ background: `linear-gradient(90deg, ${palette.paper} 0 34%, ${palette.panel} 34% 67%, ${palette.acid} 67%)` }} />
          </button>
        ))}
      </div>

      <h3>Token colore</h3>
      <div className={styles.grid}>
        {(["ink", "panel", "paper", "muted", "dim", "line", "acid"] as const).map((token) => (
          <label className={styles.label} key={token}>
            {token}
            <input
              className={styles.input}
              type="color"
              value={config.theme[token]}
              onChange={(event) => setConfig({
                ...config,
                theme: { ...config.theme, [token]: event.target.value },
              })}
            />
          </label>
        ))}
      </div>

      <div className={styles.grid}>
        <label className={styles.label}>
          Coppia tipografica
          <select className={styles.select} value={config.fontPair} onChange={(event) => setConfig({ ...config, fontPair: event.target.value as SiteConfigDraft["fontPair"] })}>
            <option value="grotesk-mono">Grotesk / Mono</option>
            <option value="serif-sans">Serif / Sans</option>
            <option value="display-grotesk">Display / Grotesk</option>
          </select>
        </label>
        <label className={styles.label}>
          Famiglia icone
          <select className={styles.select} value={config.iconFamily} onChange={(event) => setConfig({ ...config, iconFamily: event.target.value as SiteConfigDraft["iconFamily"] })}>
            <option value="line">Line</option>
            <option value="block">Block</option>
            <option value="stencil">Stencil</option>
          </select>
        </label>
      </div>
      <div className={styles.actions}>
        <label><input type="checkbox" checked={config.grain} onChange={(event) => setConfig({ ...config, grain: event.target.checked })} /> Grana</label>
      </div>

      <h3>Superfici</h3>
      <div className={styles.choice}>
        {config.surfaces.map((surface, index) => (
          <button
            type="button"
            className={styles.step}
            key={surface.id}
            data-active={surface.enabled}
            disabled={surface.id === "epk" || surface.id === "home"}
            onClick={() => toggleSurface(index)}
          >
            {surface.id.toUpperCase()} · {surface.enabled ? "ON" : "OFF"}
          </button>
        ))}
      </div>

      <h3>Etichette sezioni</h3>
      <div className={styles.grid}>
        {(["feed", "listen", "epk", "merch", "home"] as const).map((surface) => (
          <label className={styles.label} key={surface}>
            {surface.toUpperCase()}
            <input
              className={styles.input}
              value={config.sectionCopy[surface] ?? ""}
              placeholder={surface.toUpperCase()}
              onChange={(event) => patchSectionCopy(surface, event.target.value)}
            />
          </label>
        ))}
      </div>
    </section>
  );
}

function ContentStep({
  siteId,
  assets,
  tracks,
  posts,
  heroAssetId,
  setHero,
  addAsset,
  addTrack,
  insertRow,
  deleteRow,
  setPosts,
}: {
  siteId: string;
  assets: WizardInitialData["assets"];
  tracks: WizardInitialData["tracks"];
  posts: WizardPost[];
  heroAssetId: string | null;
  setHero: (id: string | null) => Promise<void>;
  addAsset: (form: HTMLFormElement) => Promise<void>;
  addTrack: (form: HTMLFormElement) => Promise<void>;
  insertRow: <T>(table: string, row: Record<string, unknown>, select: string, setter: React.Dispatch<React.SetStateAction<T[]>>) => Promise<boolean>;
  deleteRow: <T extends { id: string }>(table: string, id: string, setter: React.Dispatch<React.SetStateAction<T[]>>) => Promise<void>;
  setPosts: React.Dispatch<React.SetStateAction<WizardPost[]>>;
}) {
  const [trackMode, setTrackMode] = useState<"embed" | "upload">("embed");
  const [postMode, setPostMode] = useState<"visual" | "track">("visual");
  const visualAssets = assets.filter((asset) => asset.kind === "visual");

  return (
    <>
      <section className={styles.panel}>
        <h2>Immagini e hero</h2>
        <p className={styles.muted}>Upload diretto a Storage privato: il server prenota la quota prima e riconcilia il DB dopo; i byte non attraversano Next.</p>
        <form onSubmit={(event) => { event.preventDefault(); void addAsset(event.currentTarget); }}>
          <div className={styles.grid}>
            <label className={styles.label}>Tipo
              <select name="kind" className={styles.select} defaultValue="visual">
                <option value="visual">Visual</option><option value="photo_hi">Foto hi-res</option><option value="logo">Logo</option><option value="merch">Merch render</option>
              </select>
            </label>
            <label className={styles.label}>File<input name="file" type="file" className={styles.input} accept="image/jpeg,image/png,image/webp,image/avif,image/gif" /></label>
          </div>
          <div className={styles.actions}><button className={`${styles.button} ${styles.primary}`} type="submit">Carica</button></div>
        </form>
        <div className={styles.cards}>
          {assets.map((asset) => (
            <div className={styles.card} key={asset.id}>
              <div className={styles.cardRow}>
                <span>{asset.kind} · {(asset.byte_size / 1024 / 1024).toFixed(1)} MB</span>
                {asset.kind === "visual" && (
                  <button className={styles.button} type="button" onClick={() => void setHero(heroAssetId === asset.id ? null : asset.id)}>
                    {heroAssetId === asset.id ? "Rimuovi hero" : "Usa come hero"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.panel}>
        <h2>Aggiungi traccia</h2>
        <div className={styles.actions}>
          <button className={styles.button} type="button" data-active={trackMode === "embed"} onClick={() => setTrackMode("embed")}>Link embed</button>
          <button className={styles.button} type="button" data-active={trackMode === "upload"} onClick={() => setTrackMode("upload")}>Upload audio</button>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); void addTrack(event.currentTarget); }}>
          <input type="hidden" name="mode" value={trackMode} />
          <div className={styles.grid}>
            <label className={styles.label}>Titolo<input name="title" required className={styles.input} /></label>
            {trackMode === "embed" ? (
              <>
                <label className={styles.label}>Provider
                  <select name="provider" className={styles.select}>
                    <option value="spotify">Spotify</option><option value="apple_music">Apple Music</option><option value="youtube">YouTube</option><option value="soundcloud">SoundCloud</option>
                  </select>
                </label>
                <label className={`${styles.label} ${styles.full}`}>URL HTTPS<input name="url" className={styles.input} type="url" required /></label>
              </>
            ) : (
              <label className={styles.label}>File audio<input name="file" type="file" className={styles.input} accept="audio/mpeg,audio/mp4,audio/aac,audio/flac,audio/ogg,audio/wav" /></label>
            )}
          </div>
          <div className={styles.actions}><button className={`${styles.button} ${styles.primary}`} type="submit">Aggiungi traccia</button></div>
        </form>
        <div className={styles.cards}>{tracks.map((track) => <div className={styles.card} key={track.id}>{track.title} · {track.source}{track.embed_provider ? ` · ${track.embed_provider}` : ""}</div>)}</div>
      </section>

      <section className={styles.panel}>
        <h2>Feed</h2>
        <p className={styles.muted}>Gli asset caricati da soli non compaiono nel FEED: qui diventano post, oppure un post può puntare a una traccia.</p>
        <div className={styles.actions}>
          <button className={styles.button} type="button" data-active={postMode === "visual"} onClick={() => setPostMode("visual")}>Post visuale</button>
          <button className={styles.button} type="button" data-active={postMode === "track"} onClick={() => setPostMode("track")}>Post traccia</button>
        </div>
        <form onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          const caption = nullIfBlank(String(data.get("caption") ?? ""));
          const row = postMode === "visual"
            ? { site_id: siteId, kind: "visual", visual_asset_id: data.get("visual_asset_id"), caption, sort_order: nextSort(posts) }
            : { site_id: siteId, kind: "track", track_id: data.get("track_id"), cover_asset_id: nullIfBlank(String(data.get("cover_asset_id") ?? "")), caption, sort_order: nextSort(posts) };
          void insertRow<WizardPost>(
            "site_posts",
            row,
            "id,kind,visual_asset_id,track_id,cover_asset_id,caption,sort_order",
            setPosts,
          ).then((ok) => { if (ok) form.reset(); });
        }}>
          <div className={styles.grid}>
            {postMode === "visual" ? (
              <label className={styles.label}>Visual
                <select name="visual_asset_id" required className={styles.select} defaultValue="">
                  <option value="" disabled>Seleziona</option>
                  {visualAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.id.slice(0, 8)} · visual</option>)}
                </select>
              </label>
            ) : (
              <>
                <label className={styles.label}>Traccia
                  <select name="track_id" required className={styles.select} defaultValue="">
                    <option value="" disabled>Seleziona</option>
                    {tracks.map((track) => <option key={track.id} value={track.id}>{track.title}</option>)}
                  </select>
                </label>
                <label className={styles.label}>Cover opzionale
                  <select name="cover_asset_id" className={styles.select} defaultValue="">
                    <option value="">Nessuna</option>
                    {visualAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.id.slice(0, 8)} · visual</option>)}
                  </select>
                </label>
              </>
            )}
            <label className={`${styles.label} ${styles.full}`}>Caption<textarea name="caption" className={styles.textarea} /></label>
          </div>
          <div className={styles.actions}><button className={`${styles.button} ${styles.primary}`} type="submit">Aggiungi al feed</button></div>
        </form>
        <div className={styles.cards}>
          {posts.map((post) => (
            <div className={styles.card} key={post.id}>
              <div className={styles.cardRow}>
                <span>{post.kind} · {post.caption || "senza caption"}</span>
                <button className={`${styles.button} ${styles.danger}`} type="button" onClick={() => void deleteRow("site_posts", post.id, setPosts)}>Elimina</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function EpkStep(props: {
  siteId: string;
  userId: string;
  links: WizardLink[];
  press: WizardPress[];
  dates: WizardDate[];
  metrics: WizardMetric[];
  contacts: WizardContact[];
  insertRow: <T>(table: string, row: Record<string, unknown>, select: string, setter: React.Dispatch<React.SetStateAction<T[]>>) => Promise<boolean>;
  deleteRow: <T extends { id: string }>(table: string, id: string, setter: React.Dispatch<React.SetStateAction<T[]>>) => Promise<void>;
  setLinks: React.Dispatch<React.SetStateAction<WizardLink[]>>;
  setPress: React.Dispatch<React.SetStateAction<WizardPress[]>>;
  setDates: React.Dispatch<React.SetStateAction<WizardDate[]>>;
  setMetrics: React.Dispatch<React.SetStateAction<WizardMetric[]>>;
  setContacts: React.Dispatch<React.SetStateAction<WizardContact[]>>;
}) {
  const { siteId, userId, links, press, dates, metrics, contacts, insertRow, deleteRow, setLinks, setPress, setDates, setMetrics, setContacts } = props;

  return (
    <div className={styles.cards}>
      <CrudSection
        title="Contatti"
        rows={contacts}
        render={(row) => `${row.role} · ${row.name} · ${row.email}${row.consent_confirmed_at ? " · consenso OK" : " · privato"}`}
        onDelete={(id) => deleteRow("site_contacts", id, setContacts)}
        form={<form onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          const consent = data.get("consent") === "on";
          void insertRow<WizardContact>("site_contacts", {
            site_id: siteId,
            role: data.get("role"),
            name: data.get("name"),
            email: data.get("email"),
            consent_confirmed_at: consent ? new Date().toISOString() : null,
            consent_confirmed_by: consent ? userId : null,
            sort_order: nextSort(contacts),
          }, "id,role,name,email,consent_confirmed_at,sort_order", setContacts).then((ok) => { if (ok) form.reset(); });
        }}>
          <div className={styles.grid}>
            <label className={styles.label}>Ruolo<select name="role" className={styles.select}><option value="booking">Booking</option><option value="management">Management</option><option value="press">Press</option></select></label>
            <label className={styles.label}>Nome<input name="name" required className={styles.input} /></label>
            <label className={styles.label}>Email<input name="email" required type="email" className={styles.input} /></label>
            <label className={styles.label}><span>Consenso alla pubblicazione</span><span><input name="consent" type="checkbox" /> Confermato</span></label>
          </div>
          <button className={`${styles.button} ${styles.primary}`} type="submit">Aggiungi</button>
        </form>}
      />

      <CrudSection
        title="Link DSP / social"
        rows={links}
        render={(row) => `${row.provider} · ${row.url}`}
        onDelete={(id) => deleteRow("site_links", id, setLinks)}
        form={<form onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          void insertRow<WizardLink>("site_links", {
            site_id: siteId, provider: data.get("provider"), url: data.get("url"), sort_order: nextSort(links),
          }, "id,provider,url,sort_order", setLinks).then((ok) => { if (ok) form.reset(); });
        }}>
          <div className={styles.grid}>
            <label className={styles.label}>Provider<select name="provider" className={styles.select}><option value="spotify">Spotify</option><option value="apple_music">Apple Music</option><option value="youtube">YouTube</option><option value="soundcloud">SoundCloud</option><option value="instagram">Instagram</option><option value="tiktok">TikTok</option></select></label>
            <label className={styles.label}>URL<input name="url" type="url" required className={styles.input} /></label>
          </div>
          <button className={`${styles.button} ${styles.primary}`} type="submit">Aggiungi</button>
        </form>}
      />

      <CrudSection
        title="Quote stampa"
        rows={press}
        render={(row) => `${row.publication} · “${row.quote}”`}
        onDelete={(id) => deleteRow("site_press", id, setPress)}
        form={<form onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          void insertRow<WizardPress>("site_press", {
            site_id: siteId,
            publication: data.get("publication"),
            quote: data.get("quote"),
            published_on: nullIfBlank(String(data.get("published_on") ?? "")),
            url: nullIfBlank(String(data.get("url") ?? "")),
            sort_order: nextSort(press),
          }, "id,publication,quote,published_on,url,sort_order", setPress).then((ok) => { if (ok) form.reset(); });
        }}>
          <div className={styles.grid}>
            <label className={styles.label}>Testata<input name="publication" required className={styles.input} /></label>
            <label className={styles.label}>Data<input name="published_on" type="date" className={styles.input} /></label>
            <label className={`${styles.label} ${styles.full}`}>Quote<textarea name="quote" required className={styles.textarea} /></label>
            <label className={`${styles.label} ${styles.full}`}>URL<input name="url" type="url" className={styles.input} /></label>
          </div>
          <button className={`${styles.button} ${styles.primary}`} type="submit">Aggiungi</button>
        </form>}
      />

      <CrudSection
        title="Live"
        rows={dates}
        render={(row) => `${new Date(row.starts_at).toLocaleString("it-IT")} · ${row.city} · ${row.venue}`}
        onDelete={(id) => deleteRow("site_dates", id, setDates)}
        form={<form onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          const raw = String(data.get("starts_at") ?? "");
          void insertRow<WizardDate>("site_dates", {
            site_id: siteId,
            starts_at: new Date(raw).toISOString(),
            city: data.get("city"),
            venue: data.get("venue"),
            ticket_url: nullIfBlank(String(data.get("ticket_url") ?? "")),
            sort_order: nextSort(dates),
          }, "id,starts_at,city,venue,ticket_url,sort_order", setDates).then((ok) => { if (ok) form.reset(); });
        }}>
          <div className={styles.grid}>
            <label className={styles.label}>Data e ora<input name="starts_at" type="datetime-local" required className={styles.input} /></label>
            <label className={styles.label}>Città<input name="city" required className={styles.input} /></label>
            <label className={styles.label}>Venue<input name="venue" required className={styles.input} /></label>
            <label className={styles.label}>Biglietti<input name="ticket_url" type="url" className={styles.input} /></label>
          </div>
          <button className={`${styles.button} ${styles.primary}`} type="submit">Aggiungi</button>
        </form>}
      />

      <CrudSection
        title="Numeri manuali"
        rows={metrics}
        render={(row) => `${row.label}: ${row.value}`}
        onDelete={(id) => deleteRow("site_metrics", id, setMetrics)}
        form={<form onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          void insertRow<WizardMetric>("site_metrics", {
            site_id: siteId, label: data.get("label"), value: data.get("value"), sort_order: nextSort(metrics),
          }, "id,label,value,sort_order", setMetrics).then((ok) => { if (ok) form.reset(); });
        }}>
          <div className={styles.grid}>
            <label className={styles.label}>Etichetta<input name="label" required className={styles.input} /></label>
            <label className={styles.label}>Valore<input name="value" required className={styles.input} /></label>
          </div>
          <button className={`${styles.button} ${styles.primary}`} type="submit">Aggiungi</button>
        </form>}
      />
    </div>
  );
}

function CrudSection<T extends { id: string }>({
  title,
  rows,
  render,
  onDelete,
  form,
}: {
  title: string;
  rows: T[];
  render: (row: T) => string;
  onDelete: (id: string) => Promise<void>;
  form: React.ReactNode;
}) {
  return (
    <section className={styles.panel}>
      <h2>{title}</h2>
      {form}
      <div className={styles.cards}>
        {rows.map((row) => (
          <div className={styles.card} key={row.id}>
            <div className={styles.cardRow}>
              <span>{render(row)}</span>
              <button className={`${styles.button} ${styles.danger}`} type="button" onClick={() => void onDelete(row.id)}>Elimina</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
