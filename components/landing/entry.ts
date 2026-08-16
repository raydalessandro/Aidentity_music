/**
 * L'indirizzo della porta d'ingresso, in un modulo senza JSX e senza dipendenze.
 *
 * Vive qui e non in `Landing.tsx` perche' lo leggono in tre: il componente, il
 * banco unitario e la spec Playwright — e quest'ultima non puo' importare un
 * modulo che tira dentro `next/link`. Finche' la costante stava nel componente,
 * la spec e2e ne teneva una copia inchiodata a mano, e infatti al primo
 * cambiamento e' andata rossa: il valore era passato a `/signup` in due posti su
 * tre. Due sorgenti di verita' per lo stesso indirizzo sono lo stesso difetto
 * che il dock aveva fra `SurfaceDock` e `SurfaceNav`.
 *
 * L'ingresso porta alla REGISTRAZIONE e non all'accesso: chi arriva per la prima
 * volta un account non ce l'ha, e mandarlo su `/login` gli chiederebbe una
 * password che non ha mai scelto. Da `/signup` si raggiunge `/login` in un clic,
 * con `next` conservato; il contrario costava un passaggio in piu' a tutti.
 */
export const LANDING_ENTRY_HREF = "/signup?next=/app/wizard";
