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

test("theme is accessible, resilient, responsive, and makes no application requests", async ({
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
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Tema actual: oscuro")).toBeVisible();
  const button = page.getByRole("button", { name: "Usar tema claro" });
  await expect(button).toHaveCSS("min-height", "44px");
  await button.focus();
  await expect(button).toBeFocused();
  await button.click();
  await expect(page.getByText("Tema actual: claro")).toBeVisible();
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
  expect(runtime).toEqual([]);
});
