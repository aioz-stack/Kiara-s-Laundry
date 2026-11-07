import { beforeEach, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";
import { resetPasswordSchema } from "@/lib/validation";
import { prisma } from "@/server/db";
import {
  RESET_COOLDOWN_SECONDS,
  RESET_LINK_MINUTES,
  createResetLink,
  hashResetToken,
  isResetTokenUsable,
  resetEmailContent,
  resetPasswordWithToken,
} from "@/server/password-reset";
import { resetDatabase } from "../support/fixtures";

const EMAIL = "kiara@test.local";
const NEW_PASSWORD = "brand-new-password";

function resetInput(token: string, password = NEW_PASSWORD) {
  return resetPasswordSchema.parse({ token, password, confirmPassword: password });
}

const minutes = (base: Date, count: number) => new Date(base.getTime() + count * 60_000);

async function makeAccount(isActive = true) {
  return prisma.user.create({
    data: {
      name: "Kiara",
      email: EMAIL,
      role: "CASHIER",
      isActive,
      passwordHash: await hashPassword("the-old-password"),
      failedLogins: 3,
      lockedUntil: new Date(Date.now() + 10 * 60_000),
    },
  });
}

describe("password reset", () => {
  beforeEach(resetDatabase);

  it("sends nothing for an unknown or inactive email", async () => {
    expect(await createResetLink("nobody@test.local")).toBeNull();
    await makeAccount(false);
    expect(await createResetLink(EMAIL)).toBeNull();
    expect(await prisma.passwordResetToken.count()).toBe(0);
  });

  it("stores only a hash of the token, and links to NEXTAUTH_URL", async () => {
    await makeAccount();
    const request = await createResetLink(EMAIL);
    expect(request?.to).toBe(EMAIL);
    const rows = await prisma.passwordResetToken.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toBe(hashResetToken(request!.token));
    expect(rows[0]?.tokenHash).not.toContain(request!.token);

    const content = resetEmailContent(request!, "Kiara's <Laundry>", "https://shop.test/");
    expect(content.link).toBe(`https://shop.test/reset-password?token=${request!.token}`);
    expect(content.html).toContain("Kiara's &lt;Laundry&gt;");
    expect(content.html).not.toContain("<Laundry>");
  });

  it("changes the password once, clears the lock, and audits it", async () => {
    const user = await makeAccount();
    const request = await createResetLink(EMAIL);
    expect(await isResetTokenUsable(request!.token)).toBe(true);

    await resetPasswordWithToken(resetInput(request!.token));
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword(NEW_PASSWORD, after.passwordHash)).toBe(true);
    expect(await verifyPassword("the-old-password", after.passwordHash)).toBe(false);
    expect(after.failedLogins).toBe(0);
    expect(after.lockedUntil).toBeNull();

    expect(await isResetTokenUsable(request!.token)).toBe(false);
    await expect(
      resetPasswordWithToken(resetInput(request!.token, "another-password")),
    ).rejects.toThrow("invalid, already used, or expired");

    const actions = await prisma.auditLog.findMany({
      where: { entityId: user.id },
      select: { action: true, afterData: true },
    });
    expect(actions.map((row) => row.action).sort()).toEqual([
      "user.password_reset",
      "user.password_reset_requested",
    ]);
    expect(JSON.stringify(actions)).not.toContain(request!.token);
  });

  it("rejects an expired link", async () => {
    await makeAccount();
    const sentAt = new Date("2026-03-10T02:00:00Z");
    const request = await createResetLink(EMAIL, sentAt);
    const late = minutes(sentAt, RESET_LINK_MINUTES + 1);
    expect(await isResetTokenUsable(request!.token, late)).toBe(false);
    await expect(resetPasswordWithToken(resetInput(request!.token), late)).rejects.toThrow(
      "expired",
    );
  });

  it("rejects a made-up token", async () => {
    await makeAccount();
    await expect(resetPasswordWithToken(resetInput("x".repeat(43)))).rejects.toThrow("invalid");
  });

  it("waits out the cooldown, then only the newest link works", async () => {
    await makeAccount();
    const first = new Date("2026-03-10T02:00:00Z");
    const firstLink = await createResetLink(EMAIL, first);
    expect(await createResetLink(EMAIL, minutes(first, 1))).toBeNull();

    const second = new Date(first.getTime() + (RESET_COOLDOWN_SECONDS + 1) * 1000);
    const secondLink = await createResetLink(EMAIL, second);
    expect(secondLink).not.toBeNull();
    expect(await isResetTokenUsable(firstLink!.token, second)).toBe(false);
    expect(await isResetTokenUsable(secondLink!.token, second)).toBe(true);
  });

  it("sends one link for a burst of requests", async () => {
    await makeAccount();
    const results = await Promise.all([1, 2, 3].map(() => createResetLink(EMAIL)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await prisma.passwordResetToken.count()).toBe(1);
  });

  it("lets a link through only once under concurrent use", async () => {
    await makeAccount();
    const request = await createResetLink(EMAIL);
    const results = await Promise.allSettled([
      resetPasswordWithToken(resetInput(request!.token, "first-password-1")),
      resetPasswordWithToken(resetInput(request!.token, "second-password-2")),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });

  it("stops working when the account is deactivated", async () => {
    const user = await makeAccount();
    const request = await createResetLink(EMAIL);
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    expect(await isResetTokenUsable(request!.token)).toBe(false);
    await expect(resetPasswordWithToken(resetInput(request!.token))).rejects.toThrow("invalid");
  });
});
