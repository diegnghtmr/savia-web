// Reviewer regression (verify mwtuuj0d). Add as e2e/session-scope.verifier.spec.ts.
import { expect } from "@playwright/test";
import { signInAs } from "./auth-helpers";
import { ONBOARDED_USER } from "./fixtures/accounts.mjs";
import { test } from "./fixtures/browser";

test.use({ javaScriptEnabled: false });

test("lists sessions without secrets, revokes others, and globally signs out without a residual auth cookie", async ({
  page,
  context,
}) => {
  await signInAs(page, ONBOARDED_USER.email, ONBOARDED_USER.password);
  const auth = async () =>
    (await context.cookies()).filter(
      ({ name }) => name.startsWith("sb-") && name.includes("-auth-token"),
    );
  expect(await auth()).not.toHaveLength(0);
  await page.goto("/sessions");
  const current = page.getByRole("rowheader", { name: "Sesión actual" });
  const other = page.getByRole("rowheader", { name: "Otra sesión" });
  await expect(current).toHaveCount(1);
  await expect(other).toHaveCount(1);
  expect(await page.content()).not.toContain("DO_NOT_RENDER_");
  await page.reload();
  await expect(other).toHaveCount(1);

  const revoke = page.getByRole("form", { name: "Cerrar las demás sesiones" });
  await revoke.getByRole("checkbox").check();
  await revoke.getByRole("button").click();
  await expect(page.getByText("Se cerraron las demás sesiones.")).toBeVisible();
  await expect(current).toHaveCount(1);
  await expect(other).toHaveCount(0);
  expect(await auth()).not.toHaveLength(0);

  const all = page.getByRole("form", { name: "Cerrar todas las sesiones" });
  await all.getByRole("checkbox").check();
  await all.getByRole("button").click();
  await expect(page).toHaveURL(/\/sign-in$/);
  expect(await auth()).toEqual([]);
  await page.goto("/overview");
  await expect(page).toHaveURL(/\/sign-in$/);
});
