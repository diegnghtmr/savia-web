// Reviewer regression (verify mwtpt2lz). Add as e2e/capability-receipt.verifier.spec.ts.
import { expect } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";

test.use({ javaScriptEnabled: false });

test("does not recognize a reserved credential as a completed write", async ({
  page,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page.goto("/ai-credentials");
  await page.getByLabel("Clave del proveedor").fill("offline-receipt-1234");
  await page.getByRole("button", { name: "Agregar clave" }).click();
  await expect(
    page.getByRole("button", { name: "Confirmar envío" }),
  ).toBeVisible();

  await page.goto(
    "/ai-credentials?guardado=00000000-0000-0000-0000-000000000000",
  );
  await expect(page.getByText("No hay claves guardadas.")).toBeVisible();
  await expect(
    page.getByText("Solicitud completada.", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Reconocer operación" }),
  ).toHaveCount(0);
});
