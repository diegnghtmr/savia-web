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

test("keeps the system theme after React takes over the page", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/", { waitUntil: "load" });
  // Hydration is where this used to break: the prepaint script set the
  // attribute on `<html>`, then React reconciled an element it had rendered
  // without one and took it back off — so a reader who asked their system for
  // a dark interface got a flash of it and then the light one. An idle network
  // means the client bundle has loaded and run.
  await page.waitForLoadState("networkidle");

  expect(
    await page.evaluate(() => document.documentElement.dataset.theme ?? null),
  ).toBe("dark");
});

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

test("all typography roles apply non-normal font feature and variation settings in the browser", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const roles = [
    "body-md",
    "label-md",
    "finance-md",
    "editorial-lg",
    "technical-sm",
  ] as const;

  const results = await page.evaluate((roleNames) => {
    return roleNames.map((role) => {
      const el = document.createElement("span");
      el.className = `type-${role}`;
      document.body.appendChild(el);
      const computed = window.getComputedStyle(el);
      return {
        role,
        fontFeatureSettings: computed.fontFeatureSettings,
        fontVariationSettings: computed.fontVariationSettings,
      };
    });
  }, roles);

  expect(results).toHaveLength(5);
  for (const result of results) {
    expect(result.fontFeatureSettings).not.toBe("normal");
    expect(result.fontVariationSettings).not.toBe("normal");
  }

  const finance = results.find((r) => r.role === "finance-md");
  expect(finance?.fontFeatureSettings).toContain("tnum");
});
