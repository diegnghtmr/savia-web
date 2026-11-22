import { expect } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";

test("opens savings progress through pagination and refuses cross-workspace fund URLs", async ({
  page,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page.goto("/funds?limit=1");
  await expect(page.getByRole("link", { name: "Emergencias" })).toBeVisible({
    timeout: 3000,
  });
  const next = (await page
    .getByRole("link", { name: "Siguiente" })
    .getAttribute("href"))!;
  await page.getByRole("link", { name: "Siguiente" }).click();
  const voyage = page.getByRole("link", { name: "Viaje" });
  const detail = (await voyage.getAttribute("href"))!;
  await voyage.click();
  await expect(page.getByRole("heading", { name: "Viaje" })).toBeVisible();
  await expect(page.getByText("25,00 %")).toBeVisible();
  await page.goto("/overview");
  await page.getByLabel("Espacio activo").selectOption({ label: "Oficina" });
  await page.getByRole("button", { name: "Cambiar de espacio" }).click();
  await expect(page.getByRole("heading", { name: "Oficina" })).toBeVisible();
  expect((await page.goto(detail))?.status()).toBe(404);
  await page.goto(next);
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Revisa los filtros.",
  );
});
