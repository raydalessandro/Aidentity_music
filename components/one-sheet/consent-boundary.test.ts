/**
 * Il confine del consenso della one-sheet, verificato eseguendo il compilatore.
 *
 * Perché non basta un test a runtime: `prepareOneSheet` scarta già le righe che *portano* il
 * campo del consenso, e quel controllo ha i suoi casi in `model.test.ts`. Ma il tipo
 * `consent_confirmed_at?: never` difende un'altra cosa — che certo codice **non compili**, cioè
 * che una riga di `site_contacts` non possa nemmeno essere passata alla composizione del foglio.
 * Misurato: togliendo i due campi `?: never` da `model.ts`, i 490 test del repository restavano
 * tutti verdi e il typecheck restava a zero errori. Un invariante senza modo di diventare rosso
 * non è un invariante, è un commento.
 *
 * `consent-boundary.probe.ts` marca con `@ts-expect-error` le righe che devono fallire, il che
 * rende rosso `npm run typecheck` se una di loro tornasse valida — ma è una prova al negativo:
 * dice che il compilatore si è lamentato, non *di che cosa*. Qui si toglie la marcatura e si
 * guarda l'esito vero, riga per riga e codice per codice.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const probePath = join(here, "consent-boundary.probe.ts");
/** Vive accanto alla sonda perché deve risolvere gli stessi import relativi. Si cancella dopo. */
const generatedPath = join(here, "consent-boundary.generated.ts");

/** I casi che devono fallire, nell'ordine in cui compaiono nella sonda. */
const mustNotCompile = [
  {
    binding: "tableRowIsContact",
    because: "una riga di site_contacts assegnata all'elenco dei contatti del foglio",
  },
  {
    binding: "tableRowEntersPrepare",
    because: "la stessa riga passata a prepareOneSheet",
  },
  {
    binding: "forgedConsent",
    because: "consent_confirmed_at riattaccato a mano a una riga di render",
  },
  {
    binding: "forgedConsentBy",
    because: "consent_confirmed_by riattaccato a mano a una riga di render",
  },
] as const;

/** I casi che devono compilare: senza di loro il confine sarebbe solo un muro. */
const mustCompile = ["projectionIsContact", "projectionEntersPrepare"] as const;

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
 * Non si usa `-p tsconfig.json` di proposito: compilerebbe l'intero progetto e mescolerebbe a
 * questa misura errori che non le appartengono. Stesse opzioni della sonda gemella del filone E
 * (`components/epk/contact-boundary.test.ts`): la misura deve essere confrontabile.
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

  return [...output.matchAll(/consent-boundary\.generated\.ts\((\d+),\d+\): error (TS\d+): (.*)/g)].map(
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

describe("il confine del consenso della one-sheet lo fa rispettare il compilatore", () => {
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

  /**
   * Il rifiuto dev'essere quello del confine, non un errore qualunque che capita sulla stessa
   * riga. È anche la parte che distingue il presidio vero dalla sua imitazione: se i due campi
   * `?: never` sparissero, la riga forgiata verrebbe comunque rifiutata — ma come «proprietà
   * sconosciuta» (TS2353), che è un rifiuto che si aggira riscrivendo l'assegnazione senza
   * letterale. Qui si pretende TS2322, cioè che sia il **tipo** a dire di no.
   */
  it("il rifiuto è quello del confine, non un errore qualunque", () => {
    const byLine = new Map(diagnostics.map((entry) => [entry.line, entry]));
    const at = (binding: string) => byLine.get(positions.get(binding) ?? -1);

    const riga = at("tableRowIsContact");
    expect(riga?.code, "assegnazione rifiutata dal tipo").toBe("TS2322");
    expect(riga?.message).toContain("ContactTableRowShape");
    expect(riga?.message).toContain("OneSheetContact");

    for (const binding of ["forgedConsent", "forgedConsentBy"]) {
      expect(at(binding)?.code, `${binding}: il campo è vietato dal tipo, non sconosciuto`).toBe(
        "TS2322",
      );
    }
  });
});
