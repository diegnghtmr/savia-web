import { expect } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";
import { FOREIGN_APPROVAL_ID } from "./fixtures/capabilities.mjs";

test("a workspace owner cannot reject somebody else's proposal", async ({
  page,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await page.goto("/approvals");
  const ownLink = page.getByRole("link", { name: "Registrar gasto" });
  await expect(ownLink).toBeVisible();
  const foreignLink = page.getByRole("link", { name: "Propuesta ajena" });
  await expect(foreignLink).toHaveCount(0);

  const detail = await page.goto(`/approvals/${FOREIGN_APPROVAL_ID}`);
  if (detail?.status() === 403 || detail?.status() === 404) return;

  const reject = page.getByRole("button", { name: "Rechazar propuesta" });
  if (await reject.isVisible()) {
    await expect(
      page.getByRole("form", { name: "Rechazar propuesta" }),
    ).toHaveAttribute("data-enhanced", "true");
    await reject.click();
    const outcome =
      /^(rejected|No pudimos completar la solicitud\.|Solicitud completada\.)$/;
    await expect(page.getByText(outcome).first()).toBeVisible();
  }
  await page.reload();
  await expect(page.getByText("rejected", { exact: true })).toHaveCount(0);
  const reason = "Solo quien creó la propuesta puede decidir.";
  await expect(page.getByText(reason, { exact: true })).toBeVisible();
  await expect(reject).toHaveCount(0);
  const approve = page.getByRole("button", { name: "Aprobar propuesta" });
  await expect(approve).toHaveCount(0);
});
