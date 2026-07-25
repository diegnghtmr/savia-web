import { readFile } from "node:fs/promises";

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
