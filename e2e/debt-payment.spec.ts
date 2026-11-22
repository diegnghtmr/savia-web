import { expect, type Page } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";

test("reopening a lost debt payment reply does not apply principal twice", async ({
  page,
  context,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page.goto("/debts");
  await page.getByRole("link", { name: "Estudios" }).click();
  const link = page.getByRole("link", { name: "Registrar pago" });
  await expect(link).toBeVisible({ timeout: 3000 });
  const href = (await link.getAttribute("href"))!;
  await link.click();
  const fill = async (tab: Page) => {
    await tab.getByLabel("Cuenta de origen").selectOption({ label: "Caja" });
    await tab.getByLabel("Total (COP)").fill("3,00");
    await tab.getByLabel("Capital (opcional)").fill("2,00");
    await tab.getByLabel("Interés (opcional)").fill("0,90");
    await tab.getByLabel("Comisión (opcional)").fill("0,10");
    await tab.getByLabel("Fecha").fill("2026-02-01");
  };
  await fill(page);
  const lost = Promise.withResolvers<void>();
  await page.route(new URL(href, page.url()).href, async (route) => {
    if (
      route.request().method() !== "POST" ||
      !route.request().postData()?.includes("draftPrepared")
    )
      return route.continue();
    try {
      expect((await route.fetch({ maxRedirects: 0 })).ok()).toBe(true);
      await route.abort();
      lost.resolve();
    } catch (error) {
      lost.reject(error);
    }
  });
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await lost.promise;
  await page.close();
  const restored = await context.newPage();
  await restored.goto(href);
  await fill(restored);
  await restored.getByRole("button", { name: "Registrar pago" }).click();
  await restored.getByRole("link", { name: "Ver deuda" }).click();
  await expect(
    restored.getByRole("heading", { name: "Estudios" }),
  ).toBeVisible();
  await expect(restored.getByText("COP 88,01", { exact: true })).toBeVisible();
});
