import "@testing-library/jest-dom/vitest";
import { JSDOM } from "jsdom";

// Which `localStorage` a test sees depends on the Node it runs under. Node 24,
// which CI pins, defines no such global, so vitest copies jsdom's. Node 25
// defines its own. Node 26 defines the key but leaves the value undefined
// unless the process was started with `--localstorage-file` — and vitest only
// copies a jsdom global for a key the runtime has not already defined, so that
// placeholder wins and every unqualified `localStorage` read resolves to
// nothing. The product guards its own storage access, so the gap surfaces only
// in tests, as an environment fault wearing the costume of a product defect.
//
// Bind one implementation unconditionally rather than branching on the
// version: three runtimes exercising three different stores is how a suite
// ends up passing only on the machine it was written on. jsdom's is a real Web
// Storage, on the origin the document already claims, and each test file gets
// its own because setup runs once per file.
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: new JSDOM("", { url: location.href }).window.localStorage,
});
