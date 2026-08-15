# AIDENTITY — Documentazione

Questa cartella contiene i documenti che governano il lavoro sul repository. Il **contratto canonico** e il **piano di esecuzione** sono gli input operativi; la directory `history/` conserva esclusivamente le fonti che hanno preceduto il contratto consolidato.

## Ordine di lettura operativo

| Ordine | Documento | Ruolo |
|---:|---|---|
| 1 | [`L0.7-AIDENTITY-contratto-canonico.md`](./L0.7-AIDENTITY-contratto-canonico.md) | Contratto canonico congelato per PR-0. |
| 2 | [`PIANO-ESECUZIONE-AIDENTITY.md`](./PIANO-ESECUZIONE-AIDENTITY.md) | Piano, filoni, dipendenze e limiti di autonomia. |
| 3 | [`PR-0-DATABASE-DESIGN.md`](./PR-0-DATABASE-DESIGN.md) | Progetto del database per il cancello PR-0. |
| 4 | [`CI-E-BOOTSTRAP-AIDENTITY.md`](./CI-E-BOOTSTRAP-AIDENTITY.md) | Requisiti del bootstrap e della CI. |

## Documenti storici

I file sottostanti restano consultabili soltanto per **provenienza**. Non sostituiscono il contratto L0.7 e non sono input operativo per le nuove attività.

| Documento | Collocazione |
|---|---|
| L0 iniziale | [`history/L0-AIDENTITY.md`](./history/L0-AIDENTITY.md) |
| Decisioni L0.5 | [`history/L0.5-AIDENTITY-decisioni.md`](./history/L0.5-AIDENTITY-decisioni.md) |
| Tracce e limiti L0.6 | [`history/L0.6-AIDENTITY-tracce-e-limiti.md`](./history/L0.6-AIDENTITY-tracce-e-limiti.md) |

> Il file sorgente `ci.yml` resta fuori da questo commit documentale: va collocato in `.github/workflows/ci.yml` solo insieme allo scaffold di bootstrap necessario a farlo passare in CI.

## Checklist del commit documentale

| Stato | Percorso |
|---|---|
| Presente | `docs/README.md` |
| Presente | `docs/L0.7-AIDENTITY-contratto-canonico.md` |
| Presente | `docs/PIANO-ESECUZIONE-AIDENTITY.md` |
| Presente | `docs/PR-0-DATABASE-DESIGN.md` |
| Presente | `docs/CI-E-BOOTSTRAP-AIDENTITY.md` |
| Presente | `docs/history/L0-AIDENTITY.md` |
| Presente | `docs/history/L0.5-AIDENTITY-decisioni.md` |
| Presente | `docs/history/L0.6-AIDENTITY-tracce-e-limiti.md` |
