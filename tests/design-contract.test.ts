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
  designSystem: string;
  layers: string[];
  colors: Record<string, string>;
  rounded: Record<string, string>;
  spacing: Record<string, string>;
  cssBindings: Record<string, CssBinding>;
  [key: string]: unknown;
}

const sha256 = (content: string) =>
  createHash("sha256").update(content).digest("hex");

// [TRAP 1] Collapse whitespace so Prettier line-wrapping does not break value
// comparisons. The `.site-header` border-bottom already wraps across lines.
// CHOICE (a): We do not lower-case inside quoted substrings.
// This prevents semantically different quoted values (like font families or font-feature settings like `'tnum' 1`) from equating, while allowing hex colors and keywords to be case-insensitive outside quotes.
const normalize = (v: string) => {
  v = v
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")");
  return v.replace(/("[^"]*"|'[^']*')|([^"']+)/g, (match, quoted, unquoted) => {
    if (quoted) return `'${quoted.slice(1, -1)}'`;
    return unquoted.toLowerCase();
  });
};

describe("normalize", () => {
  it("collapses whitespace and lowercases unquoted text, preserving quoted values", () => {
    expect(normalize("  'tnum' 1,   'kern'  1 ")).toBe("'tnum' 1, 'kern' 1");
    expect(normalize("  Inter,   ui-sans-serif ")).toBe("inter, ui-sans-serif");
    expect(normalize("  #FF0000 ")).toBe("#ff0000");
  });
});

// [TRAP 2] Extract a single CSS rule block for `selector`. Throws if the
// selector's opening brace appears more than once (nested brace guard).
const ruleBlock = (styles: string, selector: string): string => {
  const opening = `${selector} {`;
  const first = styles.indexOf(opening);
  if (first === -1) {
    throw new Error(`globals.css declares no "${selector}" rule`);
  }
  if (styles.indexOf(opening, first + opening.length) !== -1) {
    throw new Error(
      `globals.css opens "${selector}" more than once (nested brace?)`,
    );
  }
  const startContent = first + opening.length;
  let depth = 1;
  let i = startContent;
  for (; i < styles.length; i++) {
    if (styles[i] === "{") depth++;
    else if (styles[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth > 0) throw new Error(`globals.css never closes "${selector}"`);
  return styles.slice(startContent, i);
};

// Reads every `--savia-*` declaration from a single rule block.
const declaredTokens = (styles: string, selector: string) => {
  const block = ruleBlock(styles, selector);
  const entries: [string, string][] = [];
  const seen = new Set<string>();
  for (const match of block.matchAll(/(--savia-[a-z-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (seen.has(name)) {
      throw new Error(`Duplicate declaration of "${name}" in "${selector}"`);
    }
    seen.add(name);
    entries.push([name, normalize(value)]);
  }
  return Object.fromEntries(entries);
};

// Resolve a "layer.key" reference (e.g. "colors.light-canvas") to a value.
const layerOf = (
  tokens: VendoredTokens,
  layerName: string,
): Record<string, string> | undefined => {
  if (!tokens.layers.includes(layerName)) return undefined;
  return tokens[layerName] as Record<string, string> | undefined;
};

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

describe("ruleBlock", () => {
  it("extracts a brace-balanced block including nested at-rules", () => {
    const css = `
.target {
  --a: 1;
  @media (prefers-reduced-motion) {
    --b: 2;
  }
  --c: 3;
}`;
    const block = ruleBlock(css, ".target");
    expect(block).toContain("--a: 1;");
    expect(block).toContain("--b: 2;");
    expect(block).toContain("--c: 3;");
  });
});

describe("declaredTokens", () => {
  it("throws if a custom property is declared more than once in the same block", () => {
    const css = `
.target {
  --savia-color: red;
  --savia-other: blue;
  --savia-color: green;
}`;
    expect(() => declaredTokens(css, ".target")).toThrow(
      /Duplicate declaration/i,
    );
  });
});

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
      layerTokenCounts: Object.fromEntries(
        tokens.layers.map((layer) => {
          const data = layerOf(tokens, layer);
          if (!data)
            throw new Error(`Layer "${layer}" declared but not defined`);
          return [layer, Object.keys(data).length];
        }),
      ),
    });
    expect(Object.keys(tokens.colors)).toHaveLength(
      DESIGN_AUTHORITY.colorCount,
    );
    expect(claimsCiCanVerifyAuthority(rawProvenance)).toBe(false);
    expect(claimsCiCanVerifyAuthority(rawTokens)).toBe(false);
    // savia-web vendors constants, never a copy of the planning source itself.
    expect(await findCopiedAuthority(root)).toEqual([]);
  });

  it("declares every vendored token, in both themes and invariant, with the authority's exact value", async () => {
    const styles = await read("src/app/globals.css");
    const tokens: VendoredTokens = JSON.parse(await read(VENDORED_TOKENS_PATH));

    // Fold ALL cssBindings groups by their selector into
    // expected: Record<selector, Record<variable, value>>, throwing on
    // duplicate variables within one selector.
    const expected: Record<string, Record<string, string>> = {};
    for (const [theme, binding] of Object.entries(tokens.cssBindings)) {
      const sel = binding.selector;
      if (!expected[sel]) expected[sel] = {};
      for (const [variable, ref] of Object.entries(binding.variables)) {
        if (variable in expected[sel]) {
          throw new Error(
            `Duplicate variable "${variable}" in selector "${sel}"`,
          );
        }
        const dotIdx = ref.indexOf(".");
        if (dotIdx === -1)
          throw new Error(
            `${theme} binds "${variable}" to "${ref}" which has no layer prefix`,
          );
        const layerName = ref.slice(0, dotIdx);
        const key = ref.slice(dotIdx + 1);
        const layer = layerOf(tokens, layerName);
        if (!layer)
          throw new Error(
            `${theme} references unknown layer "${layerName}" for "${variable}"`,
          );
        const value = layer[key];
        if (value === undefined)
          throw new Error(
            `${theme} binds "${variable}" to unknown key "${key}" in layer "${layerName}"`,
          );
        expected[sel][variable] = normalize(value);
      }
    }

    // Compare per selector.
    const actual: Record<string, Record<string, string>> = {};
    for (const sel of Object.keys(expected)) {
      actual[sel] = declaredTokens(styles, sel);
    }
    expect(actual).toEqual(expected);

    // No-orphan-TOKEN assertion: for each layer, the set of referenced keys
    // equals the set of declared keys.
    for (const layerName of tokens.layers) {
      const layer = layerOf(tokens, layerName);
      if (!layer) throw new Error(`Layer "${layerName}" missing`);
      const declaredKeys = Object.keys(layer).sort();
      const referencedKeys = new Set<string>();
      for (const binding of Object.values(tokens.cssBindings)) {
        for (const ref of Object.values(binding.variables)) {
          const dotIdx = ref.indexOf(".");
          if (dotIdx === -1) continue;
          if (ref.slice(0, dotIdx) === layerName) {
            referencedKeys.add(ref.slice(dotIdx + 1));
          }
        }
      }
      expect([...referencedKeys].sort()).toEqual(declaredKeys);
    }
  });

  // [TRAP 4] No-orphan-var() assertion: every var(--savia-...) referenced
  // anywhere in globals.css must appear as a declaration inside the
  // UNCONDITIONAL :root block specifically.
  it("resolves every var(--savia-*) reference against the unconditional :root", async () => {
    const styles = await read("src/app/globals.css");
    const rootBlock = ruleBlock(styles, ":root");
    const rootDeclarations = new Set(
      [...rootBlock.matchAll(/(--savia-[a-z-]+)\s*:/g)].map(([, n]) => n),
    );
    const allRefs = new Set(
      [...styles.matchAll(/var\((--savia-[a-z-]+)\)/g)].map(([, n]) => n),
    );
    for (const ref of allRefs) {
      expect(rootDeclarations).toContain(ref);
    }
  });

  // No-declaration-outside-bindings assertion: after removing every binding
  // selector's block, the remaining CSS must contain no --savia-*: declaration.
  it("declares --savia-* variables only inside binding selectors", async () => {
    const styles = await read("src/app/globals.css");
    const tokens: VendoredTokens = JSON.parse(await read(VENDORED_TOKENS_PATH));
    let remaining = styles;
    const selectors = new Set(
      Object.values(tokens.cssBindings).map((b) => b.selector),
    );
    for (const sel of selectors) {
      const opening = `${sel} {`;
      const start = remaining.indexOf(opening);
      if (start === -1) continue;
      const end = remaining.indexOf("}", start);
      if (end === -1) continue;
      remaining = remaining.slice(0, start) + remaining.slice(end + 1);
    }
    expect(remaining).not.toMatch(/--savia-[a-z-]+\s*:/);
  });

  // Components-absent assertion: no "components" layer exists, and
  // Object.keys(tokens) minus designSystem/layers/cssBindings equals tokens.layers.
  it("never adds a components layer and has only declared layers as top-level keys", async () => {
    const tokens: VendoredTokens = JSON.parse(await read(VENDORED_TOKENS_PATH));
    expect(layerOf(tokens, "components")).toBeUndefined();
    const reserved = new Set(["designSystem", "layers", "cssBindings"]);
    const topKeys = Object.keys(tokens).filter((k) => !reserved.has(k));
    expect(topKeys.sort()).toEqual(
      ["colors", "rounded", "spacing", "typography"].sort(),
    );
  });

  it("emits 5 role classes with exactly 7 declarations each, mapped to their own variables", async () => {
    const styles = await read("src/app/globals.css");
    const roles = [
      "body-md",
      "label-md",
      "finance-md",
      "editorial-lg",
      "technical-sm",
    ];
    const props = [
      "font-family",
      "font-size",
      "font-weight",
      "line-height",
      "letter-spacing",
      "font-feature-settings",
      "font-variation-settings",
    ];

    for (const role of roles) {
      const block = ruleBlock(styles, `.type-${role}`);
      // Find all property declarations in this block (excluding custom properties)
      const declarations = Object.fromEntries(
        [...block.matchAll(/([a-z-]+)\s*:\s*([^;]+);/g)]
          .filter(([, name]) => !name.startsWith("--"))
          .map(([, name, value]) => [name, normalize(value)]),
      );

      const expected: Record<string, string> = {};
      for (const prop of props) {
        expected[prop] = normalize(`var(--savia-type-${role}-${prop})`);
      }

      expect(declarations).toEqual(expected);
      expect(Object.keys(declarations)).toHaveLength(7);
    }
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
