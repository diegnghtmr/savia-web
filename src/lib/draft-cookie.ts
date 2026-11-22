export const draftSeedCookie = "savia-draft-seed";
export const draftCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
} as const;
