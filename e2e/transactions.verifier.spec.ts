// Reviewer e2e regression for W3 (verify task mwr1xxq2). Add to e2e/.
import { expect } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { E2E_USER } from "./fixtures";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";

test("a transaction detail is unavailable in a different active workspace", async ({
  page,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page.goto("/transactions");
  const item = page.getByRole("link", { name: "Mercado sin confirmar" });
  const detail = (await item.getAttribute("href"))!;
  await item.click();
  await expect(
    page.getByRole("heading", { name: "Mercado sin confirmar" }),
  ).toBeVisible();
  await expect(page.getByText(/COP\s+1\.234,56/)).toBeVisible();

  await page.goto("/overview");
  const selector = page.getByLabel("Espacio activo");
  const casa = await selector.inputValue();
  await selector.selectOption({ label: "Oficina" });
  await page.getByRole("button", { name: "Cambiar de espacio" }).click();
  await expect(page.getByRole("heading", { name: "Oficina" })).toBeVisible();

  const response = await page.goto(`${detail}?workspaceId=${casa}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByText("Pago en efectivo")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Mercado sin confirmar" }),
  ).toHaveCount(0);
  await page.goto("/transactions");
  await expect(page.getByText("Espacio: Oficina")).toBeVisible();
  await expect(
    page.getByText("No hay transacciones en esta página."),
  ).toBeVisible();
});

test("gates direct transaction URLs before onboarding is complete", async ({
  page,
}) => {
  await signInAs(page, E2E_USER.email, E2E_USER.password);
  for (const path of [
    "/transactions",
    "/transactions/80000000-0000-4000-8000-000000000001",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL("/onboarding");
  }
});

test("rejects malformed pagination limits instead of showing the first ledger page", async ({
  page,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  for (const query of ["limit=0", "limit=1&limit=2"]) {
    await page.goto(`/transactions?${query}`);
    await expect(page.getByText("Revisa los filtros.")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Mercado sin confirmar" }),
    ).toHaveCount(0);
  }
});
