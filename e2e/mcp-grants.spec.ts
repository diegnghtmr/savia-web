import { expect } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { openEnhancedForm, test } from "./fixtures/browser";

test("lists, creates and revokes a scoped MCP grant with an exact write cap", async ({
  page,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  const create = await openEnhancedForm(
    page,
    "/mcp-grants",
    "Crear permiso MCP",
  );
  await expect(page.getByText("No hay permisos en esta página.")).toBeVisible();
  await create.getByLabel("Nombre del cliente").fill("MCP de casa");
  await create.getByRole("checkbox", { name: "transactions:write" }).check();
  await create.getByLabel("Límite por escritura (opcional)").fill("12,34");
  await create.getByLabel("Moneda del límite").fill("COP");
  await create
    .getByLabel("Herramientas", { exact: false })
    .fill("create_transaction");
  await create
    .getByLabel("Ventanas semanales", { exact: false })
    .fill("1 08:00 17:00");
  await create.getByRole("button", { name: "Crear permiso MCP" }).click();
  await page.getByRole("link", { name: "Continuar" }).click();
  const grant = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: "MCP de casa" }) });
  await expect(grant).toContainText("Alcances: transactions:write");
  await expect(grant).toContainText(/Límite por escritura: COP\s+12,34/);
  const revoke = grant.getByRole("form", { name: "Revocar MCP de casa" });
  await expect(revoke).toHaveAttribute("data-enhanced", "true");
  await revoke.getByLabel("Confirmo la revocación").check();
  await revoke.getByRole("button", { name: "Revocar MCP de casa" }).click();
  await expect(page).toHaveURL(/\/mcp-grants\?guardado=[\da-f-]{36}$/);
  await expect(grant).toContainText("Estado: revoked");
  await expect(revoke).toHaveCount(0);
  await page.reload();
  await expect(grant).toContainText("Estado: revoked");
});
