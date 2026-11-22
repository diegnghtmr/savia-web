import { expect, type Page } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";

test("creates a fund and replays a lost contribution without increasing savings twice", async ({
  page,
  context,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page.goto("/funds");
  await page
    .getByRole("link", { name: "Nuevo fondo" })
    .click({ timeout: 3000 });
  await page.getByLabel("Nombre").fill("Reserva escolar");
  await page.getByLabel("Moneda").fill("COP");
  await page.getByLabel("Meta").fill("100,00");
  await page.getByRole("button", { name: "Crear fondo" }).click();
  await page.getByRole("link", { name: "Ver fondo" }).click();
  const contribution = page.getByRole("link", { name: "Registrar aporte" });
  const path = (await contribution.getAttribute("href"))!;
  await contribution.click();
  async function fill(target: Page) {
    await target.getByLabel("Cuenta de origen").selectOption({ label: "Caja" });
    await target.getByLabel("Importe (COP)").fill("0,01");
    await target.getByLabel("Fecha").fill("2026-02-01");
  }
  await fill(page);
  const url = new URL(path, page.url()).href;
  const lost = Promise.withResolvers<void>();
  await page.route(url, async (route) => {
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
  await page.getByRole("button", { name: "Registrar aporte" }).click();
  await lost.promise;
  // Close the interrupted document and release its Web Lock before retrying.
  await page.close();
  const restored = await context.newPage();
  await restored.goto(path);
  await fill(restored);
  await restored.getByRole("button", { name: "Registrar aporte" }).click();
  await restored.getByRole("link", { name: "Ver fondo" }).click();
  await expect(
    restored.getByRole("heading", { name: "Reserva escolar" }),
  ).toBeVisible();
  await expect(restored.getByText("0,01 %", { exact: true })).toBeVisible();
  await expect(restored.getByText("COP 99,99", { exact: true })).toBeVisible();
});
