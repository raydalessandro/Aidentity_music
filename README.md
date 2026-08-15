# AIDENTITY

Builder self-service che trasforma i dati di un artista in un sito-PWA con press kit (EPK) e
one-sheet PDF, ospitato da noi.

**Un'app, un deploy, molti siti.** Il sito di un cliente è un insieme di righe in Postgres, non un
repo e non un deploy separato.

## Stato

Bootstrap. Nessuna interfaccia di prodotto: c'è lo scaffold, la CI e i documenti. Il lavoro vero
comincia con `pr-0/contratto`, che blocca tutti gli altri filoni.

## Comandi

```bash
npm install
npm run dev        # sviluppo
npm run check      # typecheck + lint + test + build  (lo stesso che gira in CI)
npx supabase start # stack locale (richiede Docker)
npx supabase db reset
npx supabase test db
```

## Struttura

```
app/                 scaffold Next, solo pagina diagnostica
supabase/            config, migrazioni, seed, test pgTAP
docs/                specifica canonica e piano di esecuzione
.github/workflows/   la CI
AGENTS.md            regole per chi lavora qui — leggere per prime
```

## Prima di scrivere una riga

Leggi `AGENTS.md`, poi `docs/L0.7-AIDENTITY-contratto-canonico.md`.
