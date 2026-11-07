/** Only ever used against the throwaway e2e database. */
export const E2E_PASSWORD = "e2e-test-password";

export const E2E_USERS = {
  OWNER: "owner@e2e.local",
  ADMIN: "admin@e2e.local",
  CASHIER: "cashier@e2e.local",
  STAFF: "staff@e2e.local",
} as const;
