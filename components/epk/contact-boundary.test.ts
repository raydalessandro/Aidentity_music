/**
 * Il confine fra riga di tabella e riga di render, verificato eseguendo il compilatore.
 *
 * Perché serve un test che chiama `tsc` invece di uno che monta un componente: l'invariante da
 * dimostrare è che **certo codice non compili**, e nessun test a runtime può osservare codice
 * che non esiste. `contact-boundary.probe.ts` marca quelle righe con `@ts-expect-error`, il che
 * rende rosso `npm run typecheck` se una di loro tornasse valida — ma è una prova al negativo:
 * dice che il compilatore si è lamentato, non *di che cosa*.
 *
 * Qui si toglie la marcatura e si guarda l'esito vero. Il test pretende che gli errori cadano
 * **esattamente** sulle quattro righe che devono fallire e su nessun'altra: la seconda metà
 * conta quanto la prima, perché un confine si può rompere in due modi opposti — lasciando
 * passare una riga di tabella, o irrigidendo i tipi al punto che nemmeno le righe di
 * `public_contacts` entrano più, che rimetterebbe in piedi l'adattatore che questa PR toglie.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const probePath = join(here, "contact-boundary.probe.ts");
/** Vive accanto alla sonda perché deve risolvere gli stessi import relativi. Si cancella dopo. */
const generatedPath = join(here, "contact-boundary.generated.ts");

/** I casi che devono fallire, nell'ordine in cui compaiono nella sonda. */
const mustNotCompile = [
  {
    binding: "tableRowsIntoComponent",
    because: "una riga di site_contacts passata direttamente a EpkContacts",
  },
  {
    binding: "tableRowsIntoRenderable",
    because: "la stessa riga passata a renderableContacts",
  },
  {
    binding: "projectionIntoBridge",
    because: "una riga di public_contacts ri-giudicata sul consenso che non porta",
  },
  {
    binding: "forgedConsent",
    because: "consent_confirmed_at riattaccato a mano a una riga di render",
  },
] as const;

/** I casi che devono compilare: senza di loro il confine sarebbe solo un muro. */
const mustCompile = [
  "projectionRendersDirectly",
  "projectionIsRenderable",
  "bridgedRendersDirectly",
] as const;

/**
 * Copia della sonda senza le direttive di soppressione, con la posizione di ogni binding.
 * Le righe si contano sul testo generato, non su quello della sonda: togliere le direttive
 * sposta tutto ciò che sta sotto.
 */
function generateProbe(): Map<string, number> {
  const kept = readFileSync(probePath, "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("// @ts-expect-error"));

  writeFileSync(generatedPath, kept.join("\n"), "utf8");

  const positions = new Map<string, number>();
  kept.forEach((line, index) => {
    const match = /^export const (\w+)/.exec(line);
    if (match?.[1] !== undefined) positions.set(match[1], index + 1);
  });
  return positions;
}

type Diagnostic = { line: number; code: string; message: string };

/**
 * `tsc` sul solo file generato, con le opzioni di `tsconfig.json` che contano per questa misura.
 * Non si usa `-p tsconfig.json` di proposito: compilerebbe l'intero progetto e mescolerebbe
 * a questa misura errori che non le appartengono.
 */
function typecheck(): Diagnostic[] {
  let output = "";
  try {
    execFileSync(
      "npx",
      [
        "tsc",
        "--noEmit",
        // TS6 rifiuta di compilare file elencati a riga di comando se esiste un tsconfig.json.
        "--ignoreConfig",
        "--strict",
        "--noUncheckedIndexedAccess",
        "--target",
        "ES2022",
        "--module",
        "esnext",
        "--moduleResolution",
        "bundler",
        "--jsx",
        "react-jsx",
        "--lib",
        "dom,dom.iterable,esnext",
        "--skipLibCheck",
        "--esModuleInterop",
        generatedPath,
      ],
      { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    // `tsc` esce con stato diverso da zero quando trova errori: è l'esito atteso, non un guasto.
    output = String((error as { stdout?: string }).stdout ?? "");
  }

  return [...output.matchAll(/contact-boundary\.generated\.ts\((\d+),\d+\): error (TS\d+): (.*)/g)].map(
    (match) => ({
      line: Number(match[1]),
      code: match[2] ?? "",
      message: match[3] ?? "",
    }),
  );
}

const positions = generateProbe();
const diagnostics = typecheck();

afterAll(() => {
  rmSync(generatedPath, { force: true });
});

describe("il confine fra EpkContactRecord e EpkContact lo fa rispettare il compilatore", () => {
  it("la sonda dichiara tutti i binding che questo test misura", () => {
    // Se un binding venisse rinominato nella sonda, il test misurerebbe il nulla passando.
    for (const name of [...mustNotCompile.map((entry) => entry.binding), ...mustCompile]) {
      expect(positions.has(name), `binding assente dalla sonda: ${name}`).toBe(true);
    }
    expect(diagnostics.length, "nessun errore raccolto: tsc non ha misurato niente").toBeGreaterThan(
      0,
    );
  });

  it.each(mustNotCompile)("$binding non compila ($because)", ({ binding }) => {
    const line = positions.get(binding);
    expect(diagnostics.map((entry) => entry.line)).toContain(line);
  });

  it.each(mustCompile)("%s compila: le righe di public_contacts entrano senza adattatori", (binding) => {
    const line = positions.get(binding);
    expect(diagnostics.map((entry) => entry.line)).not.toContain(line);
  });

  it("nessun errore fuori dalle quattro righe attese", () => {
    const expected = mustNotCompile
      .map((entry) => positions.get(entry.binding))
      .sort((left, right) => (left ?? 0) - (right ?? 0));
    const actual = [...new Set(diagnostics.map((entry) => entry.line))].sort(
      (left, right) => left - right,
    );
    expect(actual, `diagnostici: ${JSON.stringify(diagnostics)}`).toEqual(expected);
  });

  it("il rifiuto è quello del confine, non un errore qualunque", () => {
    const byLine = new Map(diagnostics.map((entry) => [entry.line, entry]));
    const at = (binding: string) => byLine.get(positions.get(binding) ?? -1);

    // Il caso che protegge il wizard del filone C: la riga di tabella nel componente.
    const componente = at("tableRowsIntoComponent");
    expect(componente?.code, "assegnazione di prop rifiutata").toBe("TS2322");
    expect(componente?.message).toContain("EpkContactRecord");
    expect(componente?.message).toContain("EpkContact");

    // La direzione opposta: il ponte pretende un campo che la riga di render non ha.
    const ponte = at("projectionIntoBridge");
    expect(ponte?.code, "argomento rifiutato").toBe("TS2345");
    expect(ponte?.message).toContain("EpkContactRecord");
  });
});
