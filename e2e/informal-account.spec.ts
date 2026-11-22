import { expect } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";

test("creates an informal debt with optional details and shows them in the account views", async ({
  page,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page.goto("/accounts");
  await expect(page.getByLabel("Contraparte")).toHaveCount(0);
  await page.getByLabel("Nombre de la cuenta").fill("Préstamo familiar");
  await page
    .getByLabel("Tipo de cuenta")
    .selectOption("informal_debt", { timeout: 3000 });
  await page.getByLabel("Moneda").fill("COP");
  await page.getByLabel("Contraparte").fill("Familia");
  await page.getByLabel("Dirección").selectOption("i_owe");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  const link = page.getByRole("link", { name: "Préstamo familiar" });
  await expect(link).toBeVisible();
  const row = page.getByRole("listitem").filter({ has: link });
  await expect(row).toContainText("Deuda informal");
  await expect(row).toContainText("Familia");
  await expect(row).toContainText("Debo");
  await link.click();
  await expect(
    page.getByRole("heading", { name: "Préstamo familiar" }),
  ).toBeVisible();
  await expect(page.getByText("Familia", { exact: true })).toBeVisible();
  await expect(page.getByText("Debo", { exact: true })).toBeVisible();
});
