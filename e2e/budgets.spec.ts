import { expect } from "@playwright/test";
import { test } from "./fixtures/browser";
import { signInAs } from "./auth-helpers";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";

test("filters budget periods, retains the limit through pagination and shows category usage", async ({
  page,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page.goto("/budgets?from=2026-01-01&limit=1");
  await expect(page.getByRole("link", { name: "Enero" })).toBeVisible();
  await page.getByRole("link", { name: "Siguiente" }).click();
  await expect(page).toHaveURL(/from=2026-01-01&limit=1&cursor=/);
  await page.getByRole("link", { name: "Febrero" }).click();
  await expect(page.getByRole("heading", { name: "Febrero" })).toBeVisible();
  await expect(page.getByText("Alimentación")).toBeVisible();
  await expect(page.getByText("50,00 %")).toBeVisible();
});
