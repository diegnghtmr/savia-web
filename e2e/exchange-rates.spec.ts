import { expect } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";

test("shows a stale provider rate and records a fresh manual rate", async ({
  page,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page.goto("/exchange-rates", { waitUntil: "networkidle" });
  await expect(page.getByText("Desactualizada", { exact: true })).toBeVisible({
    timeout: 3000,
  });
  await expect(page.getByText("frankfurter", { exact: false })).toBeVisible();
  const form = page.getByRole("form", { name: "Nueva tasa manual" });
  await form.getByLabel("Moneda base").fill("USD");
  await form.getByLabel("Moneda cotizada").fill("EUR");
  await form.getByLabel("Tasa").fill("0.9234");
  await form.getByLabel("Fecha y hora (UTC)").fill("2026-11-20T12:30");
  await form.getByRole("button", { name: "Guardar tasa manual" }).click();
  await expect(page.getByText("Tasa manual registrada.")).toBeVisible();
  await expect(page.getByText("0.9234", { exact: false })).toBeVisible();
  await expect(page.getByText("Vigente", { exact: true })).toBeVisible();
  const filters = page.getByRole("form", { name: "Filtrar tasas" });
  await filters.getByLabel("Moneda cotizada").fill("EUR");
  await filters.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.getByText("0.9234", { exact: false })).toBeVisible();
  await expect(page.getByText("Desactualizada", { exact: true })).toHaveCount(
    0,
  );
});
