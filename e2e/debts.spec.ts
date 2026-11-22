import { expect } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";

test("opens debt terms across pages without leaking a switched workspace's debt", async ({
  page,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page.goto("/debts?limit=1");
  await expect(page.getByRole("link", { name: "Préstamo" })).toBeVisible({
    timeout: 3000,
  });
  const next = page.getByRole("link", { name: "Siguiente" });
  const cursorUrl = (await next.getAttribute("href"))!;
  await next.click();
  const link = page.getByRole("link", { name: "Estudios" });
  const detail = (await link.getAttribute("href"))!;
  await link.click();
  await expect(page.getByRole("heading", { name: "Estudios" })).toBeVisible();
  await expect(page.getByText("COP 90,01", { exact: true })).toBeVisible();
  await expect(page.getByText("Proyección no disponible")).toBeVisible();
  await page.goto("/overview");
  await page.getByLabel("Espacio activo").selectOption({ label: "Oficina" });
  await page.getByRole("button", { name: "Cambiar de espacio" }).click();
  await expect(page.getByRole("heading", { name: "Oficina" })).toBeVisible();
  expect((await page.goto(detail))?.status()).toBe(404);
  await page.goto(cursorUrl);
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Revisa los filtros.",
  );
});

test("renders the payoff schedule when the backend supports projection", async ({
  page,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page.goto("/debts");
  await page.getByRole("link", { name: "Préstamo" }).click();
  await expect(
    page.getByRole("heading", { name: "Proyección con pago mínimo" }),
  ).toBeVisible({ timeout: 3000 });
  await expect(page.getByRole("cell", { name: "2027-01-01" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /COP\s1,00/ })).toBeVisible();
});
