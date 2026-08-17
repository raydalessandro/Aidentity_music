import type { ReactNode } from "react";

import { PlayerBar, PlayerProvider } from "@/app/[slug]/player-provider";
import { paletteVars } from "@/components/site-shell/style";
import { siteConfigDraftSchema } from "@/lib/contract";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { paletteForDraft } from "@/lib/wizard/palette";

import styles from "@/app/[slug]/site-runtime.module.css";

/**
 * Lo stesso guscio del sito pubblicato, e **gli stessi componenti**: il provider vive nel
 * layout perché l'unico `<audio>` non venga rimontato passando da una superficie all'altra,
 * e il wrapper porta la palette del tenant sopra `PlayerBar`, che è fratello della pagina e
 * quindi non eredita le variabili dichiarate dentro il template.
 *
 * Non è una copia del layout pubblicato: sono gli stessi due componenti importati. Se un
 * giorno il player cambia, cambia in tutti e due i posti insieme — che è il punto di
 * «l'anteprima è il sito».
 */
export default async function OwnerPreviewLayout({
  children,
  params,
}: {
  readonly children: ReactNode;
  readonly params: Promise<{ readonly siteId: string }>;
}) {
  const { siteId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("site_config")
    .select("config")
    .eq("site_id", siteId)
    .maybeSingle();

  const parsed = siteConfigDraftSchema.safeParse(data?.config);
  const palette = parsed.success ? paletteVars(paletteForDraft(parsed.data)) : undefined;

  return (
    <div className={styles.runtime} style={palette}>
      <PlayerProvider>
        {children}
        <PlayerBar />
      </PlayerProvider>
    </div>
  );
}
