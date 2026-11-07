import "server-only";
import { redirect } from "next/navigation";
import { getServerSession, type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";
import { verifyPassword } from "@/lib/password";
import { can, homePath, type Permission } from "@/lib/permissions";
import type { Actor } from "@/server/access";
import { prisma } from "@/server/db";

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(200),
});

/** Checks a login. Locks the account for a while after repeated failures. */
export async function authenticate(email: string, password: string): Promise<Actor | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return null;
  if (user.lockedUntil && user.lockedUntil > new Date()) return null;

  if (!(await verifyPassword(password, user.passwordHash))) {
    const failedLogins = user.failedLogins + 1;
    const locked = failedLogins >= MAX_FAILED_LOGINS;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLogins: locked ? 0 : failedLogins,
        lockedUntil: locked ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    return null;
  }

  if (user.failedLogins > 0 || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null },
    });
  }
  return { id: user.id, name: user.name, role: user.role };
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        return authenticate(parsed.data.email, parsed.data.password);
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.id = token.sub ?? "";
      return session;
    },
  },
};

/**
 * The current user, read from the database on every call so that a role change
 * or deactivation takes effect at once rather than when the token expires.
 */
export async function getActor(): Promise<Actor | null> {
  const session = await getServerSession(authOptions);
  const id = session?.user?.id;
  if (!id) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, role: true, isActive: true },
  });
  if (!user?.isActive) return null;
  return { id: user.id, name: user.name, role: user.role };
}

/** Page guard: redirects to login when signed out. */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  return actor;
}

/** Page guard: also sends a signed-in user without access to their home page. */
export async function requirePagePermission(permission: Permission): Promise<Actor> {
  const actor = await requireActor();
  if (!can(actor.role, permission)) redirect(`${homePath(actor.role)}?denied=1`);
  return actor;
}
