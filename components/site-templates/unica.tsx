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

/** Contratto canonico Aidentity: FEED · LISTEN · [EPK] · MERCH · HOME. */
const DOCK_ORDER: readonly ShellSurfaceId[] = ["feed", "listen", "epk", "merch", "home"];
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

function sectionLabel(config: SiteTemplateHomeProps["config"], id: ShellSurfaceId): string {
  return config.sectionCopy[id]?.trim() || id.toUpperCase();
}

function homeHref(
  destination: ShellDestination,
  surface: ShellSurfaceId,
  previewId: string,
): string {
  if (destination.kind === "pubblicato") return destination.hrefs[surface];
  return surface === "home" ? `#content-${previewId}` : `#${surface}-${previewId}`;
}

function BrandLockup({ name }: { name: string }) {
  const [lead, ...tail] = name.trim().split(/\s+/);
  return (
    <span className={styles.brandText}>
      <b>{lead || name}</b>
      {tail.length > 0 && <span>{tail.join(" ")}</span>}
      <i aria-hidden="true" />
    </span>
  );
}

function Topbar({ name, published }: { name: string; published: boolean }) {
  return (
    <header className={styles.topbar}>
      <BrandLockup name={name} />
      <span className={styles.signal} role="status">
        <i aria-hidden="true" />
        {published ? "SYSTEM ONLINE" : "PREVIEW"}
      </span>
    </header>
  );
}

function SurfaceLink({
  published,
  href,
  className,
  disabled,
  interactive = true,
  contractCenter = false,
  children,
}: {
  readonly published: boolean;
  readonly href: string;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly interactive?: boolean;
  readonly contractCenter?: boolean;
  readonly children: React.ReactNode;
}) {
  const dockHook = contractCenter ? "true" : undefined;
  if (!interactive) {
    return <span className={className} data-dock-center={dockHook} aria-disabled="true">{children}</span>;
  }
  if (published) {
    return <Link className={className} data-dock-center={dockHook} href={href}>{children}</Link>;
  }
  return <a className={className} data-dock-center={dockHook} href={href} aria-disabled={disabled}>{children}</a>;
}

function HomeDock({
  config,
  previewId,
  destination,
  interactive = true,
}: Pick<SiteTemplateHomeProps, "config" | "previewId" | "interactive"> & { destination: ShellDestination }) {
  const published = destination.kind === "pubblicato";

  return (
    <nav className={styles.dock} aria-label={`Superfici di ${config.identity.name ?? "artista"}`}>
      {DOCK_ORDER.map((surface) => {
        const enabled = isEnabled(config, surface);
        if (published && !enabled) return null;
        const center = surface === "epk";
        const className = `${styles.dockLink} ${center ? styles.dockCenter : ""}`;
        return (
          <SurfaceLink
            key={surface}
            published={published}
            className={className}
            href={homeHref(destination, surface, previewId)}
            disabled={!enabled}
            interactive={interactive}
            contractCenter={center}
          >
            <Icon name={SURFACE_ICON[surface]} />
            <span>{sectionLabel(config, surface)}</span>
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
  interactive,
}: {
  number: string;
  title: string;
  copy: string;
  href: string;
  published: boolean;
  interactive: boolean;
}) {
  return (
    <SurfaceLink published={published} interactive={interactive} className={styles.module} href={href}>
      <span>{number}</span>
      <b>{title}</b>
      <small>{copy}</small>
    </SurfaceLink>
  );
}

function HeroTitle({ name }: { name: string }) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return <h1>{name}</h1>;
  const split = Math.ceil(words.length / 2);
  return (
    <h1>
      {words.slice(0, split).join(" ")}
      <br />
      <em>{words.slice(split).join(" ")}</em>
    </h1>
  );
}

function UnicaHome({
  config,
  palette,
  previewId,
  destination = { kind: "anteprima" },
  heroSrc = null,
  visuals = [],
  embedded = false,
  interactive = true,
  children,
}: SiteTemplateHomeProps) {
  const name = config.identity.name ?? "SENZA NOME";
  const published = destination.kind === "pubblicato";
  const Contenuto = embedded ? "div" : "main";
  const listenEnabled = isEnabled(config, "listen");
  const feedEnabled = isEnabled(config, "feed");
  const epkEnabled = isEnabled(config, "epk");
  const ribbon = visuals.slice(0, 5);

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
      <Topbar name={name} published={published} />

      <Contenuto id={`content-${previewId}`}>
        <section className={styles.hero}>
          {heroSrc === null ? (
            <div className={styles.heroFallback} aria-label="Visual principale segnaposto">
              <span>{name.slice(0, 2)}</span>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- URL mediato dalla route media.
            <img className={styles.heroImage} data-hero-image src={heroSrc} alt={`Visual principale di ${name}`} />
          )}
          <div className={styles.heroShade} aria-hidden="true" />
          <div className={styles.heroGrid} aria-hidden="true" />

          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>
              {config.identity.handle ? `@${config.identity.handle}` : config.identity.location ?? "ARCHIVIO / 0001"}
            </span>
            <div id={`preview-${previewId}`}>
              <HeroTitle name={name} />
            </div>
            {(config.identity.shortBio ?? config.identity.claim) && (
              <p className={styles.heroDescription}>{config.identity.shortBio ?? config.identity.claim}</p>
            )}
            <div className={styles.heroActions}>
              {listenEnabled && (
                <SurfaceLink published={published} interactive={interactive} className={styles.primaryCta} href={homeHref(destination, "listen", previewId)}>
                  ASCOLTA ORA
                </SurfaceLink>
              )}
              {feedEnabled && (
                <SurfaceLink published={published} interactive={interactive} className={styles.ghostCta} href={homeHref(destination, "feed", previewId)}>
                  APRI IL FEED
                </SurfaceLink>
              )}
            </div>
          </div>

          {config.identity.location && <div className={styles.coordinate}>{config.identity.location}</div>}
        </section>

        <section className={styles.moduleStrip} aria-label="Porte del sito">
          {listenEnabled && (
            <HomeModule published={published} interactive={interactive} number="01" title={sectionLabel(config, "listen")} copy="musica e release" href={homeHref(destination, "listen", previewId)} />
          )}
          {feedEnabled && (
            <HomeModule published={published} interactive={interactive} number="02" title={sectionLabel(config, "feed")} copy="visual e frammenti" href={homeHref(destination, "feed", previewId)} />
          )}
          {epkEnabled && (
            <HomeModule published={published} interactive={interactive} number="03" title={sectionLabel(config, "epk")} copy="bio, press e contatti" href={homeHref(destination, "epk", previewId)} />
          )}
        </section>

        <section className={styles.editorial}>
          <div className={styles.editorialHeading}>
            <span className={styles.eyebrow}>IDENTITÀ / A</span>
            <h2>{config.identity.claim ?? config.identity.shortBio ?? name}</h2>
          </div>
          <div className={styles.editorialCopy}>
            {config.identity.longBio && <p>{config.identity.longBio}</p>}
            {config.identity.location && <small>BASE / {config.identity.location}</small>}
          </div>
        </section>

        {(ribbon.length > 0 || heroSrc !== null) && (
          <section className={styles.visualRibbon} aria-label="Archivio visivo" tabIndex={0}>
            {(ribbon.length > 0 ? ribbon : [{ id: "hero", src: heroSrc!, alt: `Visual principale di ${name}`, caption: "HERO" }]).map((item, index) => (
              <figure key={item.id}>
                {/* eslint-disable-next-line @next/next/no-img-element -- route media revocabile. */}
                <img src={item.src} alt={item.alt} />
                <figcaption>{String(index + 1).padStart(2, "0")} / {item.caption ?? "VISUAL"}</figcaption>
              </figure>
            ))}
          </section>
        )}

        {children}
      </Contenuto>

      {published ? null : <PlayerShell artist={name} />}
      <HomeDock config={config} previewId={previewId} destination={destination} interactive={interactive} />
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
        const center = id === "epk";
        const className = `${styles.dockLink} ${center ? styles.dockCenter : ""}`;
        const content = <><Icon name={SURFACE_ICON[id]} /><span>{item.label}</span></>;
        return id === surface
          ? <span key={id} className={className} data-dock-center={center ? "true" : undefined} aria-current="page">{content}</span>
          : <Link key={id} className={className} data-dock-center={center ? "true" : undefined} href={item.href}>{content}</Link>;
      })}
    </nav>
  );
}

function SurfaceHeroMedia({ src, name, className }: { src: string | null; name: string; className?: string }) {
  return src === null ? (
    <div className={`${className} ${styles.surfaceHeroFallback}`} aria-hidden="true">
      <span>{name.slice(0, 2)}</span>
    </div>
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- route media revocabile.
    <img className={className} src={src} alt={`Visual di ${name}`} />
  );
}

function UnicaSurface({
  config,
  palette,
  surface,
  label,
  navigation,
  published,
  heroSrc = null,
  children,
}: SiteTemplateSurfaceProps) {
  const name = config.identity.name ?? "SENZA NOME";
  const handle = config.identity.handle ? `@${config.identity.handle}` : name;

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
      <Topbar name={name} published={published} />
      <main id={`contenuto-${surface}`} className={styles.surfaceContent}>
        {surface === "listen" ? (
          <section className={styles.listenLead}>
            <div className={styles.releaseCover}>
              <SurfaceHeroMedia src={heroSrc} name={name} className={styles.releaseCoverMedia} />
              <div className={styles.coverStamp}><BrandLockup name={name} /></div>
            </div>
            <div className={styles.releaseCopy}>
              <span className={styles.eyebrow}>RELEASE / ARCHIVIO</span>
              <h1>{label}</h1>
              {config.identity.shortBio && <p>{config.identity.shortBio}</p>}
              <div className={styles.releaseMeta}>
                <span>{config.identity.location ?? "IT"}</span>
                <span>{handle}</span>
                <span>SOURCE READY</span>
              </div>
            </div>
          </section>
        ) : surface === "feed" ? (
          <section className={styles.feedProfile}>
            <div className={styles.feedAvatar}>
              <SurfaceHeroMedia src={heroSrc} name={name} className={styles.feedAvatarMedia} />
            </div>
            <div className={styles.feedProfileCopy}>
              <span className={styles.eyebrow}>VISUAL FIELD</span>
              <h1>{handle}</h1>
              <h2>{name}</h2>
              {config.identity.shortBio && <p>{config.identity.shortBio}</p>}
              {config.identity.location && <small>{config.identity.location}</small>}
            </div>
          </section>
        ) : (
          <header className={styles.surfaceHead}>
            <span className={styles.eyebrow}>{handle}</span>
            <h1>{label}</h1>
            {config.identity.claim && <p>{config.identity.claim}</p>}
          </header>
        )}
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
