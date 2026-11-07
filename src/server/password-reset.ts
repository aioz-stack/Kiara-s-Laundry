import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { hashPassword } from "@/lib/password";
import type { ResetPasswordInput } from "@/lib/validation";
import { writeAudit } from "@/server/audit";
import { prisma } from "@/server/db";
import { DomainError } from "@/server/errors";

/** How long an emailed link works. */
export const RESET_LINK_MINUTES = 60;
/** A user gets at most one email in this window, so the form cannot flood an inbox. */
export const RESET_COOLDOWN_SECONDS = 120;

export const INVALID_RESET_LINK =
  "This reset link is invalid, already used, or expired. Ask for a new one.";

/** Only this hash is stored. The token itself exists only in the email. */
export function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type ResetLinkRequest = { to: string; name: string; token: string; expiresAt: Date };

/**
 * Starts a reset for an active user with this email. Returns what to email, or
 * null when nothing should be sent: no such active user, or one was sent moments
 * ago. Callers must answer the same way in both cases so the form never reveals
 * whether an email address has an account.
 */
export async function createResetLink(
  email: string,
  now: Date = new Date(),
): Promise<ResetLinkRequest | null> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });
  if (!user?.isActive) return null;

  return prisma.$transaction(async (tx) => {
    // Serialises requests for one user, so the cooldown holds under double-clicks.
    await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
    const recent = await tx.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        createdAt: { gt: new Date(now.getTime() - RESET_COOLDOWN_SECONDS * 1000) },
      },
      select: { id: true },
    });
    if (recent) return null;

    // Only the newest link works.
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: now },
    });
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + RESET_LINK_MINUTES * 60_000);
    const row = await tx.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashResetToken(token), expiresAt, createdAt: now },
      select: { id: true, expiresAt: true },
    });
    await writeAudit(tx, user, {
      action: "user.password_reset_requested",
      entityType: "User",
      entityId: user.id,
      after: { resetTokenId: row.id, expiresAt: row.expiresAt },
    });
    return { to: user.email, name: user.name, token, expiresAt };
  });
}

/** For the reset page: whether to show the form or the "ask again" message. */
export async function isResetTokenUsable(token: string, now: Date = new Date()) {
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
    select: { usedAt: true, expiresAt: true, user: { select: { isActive: true } } },
  });
  return Boolean(row && !row.usedAt && row.expiresAt > now && row.user.isActive);
}

/** Sets the new password and uses up the link. A link works once. */
export async function resetPasswordWithToken(input: ResetPasswordInput, now: Date = new Date()) {
  const passwordHash = await hashPassword(input.password);
  await prisma.$transaction(async (tx) => {
    const row = await tx.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(input.token) },
      select: {
        id: true,
        usedAt: true,
        expiresAt: true,
        user: { select: { id: true, name: true, role: true, isActive: true } },
      },
    });
    if (!row || row.usedAt || row.expiresAt <= now || !row.user.isActive) {
      throw new DomainError(INVALID_RESET_LINK);
    }
    // Claims the link. A second request racing on the same link finds it taken.
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw new DomainError(INVALID_RESET_LINK);

    const { user } = row;
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: now },
    });
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, failedLogins: 0, lockedUntil: null },
    });
    await writeAudit(tx, user, {
      action: "user.password_reset",
      entityType: "User",
      entityId: user.id,
      after: { resetTokenId: row.id },
    });
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The email body. The link is built from NEXTAUTH_URL, never from the request. */
export function resetEmailContent(request: ResetLinkRequest, shopName: string, baseUrl: string) {
  const link = `${baseUrl.replace(/\/+$/, "")}/reset-password?token=${encodeURIComponent(request.token)}`;
  const subject = `Reset your ${shopName} password`;
  const text = [
    `Hi ${request.name},`,
    "",
    `Someone asked to reset the password for your ${shopName} account.`,
    `Open this link within ${RESET_LINK_MINUTES} minutes to choose a new password:`,
    "",
    link,
    "",
    "If you did not ask for this, ignore this email. Your password will not change.",
  ].join("\n");
  const html = `<p>Hi ${escapeHtml(request.name)},</p>
<p>Someone asked to reset the password for your ${escapeHtml(shopName)} account.
Open this link within ${RESET_LINK_MINUTES} minutes to choose a new password:</p>
<p><a href="${escapeHtml(link)}">Reset my password</a></p>
<p style="color:#555">Or paste this into your browser:<br>${escapeHtml(link)}</p>
<p style="color:#555">If you did not ask for this, ignore this email. Your password will not change.</p>`;
  return { subject, text, html, link };
}
