import { readFile, readdir } from "node:fs/promises";
import { join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const source = await readFile(
  new URL("../src/app/page.tsx", import.meta.url),
  "utf8",
);
if (/use client|fetch\(|axios|supabase|https?:\/\//.test(source)) {
  throw new Error("Static boundary audit failed");
}

const [layout, control, theme] = await Promise.all(
  ["layout.tsx", "_components/theme-control.tsx", "theme.ts"].map((path) =>
    readFile(new URL(`../src/app/${path}`, import.meta.url), "utf8"),
  ),
);
assert(
  (layout + control + theme).match(/"use client"/g)?.length === 1,
  "theme must be the only client boundary",
);
assert(
  !/fetch\(|XMLHttpRequest|WebSocket|EventSource|supabase|axios/.test(
    layout + control + theme,
  ),
  "theme boundary has network capability",
);

const requiredCompilerOptions = {
  target: "ES2017",
  module: "esnext",
  moduleResolution: "bundler",
  jsx: "react-jsx",
  strict: true,
  noEmit: true,
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateTrace(trace, onProduct = () => {}) {
  let peerCheckPassed = false;
  for (const step of trace) {
    if (step === "product") {
      assert(peerCheckPassed, "product command ran before peers check");
      onProduct();
    }
    if (step === "lockfile")
      assert(false, "lockfile install is missing strict peers");
    if (step === "frozen")
      assert(false, "frozen install is missing strict peers");
    if (step === "peers-fail") assert(false, "peers check failed");
    if (step === "peers") peerCheckPassed = true;
  }
}

function validateTsconfig(config, afterBuild = config) {
  for (const [key, value] of Object.entries(requiredCompilerOptions)) {
    assert(config.compilerOptions[key] === value, `tsconfig missing ${key}`);
  }
  assert(
    JSON.stringify(config) === JSON.stringify(afterBuild),
    "next build mutated tsconfig",
  );
}

function assertFixture(id, action) {
  let productRan = false;
  try {
    action(() => {
      productRan = true;
    });
  } catch {
    assert(!productRan, `${id} ran a product command`);
    return;
  }
  throw new Error(`${id} unexpectedly passed`);
}

const tsconfig = JSON.parse(
  await readFile(new URL("../tsconfig.json", import.meta.url), "utf8"),
);
const fixtures = {
  "lockfile-only-missing-strict-peers": (product) => {
    validateTrace(["lockfile", "peers", "product"], product);
  },
  "frozen-missing-strict-peers": (product) => {
    validateTrace(["frozen", "peers", "product"], product);
  },
  "peers-check-skipped": (product) => {
    validateTrace(["lockfile-strict", "frozen-strict", "product"], product);
  },
  "peers-check-failure": (product) => {
    validateTrace(
      ["lockfile-strict", "frozen-strict", "peers-fail", "product"],
      product,
    );
  },
  "peers-check-after-product-command": (product) => {
    validateTrace(
      ["lockfile-strict", "frozen-strict", "product", "peers"],
      product,
    );
  },
  "tsconfig-required-setting-missing": (product) => {
    validateTsconfig({
      ...tsconfig,
      compilerOptions: { ...tsconfig.compilerOptions, strict: false },
    });
    product();
  },
  "next-build-tsconfig-mutated": (product) => {
    validateTsconfig(tsconfig, { ...tsconfig, include: [] });
    product();
  },
};

for (const [id, action] of Object.entries(fixtures)) assertFixture(id, action);
validateTrace([
  "lockfile-strict",
  "frozen-strict",
  "peers",
  "ignored-builds",
  "product",
]);
validateTsconfig(tsconfig);
process.stdout.write("PROCESS_RED_FIXTURES PASS cases=7 valid=1\n");

// ---------------------------------------------------------------------------
// ADR-0018 client boundary.
//
// The browser must issue no application request, and the session credential
// must never be readable by browser JavaScript. Naming the files to inspect
// cannot express that: any new module is unaudited the moment it is created.
// So the invariant is enforced over the whole `src` import graph instead.
//
// The distinction that makes the rule workable rather than absolute is the
// `server-only` marker. `fetch` is not banned; it is confined to a module that
// declares itself unreachable from the browser, which is exactly the property
// ADR-0018 asks for. A `"use server"` module is an RPC boundary — Next.js
// replaces it with a reference on the client — so traversal stops there rather
// than treating a Server Action import as a violation.
// ---------------------------------------------------------------------------

const SOURCE_EXTENSION = /\.(?:tsx?|jsx?|mjs)$/;
const DECLARATION_FILE = /\.d\.ts$/;
const SERVER_ONLY_MARKER = /^import\s+["']server-only["']/m;
const LEADING_TRIVIA = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/;
const DIRECTIVE = /^["'`]use (client|server)["'`]/;
const FETCH_CALL = /\bfetch\s*\(/;
const PUBLIC_ENVIRONMENT = /NEXT_PUBLIC_/;
const BROWSER_NETWORK =
  /\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bsendBeacon\b|\baxios\b/;
const CLIENT_FORBIDDEN_NAME = /\bsupabase\b/i;
const SERVER_PACKAGES = [
  "@supabase/ssr",
  "@supabase/supabase-js",
  "next/headers",
  "server-only",
  "axios",
];

function moduleDirective(source) {
  const match = DIRECTIVE.exec(source.replace(LEADING_TRIVIA, ""));
  return match ? match[1] : null;
}

function isServerModule(source) {
  return (
    moduleDirective(source) === "server" || SERVER_ONLY_MARKER.test(source)
  );
}

function importSpecifiers(source) {
  const specifiers = new Set();
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']/g,
  ];
  for (const pattern of patterns)
    for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
  return specifiers;
}

function resolveModule(fromPath, specifier, modules) {
  const base = specifier.startsWith("@/")
    ? posix.join("src", specifier.slice(2))
    : specifier.startsWith(".")
      ? posix.join(posix.dirname(fromPath), specifier)
      : null;
  if (base === null) return null;
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ];
  return candidates.find((candidate) => modules.has(candidate)) ?? null;
}

function importChain(path, parents) {
  const chain = [path];
  let current = parents.get(path);
  while (current) {
    chain.unshift(current);
    current = parents.get(current);
  }
  return chain.join(" -> ");
}

function auditClientBoundary(modules) {
  // The reachability walk runs first, and deliberately so. Its rules overlap
  // the flat pass below — a client-reachable module that calls `fetch` breaks
  // both — but only the walk can name the import chain that made the module
  // reachable, and that chain is the whole diagnosis. Run the flat pass first
  // and the walk's own `fetch` rule becomes unreachable code that reads like
  // protection while proving nothing.
  const parents = new Map();
  const queue = [];
  for (const [path, source] of modules)
    if (moduleDirective(source) === "client") {
      parents.set(path, null);
      queue.push(path);
    }
  while (queue.length) {
    const path = queue.shift();
    const source = modules.get(path);
    const chain = () => importChain(path, parents);
    assert(
      !isServerModule(source),
      `a client boundary reaches a server module: ${chain()}`,
    );
    assert(
      !FETCH_CALL.test(source),
      `a client boundary calls fetch: ${chain()}`,
    );
    assert(
      !CLIENT_FORBIDDEN_NAME.test(source),
      `a client boundary names a server credential provider: ${chain()}`,
    );
    for (const specifier of importSpecifiers(source)) {
      assert(
        !SERVER_PACKAGES.includes(specifier),
        `a client boundary imports the server package ${specifier}: ${chain()}`,
      );
      const next = resolveModule(path, specifier, modules);
      if (next === null || parents.has(next)) continue;
      if (moduleDirective(modules.get(next)) === "server") continue;
      parents.set(next, path);
      queue.push(next);
    }
  }
  // Whatever the walk could not reach. A module no client boundary imports
  // today is one refactor away from being imported tomorrow, so these rules
  // hold over every module regardless of reachability.
  for (const [path, source] of modules) {
    assert(
      !BROWSER_NETWORK.test(source),
      `browser network primitive in ${path}`,
    );
    assert(
      !PUBLIC_ENVIRONMENT.test(source),
      `browser-exposed environment variable in ${path}`,
    );
    assert(
      !FETCH_CALL.test(source) || isServerModule(source),
      `fetch outside a server module in ${path}`,
    );
  }
}

// A fixture that merely fails proves nothing about the rule it is named after:
// it would keep passing after that rule is deleted, as long as some earlier
// rule still fires on the same source. So each fixture states the exact
// failure it must provoke.
function assertBoundaryFixture(id, { fails, files }) {
  let failure = null;
  try {
    auditClientBoundary(new Map(Object.entries(files)));
  } catch (error) {
    failure = error.message;
  }
  assert(failure !== null, `${id} unexpectedly passed`);
  assert(failure === fails, `${id} failed for the wrong reason: ${failure}`);
}

const serverGateway =
  'import "server-only";\nexport const call = () => fetch("https://backend.test");\n';
const boundaryFixtures = {
  "client-imports-server-module": {
    fails:
      "a client boundary reaches a server module: " +
      "src/app/_components/panel.tsx -> src/lib/gateway.ts",
    files: {
      "src/app/_components/panel.tsx":
        '"use client";\nimport { call } from "@/lib/gateway";\nexport const Panel = () => call;\n',
      "src/lib/gateway.ts": serverGateway,
    },
  },
  "client-transitively-imports-server-module": {
    fails:
      "a client boundary reaches a server module: " +
      "src/app/_components/panel.tsx -> src/app/_components/label.ts" +
      " -> src/lib/gateway.ts",
    files: {
      "src/app/_components/panel.tsx":
        '"use client";\nimport { label } from "./label";\nexport const Panel = () => label;\n',
      "src/app/_components/label.ts":
        'import { call } from "@/lib/gateway";\nexport const label = () => call;\n',
      "src/lib/gateway.ts": serverGateway,
    },
  },
  // `next/headers` rather than a Supabase package: every Supabase specifier is
  // caught one rule earlier, by the credential-name check below, so a Supabase
  // fixture here would survive the deletion of the server-package rule.
  "client-imports-server-package": {
    fails:
      "a client boundary imports the server package next/headers: " +
      "src/app/_components/panel.tsx",
    files: {
      "src/app/_components/panel.tsx":
        '"use client";\nimport { cookies } from "next/headers";\nexport const Panel = () => cookies;\n',
    },
  },
  "client-names-credential-provider": {
    fails:
      "a client boundary names a server credential provider: " +
      "src/app/_components/panel.tsx",
    files: {
      "src/app/_components/panel.tsx":
        '"use client";\nimport { createServerClient } from "@supabase/ssr";\nexport const Panel = () => createServerClient;\n',
    },
  },
  "client-reachable-module-calls-fetch": {
    fails:
      "a client boundary calls fetch: " +
      "src/app/_components/panel.tsx -> src/app/_components/load.ts",
    files: {
      "src/app/_components/panel.tsx":
        '"use client";\nimport { load } from "./load";\nexport const Panel = () => load;\n',
      "src/app/_components/load.ts":
        'export const load = () => fetch("/v1/onboarding");\n',
    },
  },
  "unmarked-module-calls-fetch": {
    fails: "fetch outside a server module in src/lib/gateway.ts",
    files: {
      "src/lib/gateway.ts":
        'export const call = () => fetch("https://backend.test");\n',
    },
  },
  "browser-network-primitive": {
    fails: "browser network primitive in src/lib/stream.ts",
    files: {
      "src/lib/stream.ts":
        'export const stream = () => new EventSource("/events");\n',
    },
  },
  "browser-exposed-environment-variable": {
    fails: "browser-exposed environment variable in src/lib/config.ts",
    files: {
      "src/lib/config.ts":
        "export const backend = process.env.NEXT_PUBLIC_BACKEND_BASE_URL;\n",
    },
  },
};

// The shape ADR-0018 permits: a client component reaching the backend only
// through a Server Action, which reaches it only through a `server-only`
// module. If this fixture ever fails the guard has become unimplementable.
const validBoundary = {
  "src/app/_components/form.tsx":
    '"use client";\nimport { submit } from "@/app/_actions/thing";\nexport const Form = () => submit;\n',
  "src/app/_actions/thing.ts":
    '"use server";\nimport { call } from "@/lib/gateway";\nexport async function submit() {\n  return call();\n}\n',
  "src/lib/gateway.ts": serverGateway,
};

for (const [id, fixture] of Object.entries(boundaryFixtures))
  assertBoundaryFixture(id, fixture);
auditClientBoundary(new Map(Object.entries(validBoundary)));

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const modules = new Map();
for (const entry of await readdir(sourceRoot, {
  recursive: true,
  withFileTypes: true,
})) {
  if (
    !entry.isFile() ||
    !SOURCE_EXTENSION.test(entry.name) ||
    DECLARATION_FILE.test(entry.name)
  )
    continue;
  const absolute = join(entry.parentPath, entry.name);
  modules.set(
    relative(projectRoot, absolute).split(sep).join("/"),
    await readFile(absolute, "utf8"),
  );
}
auditClientBoundary(modules);
process.stdout.write(
  `CLIENT_BOUNDARY_FIXTURES PASS cases=${Object.keys(boundaryFixtures).length} valid=1\n`,
);
