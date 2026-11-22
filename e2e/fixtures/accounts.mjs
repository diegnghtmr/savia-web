import { E2E_USER } from "../fixtures.ts";

export const ONBOARDED_USER = { ...E2E_USER, email: "member@savia.test" };
export const RECOVERY_USER = { ...E2E_USER, email: "recovery@savia.test" };
export const DRAFT_CLOCK_USER = {
  ...E2E_USER,
  email: "draft-clock@savia.test",
};
