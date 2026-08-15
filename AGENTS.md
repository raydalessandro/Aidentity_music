# AGENTS.md — regole per chi lavora su questo repo

Vale per ogni agente (Manus, Claude Code, ChatGPT e successori) e per ogni essere umano.

## Il contratto di autonomia

**Puoi**, senza chiedere: creare branch, committare, pushare, aprire PR, leggere l'esito della CI,
correggere la tua PR finché non è verde.

**Non puoi**, mai:

- mergiare su `main` — il merge è di Ray;
- scrivere sul database fuori da una migrazione versionata;
- toccare file fuori dal tuo filone;
- aggiungere dipendenze non elencate nella §7 di `docs/L0.7-AIDENTITY-contratto-canonico.md`;
- inserire chiavi, token o segreti nel repo, nemmeno finti, nemmeno in `.env.example`;
- indebolire un test o una policy RLS per far passare la CI.

**Una PR, una preoccupazione.** Se durante il lavoro emerge qualcosa di adiacente, apri una issue.
Non allargare la PR.

**Se ti serve cambiare qualcosa che sta in PR-0: fermati e chiedi.** Non duplicare il tipo, non
fare un cast, non aggirare il vincolo. Un contratto aggirato una volta smette di essere un
contratto.

## Il cancello

La CI gira su ogni PR ed è l'unico giudice automatico. Verde non significa mergiato: significa
mergiabile.

Il passo che porta il peso è `supabase db reset`: lo schema si ricostruisce **dal nulla** a ogni
PR. Se una cosa non è scritta in una migrazione, non esiste.

Se un test RLS fallisce, la risposta non è allentare la policy. La risposta è aggiustare il codice.
Un test RLS che passa perché la policy è stata aperta è peggio di un test rosso, perché smette di
dire la verità.

## Ordine di lettura

1. `docs/L0.7-AIDENTITY-contratto-canonico.md` — **la fonte normativa.** Se qualcosa contraddice
   questo documento, vince questo documento (emendamenti in §12).
2. `docs/PIANO-ESECUZIONE-AIDENTITY.md` — filoni, dipendenze, criteri di accettazione.
3. `docs/PR-0-DATABASE-DESIGN.md` — la revisione tecnica prima del DDL.
4. `docs/CI-E-BOOTSTRAP-AIDENTITY.md` — com'è fatto il cancello.

`docs/history/` contiene L0, L0.5 e L0.6: servono solo a capire da dove viene una decisione, non a
prendere decisioni.

## Canale

Se qualcosa non torna e non è risolvibile dentro il contratto, **fermati e chiedi**. Non indovinare.
Il canale di comunicazione fra Ray, Claude e gli agenti è la cartella Drive del progetto.
