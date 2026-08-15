import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { copyRenderedText, copyText } from "./clipboard";
import { EpkSurface } from "./EpkSurface";
import {
  emptyContent,
  fixtureContacts,
  fixtureContent,
  fixtureDates,
  fixtureLinks,
  fixtureMetrics,
  fixtureNow,
  fixturePress,
  mustNotAppear,
} from "./fixture";
import { httpsUrl, mailtoHref, readDateLabel, readEventInstant } from "./format";
import {
  publishableContacts,
  publishableLinks,
  publishableMetrics,
  publishablePress,
  splitLiveDates,
} from "./select";
import type { EpkContent } from "./types";

const render = (content: EpkContent, now: Date = fixtureNow, id = "epk") =>
  renderToStaticMarkup(<EpkSurface content={content} now={now} id={id} />);

const markup = render(fixtureContent);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lettura dei valori del database", () => {
  it("legge un timestamptz conservando l'ora locale dichiarata nell'offset", () => {
    expect(readEventInstant("2026-11-04T22:00:00+01:00")).toEqual({
      epochMs: Date.parse("2026-11-04T22:00:00+01:00"),
      dateLabel: "mer 4 nov 2026",
      timeLabel: "22:00",
    });
  });

  it("rifiuta una data/ora senza offset, una data inesistente e un'ora impossibile", () => {
    expect(readEventInstant("2026-12-31T23:00:00")).toBeNull();
    expect(readEventInstant("2026-02-31T21:00:00+01:00")).toBeNull();
    expect(readEventInstant("2026-11-04T29:00:00+01:00")).toBeNull();
    expect(readEventInstant("domani sera")).toBeNull();
  });

  it("legge una date semplice e rifiuta ciò che date non è", () => {
    expect(readDateLabel("2026-03-14")).toBe("14 mar 2026");
    expect(readDateLabel("14/03/2026")).toBeNull();
  });

  it("accetta solo URL https", () => {
    expect(httpsUrl("https://esempio.example/a")).toBe("https://esempio.example/a");
    expect(httpsUrl("http://esempio.example/a")).toBeNull();
    expect(httpsUrl("javascript:alert('x')")).toBeNull();
    expect(httpsUrl("data:text/html,<script>")).toBeNull();
    expect(httpsUrl("esempio.example")).toBeNull();
    expect(httpsUrl(null)).toBeNull();
  });

  it("codifica i caratteri riservati nel mailto ma lascia leggibile la chiocciola", () => {
    expect(mailtoHref("booking@nvllclick.example")).toBe("mailto:booking@nvllclick.example");
    expect(mailtoHref("bo?ok&ing@nvllclick.example")).toBe("mailto:bo%3Fok%26ing@nvllclick.example");
  });
});

describe("invariante del consenso", () => {
  it("pubblica solo i contatti con consent_confirmed_at valorizzato", () => {
    expect(publishableContacts(fixtureContacts).map((contact) => contact.id)).toEqual([
      "contact-booking",
      "contact-press",
    ]);
  });

  it("il contatto senza consenso non entra nel risultato: nessuna email nonconsentito@nvllclick.example", () => {
    const emails = publishableContacts(fixtureContacts).map((contact) => contact.email);
    expect(emails).not.toContain("nonconsentito@nvllclick.example");
  });

  it("una stringa vuota non è un consenso", () => {
    const forced = publishableContacts([
      { ...fixtureContacts[0]!, id: "vuoto", consent_confirmed_at: "   " },
    ]);
    expect(forced).toEqual([]);
  });

  it("il markup reso non contiene l'email del contatto senza consenso", () => {
    expect(markup).not.toContain("nonconsentito@nvllclick.example");
    expect(markup).toContain("mailto:booking@nvllclick.example");
  });
});

describe("insiemi chiusi e URL dei link", () => {
  it("tiene solo i provider dell'insieme chiuso con URL https", () => {
    expect(publishableLinks(fixtureLinks).map((link) => link.id)).toEqual([
      "link-spotify",
      "link-tiktok",
    ]);
  });

  it("scarta il provider fuori set: bandcamp non compare nel markup", () => {
    expect(markup).not.toContain("bandcamp");
  });

  it("scarta l'URL non https: http://www.youtube.com/@nvllclick non compare nel markup", () => {
    expect(markup).not.toContain("http://www.youtube.com/@nvllclick");
    expect(markup).toContain("https://www.tiktok.com/@nvllclick");
  });
});

describe("quote stampa", () => {
  it("richiede quote e testata", () => {
    expect(publishablePress(fixturePress).map((entry) => entry.id)).toEqual([
      "press-rumore",
      "press-link-insicuro",
    ]);
  });

  it("un URL non https toglie il link, non la citazione", () => {
    expect(markup).toContain("Tre accordi e una minaccia.");
    expect(markup).not.toContain("http://blowup.example/nvll-click");
    expect(markup).toContain('<a style="color:var(--ink);text-decoration-color:var(--acid);text-underline-offset:0.2em" href="https://rumore.example/nvll-click"');
  });

  it("mostra la data solo quando esiste", () => {
    expect(markup).toContain("14 mar 2026");
  });
});

describe("date live", () => {
  const split = splitLiveDates(fixtureDates, fixtureNow);

  it("ordina le future in modo crescente: la più vicina per prima", () => {
    expect(split.upcoming.map((entry) => entry.date.id)).toEqual([
      "date-futura-vicina",
      "date-futura-lontana",
    ]);
  });

  it("ordina le passate in modo decrescente: la più recente per prima", () => {
    expect(split.past.map((entry) => entry.date.id)).toEqual([
      "date-passata-recente",
      "date-passata-vecchia",
    ]);
  });

  it("una data passata non finisce fra le future: date-passata-recente resta fuori da upcoming", () => {
    expect(split.upcoming.map((entry) => entry.date.id)).not.toContain("date-passata-recente");
  });

  it("una data esattamente uguale a now conta come futura", () => {
    const adesso = splitLiveDates(
      [{ ...fixtureDates[0]!, id: "ora", starts_at: "2026-08-15T12:00:00+00:00" }],
      fixtureNow,
    );
    expect(adesso.upcoming.map((entry) => entry.date.id)).toEqual(["ora"]);
    expect(adesso.past).toEqual([]);
  });

  it("scarta la data senza offset e quella senza venue", () => {
    const resi = [...split.upcoming, ...split.past].map((entry) => entry.date.id);
    expect(resi).not.toContain("date-senza-offset");
    expect(resi).not.toContain("date-senza-venue");
    expect(markup).not.toContain("Duel Beat");
    expect(markup).not.toContain("Firenze");
  });

  it("nel markup le prossime date precedono le passate", () => {
    expect(markup.indexOf("Prossime date")).toBeGreaterThanOrEqual(0);
    expect(markup.indexOf("Prossime date")).toBeLessThan(markup.indexOf("Date passate"));
    expect(markup.indexOf("Circolo Magnolia")).toBeLessThan(markup.indexOf("Monk"));
  });

  it("il link biglietti compare solo dove esiste ed è https", () => {
    expect(markup).toContain('href="https://biglietti.example/magnolia"');
    expect(markup.match(/Biglietti</g)).toHaveLength(1);
  });
});

describe("numeri manuali", () => {
  it("scarta etichetta o valore vuoti", () => {
    expect(publishableMetrics(fixtureMetrics).map((metric) => metric.id)).toEqual([
      "metric-ascolti",
      "metric-date",
    ]);
  });

  it("la metrica con etichetta vuota non compare: nessun 999999 nel markup", () => {
    expect(markup).not.toContain("999999");
    expect(markup).toContain("184.000");
  });
});

describe("bio copiabile", () => {
  it("rende una regione aria-live polite vuota, pronta ad annunciare l'esito", () => {
    expect(markup).toContain('role="status" aria-live="polite" aria-atomic="true"');
    expect(markup).toContain("Copia la bio breve");
    expect(markup).toContain("Copia la bio lunga");
  });

  it("copia il testo reso, non una seconda copia della stringa", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    // Il tipo accetta un elemento, non una stringa: passare la prop non compila.
    await expect(copyRenderedText({ textContent: "testo così com'è reso" })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("testo così com'è reso");
  });

  it("un elemento assente o vuoto non finge una copia riuscita", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(copyRenderedText(null)).resolves.toBe(false);
    await expect(copyRenderedText({ textContent: "" })).resolves.toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("senza bio non esiste la sezione, e non nasce nessun segnaposto", () => {
    const vuoto = render(emptyContent);
    expect(vuoto).not.toContain("Bio");
    expect(vuoto).not.toContain("Copia");
  });
});

describe("copia negli appunti", () => {
  type FakeField = {
    value: string;
    style: Record<string, string>;
    setAttribute: (name: string, value: string) => void;
    select: () => void;
    remove: () => void;
  };

  function fakeDocument(execCommand: () => boolean) {
    const field: FakeField = {
      value: "",
      style: {},
      setAttribute: () => undefined,
      select: () => undefined,
      remove: () => {
        rimosso.valore = true;
      },
    };
    const rimosso = { valore: false };
    const page = {
      createElement: () => field,
      body: { appendChild: () => undefined },
      execCommand: vi.fn(execCommand),
    };
    return { page, field, rimosso };
  }

  it("usa navigator.clipboard quando c'è", async () => {
    const writeText = vi.fn(async () => undefined);
    const { page } = fakeDocument(() => true);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("document", page);

    await expect(copyText("bio breve")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("bio breve");
    expect(page.execCommand).not.toHaveBeenCalled();
  });

  it("ricade sulla selezione quando il permesso è negato", async () => {
    const writeText = vi.fn(async () => {
      throw new Error("NotAllowedError");
    });
    const { page, field, rimosso } = fakeDocument(() => true);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("document", page);

    await expect(copyText("bio lunga")).resolves.toBe(true);
    expect(field.value).toBe("bio lunga");
    expect(rimosso.valore).toBe(true);
  });

  it("ricade sulla selezione quando navigator.clipboard non esiste", async () => {
    const { page } = fakeDocument(() => true);
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", page);

    await expect(copyText("bio breve")).resolves.toBe(true);
    expect(page.execCommand).toHaveBeenCalledWith("copy");
  });

  it("dichiara il fallimento invece di fingere: nessun appunto, nessun true", async () => {
    const { page } = fakeDocument(() => false);
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", page);
    await expect(copyText("bio breve")).resolves.toBe(false);

    vi.stubGlobal("document", undefined);
    await expect(copyText("bio breve")).resolves.toBe(false);
    await expect(copyText("")).resolves.toBe(false);
  });
});

describe("markup reso", () => {
  it("non contiene nessuna delle stringhe rifiutate dal contratto", () => {
    for (const { value, because } of mustNotAppear) {
      expect(markup, `${value} — ${because}`).not.toContain(value);
    }
  });

  it("mette i contatti sopra la bio: chi decide cerca prima l'email", () => {
    expect(markup.indexOf("Contatti")).toBeGreaterThanOrEqual(0);
    expect(markup.indexOf("Contatti")).toBeLessThan(markup.indexOf(">Bio<"));
  });

  it("usa solo le otto custom property iniettate da SiteShell", () => {
    const consentite = new Set(["--ink", "--panel", "--paper", "--muted", "--dim", "--line", "--acid", "--acid-ink"]);
    const usate = [...markup.matchAll(/var\((--[a-z-]+)\)/g)].map((match) => match[1]);
    expect(usate.length).toBeGreaterThan(0);
    for (const token of usate) {
      expect(consentite, `token non previsto: ${token}`).toContain(token);
    }
  });

  it("non contiene nessun colore letterale negli stili inline", () => {
    const valori = [...markup.matchAll(/style="([^"]*)"/g)]
      .flatMap((match) => (match[1] ?? "").split(";"))
      .flatMap((dichiarazione) => dichiarazione.split(":").slice(1));
    expect(valori.length).toBeGreaterThan(0);
    for (const valore of valori) {
      expect(valore, "colore esadecimale").not.toMatch(/#[0-9a-fA-F]{3}/);
      expect(valore, "funzione colore").not.toMatch(/\b(?:rgba?|hsla?|color)\(/);
      expect(valore, "colore con nome").not.toMatch(/\b(?:black|white|red|blue|green|gray|grey|yellow|orange|purple|pink)\b/);
    }
  });

  it("un contenuto interamente vuoto non inventa nulla", () => {
    const vuoto = render(emptyContent);
    expect(vuoto).toBe('<section id="epk" style="background:var(--paper);color:var(--ink);display:grid;gap:2rem;padding:clamp(1rem, 4vw, 2.5rem);line-height:1.5" aria-label="EPK"></section>');
  });

  it("gli id delle sezioni derivano dalla prop id: due EPK sulla stessa pagina non collidono", () => {
    const primo = render(fixtureContent, fixtureNow, "epk-uno");
    const secondo = render(fixtureContent, fixtureNow, "epk-due");
    expect(primo).toContain('id="epk-uno-contatti"');
    expect(secondo).toContain('id="epk-due-contatti"');
    expect(primo).not.toContain('id="epk-due-contatti"');
  });

  it("i props cambiano l'output: due contenuti diversi non rendono lo stesso markup", () => {
    const altro: EpkContent = {
      ...fixtureContent,
      shortBio: "Un'altra bio breve.",
      contacts: [
        {
          id: "contact-altro",
          role: "management",
          name: "Chiara Aloisi",
          email: "management@altroartista.example",
          consent_confirmed_at: "2026-05-05T09:00:00+02:00",
          sort_order: 0,
        },
      ],
    };
    const secondo = render(altro);

    expect(secondo).not.toBe(markup);
    expect(secondo).toContain("mailto:management@altroartista.example");
    expect(secondo).not.toContain("mailto:booking@nvllclick.example");
    expect(markup).not.toContain("mailto:management@altroartista.example");
    expect(secondo).toContain("Un&#x27;altra bio breve.");
  });

  it("il momento di riferimento cambia la separazione fra future e passate", () => {
    const nel2027 = render(fixtureContent, new Date("2027-01-01T00:00:00Z"));
    expect(nel2027).not.toContain("Prossime date");
    expect(nel2027).toContain("Date passate");
    expect(markup).toContain("Prossime date");
  });
});
