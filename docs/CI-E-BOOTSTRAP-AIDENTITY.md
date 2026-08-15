# AIDENTITY — CI e bootstrap del repo

15/08/2026 · Da leggere insieme a `ci.yml` (stessa cartella).

---

## 1. Il problema del primo commit

L'idea è giusta: repo su GitHub con la CI già attiva, poi gli agenti lavorano dentro il cancello. Ma c'è una trappola.

**Un workflow su un repo vuoto va rosso al primo colpo.** Non c'è `package.json`, non c'è `npm run check`, non c'è `supabase/`. E un `main` rosso dal giorno uno rompe l'unica cosa su cui poggia l'autonomia degli agenti: *verde = mergiabile*. Se il rosso diventa lo stato normale, nessuno lo guarda più — e a quel punto la CI non è un cancello, è un rumore.

Quindi il primo commit non è solo la CI. È **il minimo che rende la CI verde su un repo ancora vuoto.**

## 2. Il commit di bootstrap

Direttamente su `main`, una volta sola, prima di aprire qualsiasi branch.

```
.github/workflows/ci.yml        ← il file ci.yml di questa cartella
package.json                    ← con lo script "check"
tsconfig.json
next.config.ts
eslint.config.mjs
app/layout.tsx                  ← pagina minima, serve solo a far passare il build
app/page.tsx
supabase/config.toml            ← generato da `supabase init`
supabase/migrations/            ← vuota
supabase/seed.sql               ← vuoto
docs/
  L0-AIDENTITY.md
  L0.5-AIDENTITY-decisioni.md
  L0.6-AIDENTITY-tracce-e-limiti.md
  L0.7-AIDENTITY-contratto-canonico.md
  PIANO-ESECUZIONE-AIDENTITY.md
  PR-0-DATABASE-DESIGN.md
README.md                       ← indice dei documenti e ordine di lettura
```

Lo script che tiene insieme tutto, da `NVLL_CLICK/package.json`:

```json
"check": "tsc --noEmit && next lint && next build"
```

Con `supabase init` già fatto, il job `db` gira dal primo commit: applica zero migrazioni a un database vuoto, e passa. Da PR-0 in poi le stesse identiche righe di workflow diventano il test vero, senza toccare il file.

Il job `e2e` resta spento da solo finché non esiste la cartella `e2e/` (guardia `hashFiles`), quindi non serve ricordarsi di accenderlo: si accende quando il filone D porta i test.

## 3. I quattro job

| Job | Cosa verifica | Attivo da |
|---|---|---|
| `app` | typecheck, lint, build | bootstrap |
| `db` | ricostruzione da zero, lint schema, pgTAP, nessuna deriva fra schema e migrazioni | bootstrap (vuoto), reale da PR-0 |
| `e2e` | Playwright + axe sulle superfici pubbliche | quando esiste `e2e/` |
| `secrets` | chiavi Stripe live, webhook secret, JWT nel diff | bootstrap |

Il passo che conta più di tutti è **`supabase db reset`**: ricostruisce lo schema dal nulla a ogni PR. È più severo di un controllo contro un database ospitato, perché non lascia sopravvivere niente che sia stato applicato a mano una volta e mai più scritto in una migrazione. È il modo in cui la regola R1 ("il DB lo scrive la CI") smette di essere una buona intenzione e diventa una cosa verificata.

L'ultimo passo del job `db` (`db diff` vuoto) chiude il cerchio: se qualcuno tocca lo schema senza scriverlo in una migrazione, la CI se ne accorge.

## 4. Protezione di `main`

Senza questa, la CI è un suggerimento. Da impostare subito dopo il bootstrap:

- **Require a pull request before merging** — nessun push diretto su `main`, per nessuno
- **Require status checks to pass**: `App`, `Database`, `Segreti` (aggiungere `E2E e accessibilità` quando esiste)
- **Require branches to be up to date before merging**
- **Block force pushes** e **restrict deletions**
- Nessuna approvazione richiesta: il revisore sei tu e mergi tu

## 5. Il permesso degli agenti

Perché possano pushare in autonomia senza poter fare danni, un **fine-grained PAT limitato a questo solo repo**:

- `Contents: Read and write` — creare branch e committare
- `Pull requests: Read and write` — aprire e aggiornare PR
- `Actions: Read` — leggere l'esito della CI e reagire
- **niente** `Administration`, **niente** `Secrets`, **niente** bypass della protezione

Così un agente può fare tutto il suo lavoro e non può mergiare, non può cambiare le regole del cancello, e non può toccare i segreti del repo.

## 6. Segreti del repo

In v1 la CI non ne ha bisogno: gira tutto su stack locale effimero. Quando arriveranno (Stripe test, Supabase), vanno in *Environments* con le regole di accesso, non in *Repository secrets* — così un workflow su una PR da branch non li vede.
