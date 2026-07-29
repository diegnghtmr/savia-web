import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const root = resolve(import.meta.dirname, "..");
const execFileAsync = promisify(execFile);
const read = (path: string) => readFile(resolve(root, path), "utf8");

// The design authority lives in the savia-general planning repository, which is
// never pushed and which savia-web does not track. CI clones savia-web alone,
// so it can only validate the constants committed here and the identity of the
// vendored token artifact those constants describe.
const DESIGN_AUTHORITY = {
  revision: "8511cc30ac0eded6e7c0c6570d8811a2ae5ce62d",
  path: "docs/savia/DESIGN.md",
  sha256: "967ef4d28132f298995541089a25da6c37bac45411401646b27700f6d69e1ff8",
  bytes: 21377,
  colorCount: 32,
};
const VENDORED_TOKENS_PATH = "design/savia-tokens.json";
const CI_LIMITATION =
  "Web CI cannot access, authenticate, or independently re-hash this local source; it validates only these committed constants and vendored token identity.";

interface CssBinding {
  selector: string;
  variables: Record<string, string>;
}

interface VendoredTokens {
  colors: Record<string, string>;
  cssBindings: Record<string, CssBinding>;
}

const sha256 = (content: string) =>
  createHash("sha256").update(content).digest("hex");

// A claim that CI verifies the upstream authority would be false: the file is
// not in this repository. Assert the honest wording is never contradicted.
const claimsCiCanVerifyAuthority = (content: string) =>
  /web\s+ci\s+(?:can|will|does|has|is able to)\b[^\n]{0,120}\b(?:access|authenticate|re-?hash|verify)\b/i.test(
    content,
  );

const findCopiedAuthority = async (directory: string): Promise<string[]> => {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if ([".git", ".next", "node_modules"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await findCopiedAuthority(path)));
      continue;
    }
    if (!entry.isFile()) continue;
    const bytes = await readFile(path);
    if (
      bytes.length === DESIGN_AUTHORITY.bytes &&
      createHash("sha256").update(bytes).digest("hex") ===
        DESIGN_AUTHORITY.sha256
    ) {
      found.push(path);
    }
  }
  return found;
};

// Reads one CSS rule block and returns every `--savia-*` custom property it
// declares. Values are lowercased so the authority's uppercase hex notation and
// the stylesheet's lowercase notation compare as equal.
const declaredTokens = (styles: string, selector: string) => {
  const opening = `${selector} {`;
  const start = styles.indexOf(opening);
  if (start === -1) {
    throw new Error(`globals.css declares no "${selector}" rule`);
  }
  const end = styles.indexOf("}", start);
  if (end === -1) throw new Error(`globals.css never closes "${selector}"`);
  const block = styles.slice(start + opening.length, end);
  return Object.fromEntries(
    [...block.matchAll(/(--savia-[a-z-]+)\s*:\s*([^;]+);/g)].map(
      ([, name, value]) => [name, value.trim().toLowerCase()],
    ),
  );
};

describe("the Savia visual contract", () => {
  it("records the design authority it was vendored from without claiming CI can re-hash it", async () => {
    const rawProvenance = await read("design/provenance.json");
    const rawTokens = await read(VENDORED_TOKENS_PATH);
    const provenance = JSON.parse(rawProvenance);
    const tokens: VendoredTokens = JSON.parse(rawTokens);

    expect(provenance.designAuthority).toEqual(DESIGN_AUTHORITY);
    expect(provenance.webCi?.designAuthorityAccess).toBe(CI_LIMITATION);
    expect(provenance.vendoredTokens).toEqual({
      path: VENDORED_TOKENS_PATH,
      sha256: sha256(rawTokens),
      colorCount: Object.keys(tokens.colors).length,
    });
    expect(Object.keys(tokens.colors)).toHaveLength(
      DESIGN_AUTHORITY.colorCount,
    );
    expect(claimsCiCanVerifyAuthority(rawProvenance)).toBe(false);
    expect(claimsCiCanVerifyAuthority(rawTokens)).toBe(false);
    // savia-web vendors constants, never a copy of the planning source itself.
    expect(await findCopiedAuthority(root)).toEqual([]);
  });

  it("declares every vendored token, in both themes, with the authority's exact value", async () => {
    const styles = await read("src/app/globals.css");
    const tokens: VendoredTokens = JSON.parse(await read(VENDORED_TOKENS_PATH));

    const byTheme = <T>(map: (binding: CssBinding, theme: string) => T) =>
      Object.fromEntries(
        Object.entries(tokens.cssBindings).map(([theme, binding]) => [
          theme,
          map(binding, theme),
        ]),
      );
    const expected = byTheme((binding, theme) =>
      Object.fromEntries(
        Object.entries(binding.variables).map(([variable, token]) => {
          const value = tokens.colors[token];
          if (!value)
            throw new Error(`${theme} binds unknown token "${token}"`);
          return [variable, value.toLowerCase()];
        }),
      ),
    );

    // Both themes are compared in one assertion so the diff reports every
    // missing, extra, and drifted custom property by name at once: a single
    // wrong hex fails this test and identifies itself.
    expect(
      byTheme((binding) => declaredTokens(styles, binding.selector)),
    ).toEqual(expected);

    // Every vendored color must reach the stylesheet through some binding;
    // otherwise a token could drift unobserved behind a green test.
    const bound = Object.values(tokens.cssBindings).flatMap((binding) =>
      Object.values(binding.variables),
    );
    expect([...new Set(bound)].sort()).toEqual(
      Object.keys(tokens.colors).sort(),
    );
  });

  it("uses the local Inter asset and the dedicated focus token", async () => {
    const styles = await read("src/app/globals.css");

    expect(styles).toContain("inter-latin-wght-normal.woff2");
    expect(styles).toContain("--savia-canvas");
    expect(styles).toContain("--savia-action");
    // The authority separates focus from action; a focus ring must not borrow
    // the action token.
    expect(styles).toMatch(
      /:focus-visible\s*\{[^}]*outline:[^;]*var\(--savia-focus\)/,
    );
  });

  it("verifies the local font bytes and license", async () => {
    const result = await execFileAsync(
      process.execPath,
      ["scripts/verify-font.mjs"],
      {
        cwd: root,
      },
    );

    expect(result.stdout).toContain("FONT_VERIFY PASS");
  });
});
