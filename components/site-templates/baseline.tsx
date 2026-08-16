import Link from "next/link";

import { ShellTopbar, SiteShell } from "../site-shell/SiteShell";
import { paletteVars } from "../site-shell/style";
import type {
  SiteTemplateDefinition,
  SiteTemplateHomeProps,
  SiteTemplateSurfaceProps,
} from "./types";

/**
 * HOME attuale, senza un solo nodo di markup aggiunto dal nuovo livello di dispatch.
 *
 * Il passaggio è integrale (`{...props}`) e non un elenco di prop: `destination` deve
 * arrivare a `SiteShell` esattamente com'era, altrimenti il sito pubblicato torna a
 * presentarsi come un'anteprima.
 */
function BaselineHome(props: SiteTemplateHomeProps) {
  return <SiteShell {...props} />;
}

/**
 * Chrome attuale delle superfici non-HOME, spostato fuori dalle route. I contenuti restano
 * children: il template decide geometria e navigazione, il dominio decide cosa mostrare.
 *
 * `published` viene inoltrato e non deciso qui: vedi la nota su `SiteTemplateSurfaceProps`.
 */
function BaselineSurface({
  config,
  palette,
  surface,
  label,
  navigation,
  published,
  children,
}: SiteTemplateSurfaceProps) {
  return (
    <section
      className={`site-shell font-${config.fontPair} icons-${config.iconFamily}`}
      style={paletteVars(palette)}
      data-grain={config.grain}
      data-palette={palette.id}
      data-surface={surface}
    >
      <a className="skip-link" href={`#contenuto-${surface}`}>
        Salta al contenuto
      </a>
      <ShellTopbar handle={config.identity.handle} published={published} />
      <main id={`contenuto-${surface}`} className="shell-content">
        <p className="eyebrow">{config.identity.name}</p>
        <h1>{label}</h1>
        {children}
      </main>
      {/*
        Una superficie spenta non compare e non è raggiungibile via URL: è la stessa regola
        che il dock applica sulla HOME pubblicata, e i due leggono lo stesso `surfaceHref`.
      */}
      <nav aria-label={`Superfici di ${config.identity.name ?? "anteprima"}`}>
        <ul>
          {navigation
            .filter((item) => item.enabled)
            .map((item) => (
              <li key={item.id}>
                {item.id === surface ? (
                  <span aria-current="page">{item.label}</span>
                ) : (
                  <Link href={item.href}>{item.label}</Link>
                )}
              </li>
            ))}
        </ul>
      </nav>
    </section>
  );
}

export const baselineTemplate: SiteTemplateDefinition = {
  id: "baseline",
  label: "Baseline",
  Home: BaselineHome,
  Surface: BaselineSurface,
};
