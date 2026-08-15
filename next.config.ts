import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /**
   * Il dev server serve i propri chunk anche a `127.0.0.1`.
   *
   * Senza questa riga Next 16 in sviluppo tratta `127.0.0.1` come origine
   * estranea e risponde **403** alle richieste dei chunk client: la pagina
   * arriva, l'HTML è completo, ma nessun componente `"use client"` viene
   * idratato. Non c'è un errore in pagina e non c'è niente in console che lo
   * spieghi — misurato sulla pagina di diagnostica EPK, a parità di tutto il
   * resto: 0 bottoni da `127.0.0.1`, 8 da `localhost`.
   *
   * `playwright.config.ts` usa `http://127.0.0.1:3000` come `baseURL`, quindi
   * senza questa voce ogni test che dipende dall'idratazione fallisce, e
   * fallisce in silenzio. I test del guscio passano solo perché axe non ha
   * bisogno di JavaScript: la trappola resterebbe armata per chiunque arrivi
   * dopo. Vale solo per `next dev`; in produzione la chiave è ignorata.
   */
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
