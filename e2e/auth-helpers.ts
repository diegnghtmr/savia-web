import { type Page, expect } from "@playwright/test";

/**
 * Signs in as an existing user via the /sign-in route.
 *
 * Navigates to /sign-in, fills in credentials, submits the form,
 * and waits for the authenticated destination to commit before navigating again.
 */
export async function signInAs(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/(?:overview|onboarding)$/);
  const signedIn = page.getByRole("button", { name: "Cerrar sesión" });
  await expect(signedIn).toBeVisible();
  await page.waitForLoadState("load");
}
