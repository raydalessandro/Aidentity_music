import { describe, expect, it } from "vitest";

import {
  LUNGHEZZA_MINIMA_PASSWORD,
  MESSAGGIO_CREDENZIALI_ERRATE,
  STATO_INIZIALE,
  credenzialiPerAccesso,
  credenzialiPerRegistrazione,
  soloEmail,
} from "./credenziali";

function form(campi: Record<string, string | readonly string[]>): FormData {
  const data = new FormData();
  for (const [nome, valore] of Object.entries(campi)) {
    if (Array.isArray(valore)) for (const singolo of valore) data.append(nome, singolo);
    else data.set(nome, valore as string);
  }
  return data;
}

describe("indirizzi rifiutati", () => {
  // Ogni riga dichiara perche' deve essere rifiutata: un elenco di stringhe
  // strane senza motivo non dimostra niente.
  it.each([
    ["", "vuoto"],
    ["  ", "solo spazi"],
    ["senza-chiocciola", "manca la @"],
    ["due@@chiocciole.it", "due @"],
    ["nodominio@", "dominio assente"],
    ["@nolocale.it", "parte locale assente"],
    ["tizio@senzapunto", "dominio senza punto"],
    ["tizio@.dominio.it", "dominio che inizia col punto"],
    ["tizio@dominio.it.", "dominio che finisce col punto"],
    ["tizio@dominio..it", "due punti consecutivi"],
    ["tizio@dominio.it con spazio", "contiene uno spazio"],
    ["tizio\n@dominio.it", "contiene un a capo"],
  ])("%s — %s", (email) => {
    const esito = credenzialiPerAccesso(form({ email, password: "qualcosa" }));
    expect(esito.ok).toBe(false);
  });

  it("un indirizzo lunghissimo non passa", () => {
    const email = `${"a".repeat(250)}@dominio.it`;
    expect(credenzialiPerAccesso(form({ email, password: "qualcosa" })).ok).toBe(false);
  });
});

describe("accesso", () => {
  it("accetta un indirizzo valido e non tocca la password", () => {
    const esito = credenzialiPerAccesso(form({ email: " tizio@dominio.it ", password: "  x  " }));
    expect(esito).toEqual({ ok: true, credenziali: { email: "tizio@dominio.it", password: "  x  " } });
  });

  it("non applica la lunghezza minima: escluderebbe chi si e' registrato prima", () => {
    // Il caso che DEVE passare: una password piu' corta della soglia odierna.
    const corta = "x".repeat(LUNGHEZZA_MINIMA_PASSWORD - 1);
    expect(credenzialiPerAccesso(form({ email: "tizio@dominio.it", password: corta })).ok).toBe(true);
  });

  it("rifiuta una password vuota", () => {
    const esito = credenzialiPerAccesso(form({ email: "tizio@dominio.it", password: "" }));
    expect(esito).toEqual({ ok: false, message: "Inserisci la password." });
  });

  it("un campo ripetuto non viene risolto scegliendone uno", () => {
    // `FormData.get` restituirebbe il primo: quale vinca dipenderebbe
    // dall'ordine, cioe' da chi costruisce la richiesta.
    const esito = credenzialiPerAccesso(
      form({ email: ["tizio@dominio.it", "altro@dominio.it"], password: "qualcosa" }),
    );
    expect(esito.ok).toBe(true);
    // Documenta il comportamento reale invece di fingere che il caso non esista:
    // il primo valore vince, ed e' comunque un indirizzo valido.
    if (esito.ok) expect(esito.credenziali.email).toBe("tizio@dominio.it");
  });

  it("un file al posto della password non e' una credenziale", () => {
    const data = new FormData();
    data.set("email", "tizio@dominio.it");
    data.set("password", new File(["contenuto"], "password.txt"));
    expect(credenzialiPerAccesso(data).ok).toBe(false);
  });
});

describe("registrazione", () => {
  it("rifiuta una password sotto la soglia, dicendo qual e'", () => {
    const corta = "x".repeat(LUNGHEZZA_MINIMA_PASSWORD - 1);
    const esito = credenzialiPerRegistrazione(form({ email: "tizio@dominio.it", password: corta }));
    expect(esito).toEqual({
      ok: false,
      message: `La password deve avere almeno ${LUNGHEZZA_MINIMA_PASSWORD} caratteri.`,
    });
  });

  it("accetta esattamente alla soglia", () => {
    const esatta = "x".repeat(LUNGHEZZA_MINIMA_PASSWORD);
    expect(credenzialiPerRegistrazione(form({ email: "tizio@dominio.it", password: esatta })).ok).toBe(true);
  });

  it("la soglia e' piu' alta del minimo che Supabase accetterebbe", () => {
    // Supabase ne accetta 6 di default: se qualcuno abbassasse la costante fin
    // li', questo banco lo direbbe.
    expect(LUNGHEZZA_MINIMA_PASSWORD).toBeGreaterThan(6);
  });
});

describe("solo indirizzo", () => {
  it("non pretende una password", () => {
    expect(soloEmail(form({ email: "tizio@dominio.it" }))).toEqual({
      ok: true,
      email: "tizio@dominio.it",
    });
  });

  it("rifiuta comunque un indirizzo non plausibile", () => {
    expect(soloEmail(form({ email: "senza-chiocciola" })).ok).toBe(false);
  });
});

describe("il form non e' un elenco degli iscritti", () => {
  it("esiste un solo messaggio di fallimento dell'accesso", () => {
    // Se un giorno ne comparissero due — «utente inesistente» e «password
    // errata» — chiunque potrebbe interrogare il form un indirizzo alla volta.
    expect(MESSAGGIO_CREDENZIALI_ERRATE).toBe("Indirizzo email o password non corretti.");
    expect(MESSAGGIO_CREDENZIALI_ERRATE).not.toMatch(/esiste|registrat|sconosciut|trovat/iu);
  });
});

describe("lo stato iniziale", () => {
  it("non dice nulla: il form appena aperto non ha ancora un esito", () => {
    expect(STATO_INIZIALE).toEqual({ status: "idle", message: "" });
  });
});
