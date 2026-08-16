import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import PublishPanel from "./PublishPanel";

const baseProps = {
  siteId: "22222222-2222-2222-2222-222222222222",
  slug: "mira-noir",
  publicationStatus: "draft",
  billingStatus: "not_started",
  currentPlan: "base",
  currentInterval: "year",
  readyForCheckout: true,
  checkoutOutcome: null,
} as const;

describe("PublishPanel", () => {
  it("presenta annuale per primo e i tre piani canonici", () => {
    const html = renderToStaticMarkup(<PublishPanel {...baseProps} />);
    expect(html).toContain("BASE");
    expect(html).toContain("PRO");
    expect(html).toContain("MAX");
    expect(html).toContain("€24");
    expect(html).toContain("Continua con BASE annuale");
  });

  it("non propone un secondo checkout subito dopo il ritorno da Stripe", () => {
    const html = renderToStaticMarkup(<PublishPanel {...baseProps} checkoutOutcome="ok" />);
    expect(html).toContain("PAGAMENTO RICEVUTO");
    expect(html).toContain("Aggiorna stato");
    expect(html).not.toContain("Continua con BASE annuale");
  });

  it("su un sito pubblicato mostra il sito e il portale, non il catalogo", () => {
    const html = renderToStaticMarkup(
      <PublishPanel {...baseProps} publicationStatus="published" billingStatus="active" />,
    );
    expect(html).toContain("ONLINE");
    expect(html).toContain('href="/mira-noir"');
    expect(html).toContain("Gestisci piano");
    expect(html).not.toContain("Continua con BASE annuale");
  });
});
