# AIDENTITY — Piano di esecuzione allineato

15/08/2026 · Documento operativo per agenti.
Leggere soltanto insieme a `L0.7-AIDENTITY-contratto-canonico.md`. L0, L0.5 e L0.6 sono storico e non sono input operativo.

---

## 0. Contratto di autonomia

Gli agenti:

- possono lavorare sul branch assegnato, committare, pushare, aprire PR, correggere la CI e aggiornare la propria PR;
- non possono mergiare `main`, scrivere su database ospitati, ampliare il filone, aggiungere dipendenze fuori allowlist o inserire segreti;
- modificano soltanto i file assegnati;
- aprono una issue per lavoro adiacente;
- si fermano se scoprono che il contratto PR-0 è insufficiente: niente duplicati, cast o aggiramenti.

Una PR = una preoccupazione. La CI verde significa “mergiabile”; il merge resta di Ray.

---

## 1. Cancello PR-0

Branch: `pr-0/contratto`.

PR-0 contiene esclusivamente:

- documenti canonici e istruzioni agenti;
- scaffold Next 16/React 19 senza UI di prodotto;
- tipi e validatori Zod;
- schema Supabase, migrazioni, grant, RLS, quote e invarianti;
- fixture locale/CI NVLL CLICK;
- CI, test unitari e pgTAP;
- pagina diagnostica minima per il controllo Playwright/axe.

Non contiene Stripe, upload, wizard, renderer, EPK o PDF.

### CI obbligatoria

1. `npm ci`;
2. unit test, typecheck, lint, build;
3. `supabase db reset` su stack locale pulito;
4. `supabase db lint --fail-on error`;
5. `supabase test db` con test schema/RLS;
6. Playwright + axe;
7. secret scan;
8. report diagnostici su fallimento.

### Test RLS minimi

- `anon` non legge `draft`, `pending_review` o `suspended`;
- `anon` legge soltanto il sito `published`;
- owner A non legge/scrive dati di owner B;
- una FK di A non può puntare a un'entità di B, nemmeno via ruolo privilegiato di test;
- il client non modifica pubblicazione, billing o usage;
- una config incompleta non può entrare in revisione né essere pubblicata;
- il platform admin legge tutto;
- approvazione/sospensione produce un evento audit;
- un recupero billing non rimuove un hold di moderazione;
- le proiezioni anonime non espongono owner, consenso, billing, usage o path privati;
- UPDATE ha sempre SELECT policy e `WITH CHECK`;
- quote foto, tracce upload e byte resistono a scritture concorrenti;
- embed illimitati non incrementano le quote.

PR-0 è accettata soltanto con CI verde e ricostruzione completa da zero. Nessun altro filone parte prima del merge.

---

## 2. Filoni dopo PR-0

### A — Guscio themable

Branch: `a/guscio`.

Porta da NVLL CLICK shell, dock, topbar, skip-link, player shell, PWA e token, ma li rende funzioni di `SiteConfig`. Tre famiglie SVG; quattro palette accessibili; tasto centrale `/epk`.

Accettazione:

- due config rendono identità nettamente diverse con lo stesso layout;
- WCAG AA sulle palette, misurato sui pixel resi con grana;
- manifest dinamico e axe pulito.

### B — Auth, billing e ciclo vita

Branch: `b/auth-billing`.

Magic link; Stripe test mode; prodotti BASE/PRO/MAX mensili e annuali; annuale BASE mostrato per primo; checkout, customer portal e webhook. Implementa la macchina degli stati L0.7, l'azione minima di moderazione, audit, disdetta, pagamento fallito/recuperato, downgrade senza cancellazione, avvisi 60/80 giorni e purge a 90.

Accettazione:

- ciclo Stripe test completo;
- nessuna chiave live;
- nessun client modifica gli stati;
- prima pubblicazione passa da `pending_review`;
- un sito già approvato si ripubblica senza seconda revisione;
- moderazione e lifecycle sono idempotenti e auditati.

### C — Wizard

Branch: `c/wizard`.

Identità → tema → contenuti → EPK. Salvataggio continuo. Upload privato con prenotazione atomica quota prima del trasferimento e riconciliazione dopo. “Aggiungi traccia” offre nello stesso passo upload o link embed. Preview owner e link temporaneo revocabile.

Accettazione:

- da account vuoto a draft completo senza istruzioni;
- nessuna race supera foto, tracce o byte;
- upload fallito rilascia la prenotazione;
- embed non tocca le quote.

### D — Renderer multi-tenant

Branch: `d/renderer`. Parte dopo merge di A.

Implementa `/[slug]` e le cinque superfici da Postgres; reserved slugs; SEO, sitemap, robots e schema.org `MusicGroup`/`Person`; player persistente per upload; iframe isolato per embed.

Accettazione:

- fixture NVLL CLICK resa da DB equivalente all'originale statico;
- draft/pending/suspended non disponibili ad anon;
- preview owner e token funzionanti;
- Lighthouse mobile almeno 90;
- un solo elemento `audio`.

### E — EPK e kit

Branch: `e/epk`.

Bio copiabili, contatti consentiti, link DSP/social, quote stampa, live passate/future, numeri manuali e zip foto. Usa `fflate`, senza introdurre altre dipendenze.

Accettazione:

- email e bio trovabili da telefono in meno di dieci secondi;
- nessun contatto senza consenso può essere pubblicato;
- zip MAX senza timeout e senza file di altro tenant.

### F — One-sheet PDF

Branch: `f/one-sheet`.

Route HTML A4 `/[slug]/one-sheet`, tre densità, token del sito; Chromium/Playwright produce il PDF soltanto dopo approvazione della preview web.

Accettazione:

- preview approvata da Ray;
- PDF fedele, accessibile e inferiore a 5 MB;
- nessun contenuto di un altro tenant.

---

## 3. Dipendenze e collisioni

```
PR-0 ──┬── A ── D
       ├── B
       ├── C
       ├── E
       └── F
```

- A e D: stesso agente oppure D parte dopo merge di A.
- C può usare tipi PR-0 ma aspetta i componenti di A; non li duplica.
- B, E e F non condividono file con altri filoni.
- Se due filoni devono toccare lo stesso file contrattuale, si ferma il lavoro e si apre una correzione dedicata.

Ogni agente riceve:

1. L0.7;
2. questo piano;
3. lista precisa di file consentiti;
4. test di accettazione del filone;
5. link in sola lettura alle sole sorgenti necessarie.

---

## 4. Demo Wagdi

Obiettivo: un artista reale arriva a un sito pubblicato con Stripe test.

Minimo:

- PR-0;
- A;
- B in test mode;
- C con percorso essenziale completo;
- D;
- E.

F può seguire, ma resta parte del prodotto BASE e non un upsell.
