import { expect } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";

test("offers native CLI approval and a non-revoking cancel link", async ({
  page,
  browser,
  baseURL,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  await expect(page.getByRole("heading", { name: "Casa" })).toBeVisible();
  const context = await browser.newContext({
    storageState: await page.context().storageState(),
    javaScriptEnabled: false,
    baseURL,
  });
  try {
    const native = await context.newPage();
    await native.goto("/cli/device");
    const cancel = native.getByRole("link", { name: "Cancelar" });
    await expect(cancel).toHaveAccessibleDescription(
      "No invalida el código; caducará solo.",
    );
    await cancel.click();
    await expect(native).toHaveURL(/\/overview$/);
    await native
      .getByRole("link", { name: "Autorizar dispositivo CLI" })
      .click();
    const code = native.getByLabel("Código del dispositivo");
    const approve = native.getByRole("button", {
      name: "Autorizar dispositivo",
    });
    await code.fill("JKLM-NPQR");
    await approve.click();
    await expect(native.getByRole("alert")).toHaveText(
      "El código no es válido o ya caducó.",
    );
    await expect(code).toHaveValue("");
    await code.fill("abcd-efgh");
    await approve.click();
    await expect(native.getByRole("status")).toHaveText(
      "Dispositivo autorizado. Vuelve a la terminal.",
    );
  } finally {
    await context.close();
  }
});
