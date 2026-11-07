import "server-only";
import { z } from "zod";
import { getActor } from "@/server/auth";
import type { Actor } from "@/server/access";
import { DomainError, ForbiddenError } from "@/server/errors";

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

function fieldErrorsOf(error: z.ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    fieldErrors[issue.path.join(".") || "form"] ??= issue.message;
  }
  return fieldErrors;
}

/**
 * The shape of every server action: require a session, parse input with Zod,
 * run a service function (which checks permissions), and report failures as
 * values. Unexpected errors are logged and not shown to the user.
 */
export async function runAction<Schema extends z.ZodType, T>(
  schema: Schema,
  input: unknown,
  run: (actor: Actor, data: z.output<Schema>) => Promise<T>,
): Promise<ActionResult<T>> {
  const actor = await getActor();
  if (!actor) return { ok: false, error: new ForbiddenError().message };
  return runPublicAction(schema, input, (data) => run(actor, data));
}

/** For the rare action with no session yet. `run` must guard itself. */
export async function runPublicAction<Schema extends z.ZodType, T>(
  schema: Schema,
  input: unknown,
  run: (data: z.output<Schema>) => Promise<T>,
): Promise<ActionResult<T>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }
  try {
    return { ok: true, data: await run(parsed.data) };
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.message };
    console.error(error);
    return { ok: false, error: "Something went wrong. Nothing was saved. Please try again." };
  }
}
