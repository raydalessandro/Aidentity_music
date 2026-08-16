import Link from "next/link";

import { Icon, type IconName } from "../site-shell/Icon";
import { PlayerShell } from "../site-shell/SiteShell";
import { paletteVars } from "../site-shell/style";
import type { ShellDestination, ShellSurfaceId } from "../site-shell/types";
import type {
  SiteTemplateDefinition,
  SiteTemplateHomeProps,
  SiteTemplateNavItem,
  SiteTemplateSurfaceProps,
} from "./types";
import styles from "./unica.module.css";

const DOCK_ORDER: readonly ShellSurfaceId[] = ["feed", "epk", "listen", "merch", "home"];
const SURFACE_ICON: Record<ShellSurfaceId, IconName> = {
  feed: "feed",
  listen: "listen",
  epk: "epk",
  merch: "merch",
  home: "home",
};

function isEnabled(config: SiteTemplateHomeProps["config"], id: ShellSurfaceId): boolean {
  return config.surfaces.some((surface) => surface.id === id && surface.enabled);
}

function homeHref(
  destination: ShellDestination,
  surface: ShellSurfaceId,
  previewId: string,
): string {
  if (destination.kind === "pubblicato") return destination.hrefs[surface];
  return surface === "home" ? `#content-${previewId}` : `#${surface}-${previewId}`;
}

function Topbar({ name, handle, published }: { name: string; handle: string | null; published: boolean }) {
  return (
    <header className={styles.topbar}>
      <span className={styles.brand}>
        <b>{name}</b>
        <i aria-hidden="true" />
      </span>
      <span className={styles.signal}>
        <i aria-hidden="true" />
        {published ? handle ?? "ONLINE" : "PREVIEW"}
      </span>
    </header>
  );
}

/**
 * Un collegamento fra superfici dello stesso sito.
 *
 * Da pubblicato deve essere un `Link`, e non e' una preferenza stilistica: su
 * `/[slug]` il player vive nel layout apposta per sopravvivere al cambio di
 * superficie, e un `<a>` ricarica il documento — quindi ferma la musica che sta
 * suonando. In un template il cui primo verbo e' «ascolta», premere ASCOLTA e
 * far tacere il player e' il difetto peggiore possibile.
 *
 * In anteprima l'indirizzo e' un'ancora nella stessa pagina e resta un `<a>`,
 * che e' anche l'unico modo di marcare una superficie spenta con `aria-disabled`.
 */
function SurfaceLink({
  published,
  href,
  className,
  disabled,
  children,
}: {
  readonly published: boolean;
  readonly href: string;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly children: React.ReactNode;
}) {
  if (published) {
    return <Link className={className} href={href}>{children}</Link>;
  }
  return <a className={className} href={href} aria-disabled={disabled}>{children}</a>;
}

function HomeDock({
  config,
  previewId,
  destination,
}: Pick<SiteTemplateHomeProps, "config" | "previewId"> & { destination: ShellDestination }) {
  const published = destination.kind === "pubblicato";

  return (
    <nav className={styles.dock} aria-label={`Superfici di ${config.identity.name ?? "artista"}`}>
      {DOCK_ORDER.map((surface) => {
        const enabled = isEnabled(config, surface);
        if (published && !enabled) return null;
        const center = surface === "listen";
        const className = `${styles.dockLink} ${center ? `${styles.dockCenter} dock-center` : ""}`;
        const content = (
          <>
            <Icon name={SURFACE_ICON[surface]} />
            <span>{surface.toUpperCase()}</span>
          </>
        );

        return (
          <SurfaceLink
            key={surface}
            published={published}
            className={className}
            href={homeHref(destination, surface, previewId)}
            disabled={!enabled}
          >
            {content}
          </SurfaceLink>
        );
      })}
    </nav>
  );
}

function HomeModule({
  number,
  title,
  copy,
  href,
  published,
}: {
  number: string;
  title: string;
  copy: string;
  href: string;
  published: boolean;
}) {
  return (
    <SurfaceLink published={published} className={styles.module} href={href}>
      <span>{number}</span>
      <b>{title}</b>
      <small>{copy}</small>
    </SurfaceLink>
  );
}

function UnicaHome({
  config,
  palette,
  previewId,
  destination = { kind: "anteprima" },
  heroSrc = null,
  embedded = false,
}: SiteTemplateHomeProps) {
  const name = config.identity.name ?? "SENZA NOME";
  const published = destination.kind === "pubblicato";
  const listenEnabled = isEnabled(config, "listen");
  const feedEnabled = isEnabled(config, "feed");
  const epkEnabled = isEnabled(config, "epk");

  return (
    <section
      className={`${styles.root} font-${config.fontPair} icons-${config.iconFamily}`}
      style={paletteVars(palette)}
      data-template="unica"
      data-grain={config.grain}
      data-palette={palette.id}
      data-published={published}
      data-embedded={embedded}
      aria-labelledby={`preview-${previewId}`}
    >
      <a className={styles.skipLink} href={`#content-${previewId}`}>Salta al contenuto</a>
      <Topbar name={name} handle={config.identity.handle} published={published} />

      <main id={`content-${previewId}`}>
        <section className={styles.hero}>
          {heroSrc === null ? (
            <div className={styles.heroFallback} aria-label="Visual principale segnaposto">
              <span>{name.slice(0, 2)}</span>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- URL mediato dalla route media.
            <img className={styles.heroImage} src={heroSrc} alt={`Visual principale di ${name}`} />
          )}
          <div className={styles.heroShade} aria-hidden="true" />
          <div className={styles.heroGrid} aria-hidden="true" />
          <div className={styles.heroMotif} data-art-slot="hero-mark" aria-hidden="true">
            <svg viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="46" />
              <path d="M14 60h92M60 14v92" />
              <path d="m28 28 64 64M92 28 28 92" />
            </svg>
          </div>

          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>{config.identity.location ?? config.identity.handle ?? "NUOVA IDENTITÀ"}</span>
            <h1 id={`preview-${previewId}`}>{name}</h1>
            {config.identity.claim && <p className={styles.claim}>{config.identity.claim}</p>}
            <div className={styles.heroActions}>
              {listenEnabled && <SurfaceLink published={published} className={styles.primaryCta} href={homeHref(destination, "listen", previewId)}>ASCOLTA</SurfaceLink>}
              {feedEnabled && <SurfaceLink published={published} className={styles.ghostCta} href={homeHref(destination, "feed", previewId)}>VISUAL</SurfaceLink>}
            </div>
          </div>
        </section>

        <section className={styles.moduleStrip} aria-label="Porte del sito">
          {listenEnabled && <HomeModule published={published} number="01" title="LISTEN" copy="musica e release" href={homeHref(destination, "listen", previewId)} />}
          {feedEnabled && <HomeModule published={published} number="02" title="FEED" copy="immagini e frammenti" href={homeHref(destination, "feed", previewId)} />}
          {epkEnabled && <HomeModule published={published} number="03" title="EPK" copy="bio, press e contatti" href={homeHref(destination, "epk", previewId)} />}
        </section>

        <section className={styles.editorial}>
          <div>
            <span className={styles.eyebrow}>IDENTITÀ / 001</span>
            <h2>{config.identity.shortBio ?? config.identity.claim ?? name}</h2>
          </div>
          <div className={styles.editorialCopy}>
            {config.identity.longBio && <p>{config.identity.longBio}</p>}
            {config.identity.location && <small>{config.identity.location}</small>}
          </div>
        </section>

        <section className={styles.artRail} aria-hidden="true">
          <div data-art-slot="rail-a">{name.slice(0, 1)}</div>
          <div data-art-slot="rail-b"><span /></div>
          <div data-art-slot="rail-c">{config.identity.handle?.slice(0, 2).toUpperCase() ?? "ID"}</div>
        </section>
      </main>

      {published ? null : <PlayerShell artist={name} />}
      <HomeDock config={config} previewId={previewId} destination={destination} />
    </section>
  );
}

function SurfaceDock({
  navigation,
  surface,
}: {
  navigation: readonly SiteTemplateNavItem[];
  surface: ShellSurfaceId;
}) {
  const byId = new Map(navigation.map((item) => [item.id, item]));
  return (
    <nav className={styles.dock} aria-label="Navigazione principale">
      {DOCK_ORDER.map((id) => {
        const item = byId.get(id);
        if (!item?.enabled) return null;
        const center = id === "listen";
        const className = `${styles.dockLink} ${center ? `${styles.dockCenter} dock-center` : ""}`;
        const content = <><Icon name={SURFACE_ICON[id]} /><span>{item.label}</span></>;
        return id === surface
          ? <span key={id} className={className} aria-current="page">{content}</span>
          : <Link key={id} className={className} href={item.href}>{content}</Link>;
      })}
    </nav>
  );
}

function UnicaSurface({
  config,
  palette,
  surface,
  label,
  navigation,
  published,
  children,
}: SiteTemplateSurfaceProps) {
  const name = config.identity.name ?? "SENZA NOME";
  return (
    <section
      className={`${styles.root} ${styles.surface} font-${config.fontPair} icons-${config.iconFamily}`}
      style={paletteVars(palette)}
      data-template="unica"
      data-grain={config.grain}
      data-palette={palette.id}
      data-published={published}
      data-surface={surface}
    >
      <a className={styles.skipLink} href={`#contenuto-${surface}`}>Salta al contenuto</a>
      <Topbar name={name} handle={config.identity.handle} published={published} />
      <main id={`contenuto-${surface}`} className={styles.surfaceContent}>
        <span className={styles.eyebrow}>{name}</span>
        <h1>{label}</h1>
        <div className={styles.surfaceBody}>{children}</div>
      </main>
      <SurfaceDock navigation={navigation} surface={surface} />
    </section>
  );
}

export const unicaTemplate: SiteTemplateDefinition = {
  id: "unica",
  label: "Unica",
  Home: UnicaHome,
  Surface: UnicaSurface,
};
