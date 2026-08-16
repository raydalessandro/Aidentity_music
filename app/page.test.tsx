// La radice del prodotto.
//
// Il difetto che questi banchi presidiano: `/` era il banco di prova del filone A, con
// l'intestazione `FILONE A / GUSCIO THEMABLE` e **zero** `href` in tutta la pagina. Il funnel
// esisteva per intero — accesso, wizard, sito, superfici — e non aveva una porta.
//
// Misurato prima di scrivere questo file: con la landing rimossa del tutto la suite restava
// verde a 539/539. È il motivo per cui esiste.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LANDING_ENTRY_HREF } from "../components/landing/Landing";
import Root from "./page";

const markup = renderToStaticMarkup(<Root />);

describe("la radice offre un ingresso", () => {
  it("porta all'accesso, che prima non era raggiungibile se non digitandolo", () => {
    expect(markup).toContain(`href="${LANDING_ENTRY_HREF}"`);
  });

  it("l'ingresso porta al wizard e non alla radice: chi accede viene a costruire", () => {
    expect(LANDING_ENTRY_HREF).toBe("/signup?next=/app/wizard");
    expect(markup).toContain("next=/app/wizard");
  });

  it("l'ingresso è un collegamento vero, non un elemento che non fa nulla", () => {
    // Il difetto di prima non era «manca un bottone»: era che nulla portava da nessuna parte.
    expect(markup).toMatch(/<a[^>]+class="landing-cta"[^>]*href=/);
  });
});

describe("la radice non si presenta come un banco di prova", () => {
  // Il caso che DEVE essere rifiutato: un nome interno di lavorazione sulla porta d'ingresso.
  it("non annuncia i nomi interni dei filoni", () => {
    expect(markup).not.toContain("FILONE");
    expect(markup).not.toContain("GUSCIO THEMABLE");
  });

  it("dichiara cosa si ottiene, non come è fatto dentro", () => {
    expect(markup).toContain("EPK");
    expect(markup).toContain("one-sheet");
  });
});

describe("lo showroom resta, e resta un'anteprima", () => {
  // Questo è il contratto che `e2e/shell.spec.ts` misura con axe e il contrasto. Verificarlo
  // anche qui significa che una rottura diventa rossa in `npm test`, non solo nel job e2e,
  // che richiede Docker e non gira in locale.
  it("i quattro gusci sono ancora quattro", () => {
    expect(markup.match(/data-palette="/g)).toHaveLength(4);
  });

  it("il player segnaposto è ancora reso: e2e ne misura il contrasto", () => {
    expect(markup).toContain("player-shell");
  });

  it("il dock dello showroom resta ad ancore, perché la pagina è a schermo unico", () => {
    expect(markup).toContain("#feed-");
    expect(markup).not.toContain('href="/nvll-click/feed"');
  });
});
