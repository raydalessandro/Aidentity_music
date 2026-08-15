> **STORICO — non operativo.** Conservato per provenienza. Il contratto canonico è `../L0.7-AIDENTITY-contratto-canonico.md`; non consegnare questo file da solo agli agenti.

# AIDENTITY — Specifica L0

Stato: bozza per revisione Ray · 15/08/2026
Livello: L0 (cos'è, cosa è chiuso, cosa è fuori). L'implementazione sta nelle L1.

---

## 0. Cos'è

AIDENTITY è un builder self-service che trasforma i dati di un artista in un sito-PWA con press kit incluso, ospitato da noi.

**Un'app sola, multi-tenant: il sito di un cliente è una riga in Postgres, non un repo.**

Il nome lavora su tre livelli: *AI + identity* (identità costruita con l'AI, percepito: veloce), *AIdentity* (identità e basta), *Aid Entity* (entità di aiuto — cosa fa davvero per un artista che deve presentarsi).

**Origine.** Wagdi (67_ENT) gestisce i social di alcuni rapper. Le agenzie gli chiedono "una specie di curriculum, qualcosa da vedere" e lui non sa cosa dare. Quel documento nel gergo del settore si chiama **EPK** (electronic press kit). AIDENTITY lo produce, ma come sito vivo invece che come PDF.

**Contro cosa vende.** Linktree e Beacons fanno la versione povera (link-in-bio). Bandzoogle e Sonicbids fanno EPK, ma statici e datati. Il differenziale è che qui esce una PWA installabile, con player e catalogo, che si apre dal telefono di chi decide.

---

## 1. Decisioni chiuse

Queste non si ridiscutono in L1. Se una va riaperta, si riapre qui.

| # | Decisione |
|---|---|
| D1 | Multi-tenant, un deploy solo. Nessun repo e nessun deploy per cliente. |
| D2 | Il sito è **dati**. L'utente non scrive codice e non carica codice. |
| D3 | Abbonamento, non pagamento una tantum. L'hosting è ricorrente, il ricavo pure. |
| D4 | Draft gratuito. Si costruisce il sito, lo si vede, e si paga per pubblicarlo. |
| D5 | Supabase (Postgres + Auth + Storage) come unico backend. Vercel Pro come hosting. |
| D6 | Routing v1: `/[slug]`. Sottodomini wildcard e domini custom sono v2. |
| D7 | Cinque superfici. **La centrale è l'EPK.** |
| D8 | Video: colonne, storage e tipi predisposti, UI spenta. |
| D9 | Il gioco WORLD 00 non entra. |
| D10 | Nessun pannello admin: l'admin è Ray e usa il table editor di Supabase. |
| D11 | Stack Next 16 + React 19, dipendenze al minimo, come nei due repo d'origine. |

---

## 2. Da dove viene ogni pezzo

Il lavoro nuovo è meno di quanto sembri: le due estrazioni sono già la stessa app, e insieme coprono quasi tutta l'architettura. Questa tabella è la mappa per chiunque scriva codice.

| Capacità | Sorgente | File | Cosa si prende |
|---|---|---|---|
| Shell, dock a 5 slot, topbar, skip-link | NVLL_CLICK | `components/shell.tsx` | La struttura esatta: due voci a sinistra, **tasto centrale**, due a destra. Il tasto centrale cambia destinazione: da `/game` a `/epk`. |
| Token di tema | NVLL_CLICK | `app/styles/base.css` | Il blocco `:root` è già il punto di innesto della palette: `--ink --panel --paper --muted --dim --line --acid`. Diventano variabili per sito. |
| Contratto dati | NVLL_CLICK | `lib/catalog.ts` | `Track`, `Visual`, `MerchItem`, `site`, `artist` → tabelle quasi 1:1. È già lo schema, scritto in TypeScript. |
| PWA, manifest, offline, service worker | NVLL_CLICK | `app/manifest.ts`, `lib/use-pwa.ts`, `app/offline/page.tsx`, `public/sw.js` | Il manifest va reso dinamico per sito (nome, icone, theme color). |
| Player audio persistente fra le pagine | NVLL_CLICK | `components/player-provider.tsx`, `components/bottom-player.tsx` | Preso quasi com'è. |
| **Il pattern del renderer** | ISOLA_PROMO | `lib/canone.ts` + README | "Proiezione pubblica ridotta di un canone che vive fuori; il sito non dipende dal canone in build." È il multi-tenant scritto in anticipo: cambia solo che il canone diventa Postgres. |
| SEO, sitemap, robots, dati strutturati | ISOLA_PROMO | `app/sitemap.ts`, `app/robots.ts`, `components/dati-strutturati.tsx` | Da rendere per-sito. Lo schema.org va portato da `Book` a `MusicGroup` / `Person`. |
| Base URL dinamica | ISOLA_PROMO | `lib/base-url.ts` | Serve tale e quale per il multi-tenant. |
| Multi-tenant + RLS + runner di migrazioni | vista-gestionale (Supabase) | `aziende`, `utenti`, `_infra_migrazioni` | Si copia il **pattern**, non le tabelle: isolamento per tenant su ogni riga, RLS attiva ovunque, migrazioni idempotenti registrate a DB. |
| Qualità e CI | entrambi | `npm run check`, `e2e/*.spec.ts` con axe | `typecheck && lint && build` + Playwright con accessibilità. Si eredita il livello, non si riparte da zero. |
| Destinazione delle astrazioni | ear-lab-core | — | Quello che qui diventa generico risale lì. |

Quello che **non** esiste in nessuno dei due repo: i campi dell'EPK (§3). È l'unica superficie davvero nuova.

---

## 3. Le cinque superfici

Il dock di NVLL ha una forma precisa — due voci, **un tasto centrale più grande**, due voci — e quella forma è il prodotto. Lo slot centrale era il gioco. Adesso è l'EPK: il pezzo che vende sta al centro dello schermo, sempre a un pollice di distanza.

```
  FEED    LISTEN    [ EPK ]    MERCH    HOME
```

| Superficie | Route | Contenuto | Spegnibile |
|---|---|---|---|
| HOME | `/` | Hero: logo, nome, claim, visual principale, CTA | no |
| FEED | `/feed` | Griglia di immagini e post, con modale | sì |
| LISTEN | `/listen` | Catalogo tracce + player | sì |
| **EPK** | `/epk` | vedi sotto | no |
| MERCH | `/merch` | Render capi, senza acquisto | sì |

### L'EPK — cosa contiene

È la superficie progettata per chi decide (agenzia, booker, label), non per il fan.

- **Bio** in due formati: una riga e un paragrafo. Copiabili con un tap — è quello che un'agenzia incolla nel suo documento.
- **Contatti**: booking, management, stampa. Nome, ruolo, email. Con `mailto:`.
- **Link**: Spotify, Apple Music, YouTube, SoundCloud, Instagram, TikTok. Set chiuso di piattaforme note, ognuna con la sua icona.
- **Quote stampa**: testo, testata, data, URL. È la prova sociale.
- **Date live**: data, città, venue, link biglietti. Passate e future separate.
- **Scarica il kit**: foto in alta risoluzione in uno zip + one-sheet PDF.
- **Numeri** (opzionale): ascoltatori mensili, follower. Inseriti a mano in v1, non tirati dalle API.

---

## 4. Modello dati — la forma

DDL completo in L1. Qui la forma e le regole.

**Nuclei**

- `profiles` — estende `auth.users`. Un utente può possedere N siti (serve a Wagdi, che ne gestisce diversi).
- `sites` — `id`, `owner_id`, `slug` (unico, con lista di parole riservate), `status` (`draft` | `published` | `suspended`), `plan`, `stripe_customer_id`, `stripe_subscription_id`, `storage_used_bytes`.
- `site_config` — jsonb versionato: identità (nome, handle, claim, bio breve/lunga, luogo), tema (i 7 token + coppia tipografica + set icone + grana on/off), superfici accese e loro ordine, copy delle sezioni.

**Contenuti** — una tabella per tipo, tutte con `site_id` e `sort_order`:

`site_assets` (kind: `logo` | `visual` | `photo_hi` | `merch` | `video` ← predisposto, UI spenta) · `site_tracks` · `site_posts` · `site_links` · `site_press` · `site_dates` · `site_contacts`

**Regole non negoziabili**

1. RLS attiva su ogni tabella, sempre. Nessuna eccezione, nemmeno temporanea.
2. Scrittura: solo il proprietario del sito.
3. Lettura pubblica (`anon`): **solo** righe di siti con `status = 'published'`. Un draft non è indicizzabile né raggiungibile.
4. Lo `status` lo scrive **solo** il webhook Stripe, dal service role. Mai il client.
5. `storage_used_bytes` è un contatore reale, controllato prima di ogni upload. Il tetto di storage sta nel piano, non nella buona fede.

---

## 5. Il flusso

```
landing pubblica (esempi live: NVLL CLICK, Isola)
   ↓
magic link (Supabase Auth — nessuna password, nessuna UI da disegnare)
   ↓
wizard: identità → tema → contenuti → EPK
   ↓
/[slug] in draft, visibile solo a lui, condivisibile con link firmato
   ↓
checkout Stripe
   ↓
webhook → status = published
```

L'ordine conta: **prima costruiscono, poi pagano.** Chi ha già caricato le sue foto e scritto la sua bio converte molto meglio di chi vede un paywall all'ingresso.

---

## 6. Cosa può cambiare l'utente

Personalizzazione modulare, non libertà. È il prezzo del D1 ed è anche il motivo per cui il risultato resta bello.

**Sì:** i 7 token colore (color picker + 4 palette preset che funzionano di sicuro) · coppia tipografica da un set chiuso · **set di icone SVG: 3 famiglie intercambiabili** · grana on/off · quali superfici accese e in che ordine · tutto il copy · tutti i contenuti e il loro ordine.

**No:** layout, componenti, CSS libero, HTML libero, JS.

Le 3 famiglie di icone sono la leva di personalizzazione percepita più alta a costo più basso: sono ~8 SVG per famiglia, disegnati una volta, e cambiano completamente il carattere del sito.

---

## 7. Fuori dalla v1

Video (predisposto, spento) · domini custom e sottodomini · il gioco · merch con acquisto · numeri tirati dalle API delle piattaforme · analytics per il cliente · più lingue per sito · team con più editor sullo stesso sito · marketplace di temi.

---

## 8. Vincoli e rischi

**Vercel Hobby vieta l'uso commerciale** — qualsiasi deployment legato a un ricavo richiede Pro. Il fondo fisso è quindi Vercel Pro + Supabase Pro. Sono cifre basse e note, la loro dimensione non è il problema; il punto è che vanno pagate dal giorno uno, non quando arrivano i clienti.

**Il costo che scala non è il numero di clienti, è l'egress.** Un artista che va bene serve musica e immagini a molte persone. Dieci clienti fermi costano meno di uno che funziona. Da qui: tetto di storage per piano **scritto nello schema dalla prima migrazione**, e file serviti da Supabase Storage con cache lunga, non da Vercel.

**Slug.** Lista di parole riservate (`api`, `admin`, `app`, `login`, `_next`, `epk`, `assets`…) e blocco dei nomi di artisti noti. Uno slug pubblicato non si cambia più senza redirect.

**Contenuti di terzi.** Un EPK pubblica email di booking e nomi di persone che non hanno firmato niente. Serve una spunta esplicita in fase di inserimento contatti.

**Fine abbonamento.** Il sito torna `draft` (non cancellato, non 404: pagina "non più disponibile"). I dati restano N mesi, poi si avvisa. N va deciso.

---

## 9. Piano branch / PR

Il collo di bottiglia non è chi scrive, è che tutti scrivano contro lo stesso contratto.

**PR-0 — Il contratto.** Contiene *solo*: tipi TypeScript (`SiteConfig`, `Track`, `Link`, `PressQuote`, `LiveDate`, `Contact`, `Asset`), validazione, migrazioni SQL con RLS, dati di esempio (NVLL CLICK come sito seed). Nessuna UI, nessuna logica. **Blocca tutto il resto e va mergiata per prima.**

Poi, in parallelo:

| Filone | Cosa | Dipende da | Candidato |
|---|---|---|---|
| **A** | Guscio themable: shell, dock, token da config, 3 famiglie di icone | PR-0 | Manus — ha già studiato questi repo |
| **B** | Auth (magic link) + Stripe + webhook + gestione stato | PR-0 | |
| **C** | Wizard del builder (form + upload su Storage + contatore) | PR-0, tipi di A | |
| **D** | Renderer `/[slug]`: le 5 superfici che leggono da Postgres | PR-0, A | |
| **E** | La superficie EPK: componenti, schema.org, generazione one-sheet | PR-0 | |

A e D si toccano: stesso autore, o A completamente mergiata prima di D. B, C ed E non si toccano con nessuno.

Regola invariata: branch → preview → PR → merge, una preoccupazione per PR, mai direttamente su main.

---

## 10. Da chiudere prima della L0.5

1. **Prezzo e fasce.** Una fascia sola o due? Il tetto di storage per fascia va deciso qui, perché entra nella prima migrazione.
2. **Wagdi è un utente o un rivenditore?** Lo schema regge già un login con N siti. La domanda è la fatturazione: paga lui per tutti i suoi artisti, o ogni artista per sé? Cambia Stripe, non il database.
3. **One-sheet PDF: generato o caricato?** Generarlo è il differenziale vero (nessuno lo fa bene) ed è un filone in più. Caricarlo costa zero.
4. **N mesi di conservazione dopo la disdetta.**
5. **Lingua.** UI in italiano; i siti generati in italiano, inglese, o scelta per sito?
6. **Moderazione.** Cosa succede se qualcuno pubblica roba che non vogliamo ospitare sul nostro dominio.

