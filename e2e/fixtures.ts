export const E2E_USER = {
  email: "e2e-tester@savia.local",
  password: "TestPassword123!",
} as const;

export type E2EUser = typeof E2E_USER;
