import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const axe = await readFile(require.resolve("axe-core"), "utf8");

interface AxeResult {
  violations: unknown[];
}

interface AxeRunner {
  run(): Promise<AxeResult>;
}

interface AxeWindow extends Window {
  axe: AxeRunner;
}

test("the onboarding form is accessible, responsive, and quiet until submitted", async ({
  page,
}) => {
  const runtime: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      ["xhr", "fetch", "eventsource", "websocket"].includes(
        request.resourceType(),
      ) &&
      !(url.origin === "http://127.0.0.1:3000" && url.searchParams.has("_rsc"))
    )
      runtime.push(request.url());
  });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/onboarding", { waitUntil: "domcontentloaded" });
  // The theme attribute is written before React arrives, removed while React
  // hydrates, and restored by the control that owns it. Contrast measured
  // across that window mixes one theme's ink with the other's paper and
  // reports a violation neither theme has.
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByRole("heading", { level: 1, name: "Crea tu espacio" }),
  ).toBeVisible();
  const submit = page.getByRole("button", { name: "Crear mi espacio" });
  await expect(submit).toHaveCSS("min-height", "44px");
  await page.getByLabel("Correo electrónico").focus();
  await expect(page.getByLabel("Correo electrónico")).toBeFocused();

  await page.addScriptTag({ content: axe });
  const results = await page.evaluate(async () =>
    (window as unknown as AxeWindow).axe.run(),
  );
  expect(results.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  // Under ADR-0018 the page reaches the backend only through the Server
  // Action, and nothing is submitted here.
  expect(runtime).toEqual([]);
});

test("the home page offers the way in", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "Crear mi espacio" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Crea tu espacio" }),
  ).toBeVisible();
});
