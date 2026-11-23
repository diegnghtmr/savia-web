// Reviewer e2e regression for W2 (verify task mwr14927). Add to e2e/.
import { expect } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { E2E_USER } from "./fixtures";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";

test("rejects stale account edits and closures after another tab saves", async ({
  page,
  context,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page.goto("/accounts");
  const link = page.getByRole("link", { name: "Caja", exact: true });
  const path = (await link.getAttribute("href"))!;
  const stale = await context.newPage();
  await stale.goto(path);
  const staleEdit = stale.getByRole("form", { name: "Editar cuenta" });
  await expect(staleEdit).toHaveAttribute("data-enhanced", "true");
  await page.goto(path);
  await page.getByLabel("Nombre de la cuenta").fill("Guardado primero");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(
    page.getByRole("heading", { name: "Guardado primero" }),
  ).toBeVisible();

  await stale.getByLabel("Nombre de la cuenta").fill("No debe guardarse");
  await stale.getByRole("button", { name: "Guardar cambios" }).click();
  const conflict =
    "La cuenta cambió. Recarga la página antes de volver a intentarlo.";
  await expect(
    stale.getByRole("form", { name: "Editar cuenta" }).getByRole("alert"),
  ).toHaveText(conflict);
  await stale.getByLabel("Confirmo el cierre de esta cuenta").check();
  await stale.getByRole("button", { name: "Cerrar cuenta" }).click();
  await expect(
    stale.getByRole("form", { name: "Cerrar cuenta" }).getByRole("alert"),
  ).toHaveText(conflict);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Guardado primero" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Guardar cambios" }),
  ).toBeVisible();
});

test.describe("native account forms", () => {
  test.use({ javaScriptEnabled: false });

  test("keeps the stale edit error when newer data renders", async ({
    page,
    context,
  }) => {
    await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
    await page.goto("/accounts");
    const link = page.getByRole("link", { name: "Caja", exact: true });
    const path = (await link.getAttribute("href"))!;
    const stale = await context.newPage();
    await stale.goto(path);
    await page.goto(path);
    await page.getByLabel("Nombre de la cuenta").fill("Caja actualizada");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(
      page.getByRole("heading", { name: "Caja actualizada" }),
    ).toBeVisible();
    const edit = stale.getByRole("form", { name: "Editar cuenta" });
    await edit.getByLabel("Nombre de la cuenta").fill("Caja obsoleta");
    await edit.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(edit.getByRole("alert")).toHaveText(
      "La cuenta cambió. Recarga la página antes de volver a intentarlo.",
    );
    await stale.reload();
    await expect(
      stale.getByRole("heading", { name: "Caja actualizada" }),
    ).toBeVisible();
  });
});

test("a stale account form cannot write after a different tab switches workspace", async ({
  page,
  context,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page.goto("/accounts");
  await expect(
    page.getByRole("link", { name: "Caja", exact: true }),
  ).toBeVisible();
  const selector = await context.newPage();
  await selector.goto("/overview");
  await selector
    .getByLabel("Espacio activo")
    .selectOption({ label: "Oficina" });
  await selector.getByRole("button", { name: "Cambiar de espacio" }).click();
  await expect(
    selector.getByRole("heading", { name: "Oficina" }),
  ).toBeVisible();

  await page.getByLabel("Nombre de la cuenta").fill("No debe crearse");
  await page.getByLabel("Moneda").fill("COP");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText(
    "El espacio activo cambió. Vuelve a Cuentas.",
  );

  await selector.goto("/accounts");
  await expect(selector.getByText("Espacio: Oficina")).toBeVisible();
  await expect(
    selector.getByText("No hay cuentas en esta página."),
  ).toBeVisible();
  await selector.goto("/overview");
  await selector.getByLabel("Espacio activo").selectOption({ label: "Casa" });
  await selector.getByRole("button", { name: "Cambiar de espacio" }).click();
  await expect(selector.getByRole("heading", { name: "Casa" })).toBeVisible();
  await selector.goto("/accounts");
  await expect(
    selector.getByRole("heading", { name: "Caja", exact: true }),
  ).toBeVisible();
  await expect(
    selector.getByRole("heading", { name: "No debe crearse" }),
  ).toHaveCount(0);
});

test("gates both account routes for users whose onboarding is incomplete", async ({
  page,
}) => {
  await signInAs(page, E2E_USER.email, E2E_USER.password);
  for (const path of [
    "/accounts",
    "/accounts/80000000-0000-4000-8000-000000000001",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL("/onboarding");
  }
});

test("does not silently ignore contradictory account status filters", async ({
  page,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  const response = await page.goto("/accounts?status=active&status=archived");
  if (response?.status() !== 400) {
    await expect(
      page.getByRole("heading", { name: "Caja", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("alert").filter({ hasText: /\S/ }).first(),
    ).toBeVisible();
  }
});
