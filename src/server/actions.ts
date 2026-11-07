"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import type { UserCreateValues } from "@/lib/validation";
import {
  categorySchema,
  customerSchema,
  expenseSchema,
  firstOwnerSchema,
  forgotPasswordSchema,
  paymentSchema,
  resetPasswordSchema,
  promoToggleSchema,
  reasonSchema,
  refundSchema,
  serviceSchema,
  settingsSchema,
  statusUpdateSchema,
  transactionSchema,
  userCreateSchema,
  userUpdateSchema,
} from "@/lib/validation";
import { runAction, runPublicAction } from "@/server/action-result";
import {
  saveCustomer,
  saveExpenseCategory,
  saveService,
  setCustomerPromoEnabled,
} from "@/server/catalog";
import { createExpense, updateExpense, voidExpense } from "@/server/expenses";
import { recordPayment, recordRefund, reversePayment } from "@/server/payments";
import { getSettings, setPromoEnabled, updateSettings } from "@/server/settings";
import {
  createTransaction,
  updateOrderStatus,
  updateTransaction,
  voidTransaction,
} from "@/server/transactions";
import { createFirstOwner, createUser, updateUser } from "@/server/users";
import { DomainError } from "@/server/errors";
import { isMailConfigured, sendMail } from "@/server/mailer";
import {
  createResetLink,
  resetEmailContent,
  resetPasswordWithToken,
} from "@/server/password-reset";

/** Totals appear across the app, so financial writes refresh the whole layout. */
function refreshAll() {
  revalidatePath("/", "layout");
}

const idSchema = z.string().min(1).max(64);
const optionalId = idSchema.nullable();

export async function createFirstOwnerAction(input: unknown) {
  return runPublicAction(firstOwnerSchema, input, async (data) => {
    await createFirstOwner(data);
  });
}

/**
 * Always answers the same way, whether or not the address has an account. The
 * email goes out after the response, so timing does not give it away either.
 */
export async function requestPasswordResetAction(input: unknown) {
  return runPublicAction(forgotPasswordSchema, input, async (data) => {
    if (!isMailConfigured()) {
      throw new DomainError(
        "Password reset by email is not set up yet. Ask the shop owner to reset your password.",
      );
    }
    const request = await createResetLink(data.email);
    if (!request) return;
    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    after(async () => {
      try {
        const { shopName } = await getSettings();
        const content = resetEmailContent(request, shopName, baseUrl);
        await sendMail({ to: request.to, fromName: shopName, ...content });
      } catch (error) {
        console.error("Could not send the password reset email.", error);
      }
    });
  });
}

export async function resetPasswordAction(input: unknown) {
  return runPublicAction(resetPasswordSchema, input, async (data) => {
    await resetPasswordWithToken(data);
  });
}

export async function createTransactionAction(input: unknown) {
  const result = await runAction(transactionSchema, input, async (actor, data) => {
    const created = await createTransaction(actor, data);
    return { id: created.id };
  });
  refreshAll();
  return result;
}

export async function updateTransactionAction(id: string, input: unknown) {
  const schema = z.object({ id: idSchema, values: transactionSchema });
  const result = await runAction(schema, { id, values: input }, async (actor, data) => {
    await updateTransaction(actor, data.id, data.values);
    return { id: data.id };
  });
  refreshAll();
  return result;
}

export async function updateStatusAction(id: string, input: unknown) {
  const schema = z.object({ id: idSchema, values: statusUpdateSchema });
  const result = await runAction(schema, { id, values: input }, async (actor, data) => {
    await updateOrderStatus(actor, data.id, data.values.status);
  });
  refreshAll();
  return result;
}

export async function voidTransactionAction(id: string, input: unknown) {
  const schema = z.object({ id: idSchema, values: reasonSchema });
  const result = await runAction(schema, { id, values: input }, async (actor, data) => {
    await voidTransaction(actor, data.id, data.values.reason);
  });
  refreshAll();
  return result;
}

export async function recordPaymentAction(transactionId: string, input: unknown) {
  const schema = z.object({ id: idSchema, values: paymentSchema });
  const result = await runAction(schema, { id: transactionId, values: input }, async (a, data) => {
    await recordPayment(a, data.id, data.values);
  });
  refreshAll();
  return result;
}

export async function recordRefundAction(transactionId: string, input: unknown) {
  const schema = z.object({ id: idSchema, values: refundSchema });
  const result = await runAction(schema, { id: transactionId, values: input }, async (a, data) => {
    await recordRefund(a, data.id, data.values);
  });
  refreshAll();
  return result;
}

export async function reversePaymentAction(paymentId: string, input: unknown) {
  const schema = z.object({ id: idSchema, values: reasonSchema });
  const result = await runAction(schema, { id: paymentId, values: input }, async (actor, data) => {
    await reversePayment(actor, data.id, data.values.reason);
  });
  refreshAll();
  return result;
}

export async function saveExpenseAction(id: string | null, input: unknown) {
  const schema = z.object({ id: optionalId, values: expenseSchema });
  const result = await runAction(schema, { id, values: input }, async (actor, data) => {
    if (data.id) await updateExpense(actor, data.id, data.values);
    else await createExpense(actor, data.values);
  });
  refreshAll();
  return result;
}

export async function voidExpenseAction(id: string, input: unknown) {
  const schema = z.object({ id: idSchema, values: reasonSchema });
  const result = await runAction(schema, { id, values: input }, async (actor, data) => {
    await voidExpense(actor, data.id, data.values.reason);
  });
  refreshAll();
  return result;
}

export async function saveServiceAction(id: string | null, input: unknown) {
  const schema = z.object({ id: optionalId, values: serviceSchema });
  const result = await runAction(schema, { id, values: input }, async (actor, data) => {
    await saveService(actor, data.id, data.values);
  });
  refreshAll();
  return result;
}

export async function saveCustomerAction(id: string | null, input: unknown) {
  const schema = z.object({ id: optionalId, values: customerSchema });
  const result = await runAction(schema, { id, values: input }, async (actor, data) => {
    await saveCustomer(actor, data.id, data.values);
  });
  refreshAll();
  return result;
}

export async function saveCategoryAction(id: string | null, input: unknown) {
  const schema = z.object({ id: optionalId, values: categorySchema });
  const result = await runAction(schema, { id, values: input }, async (actor, data) => {
    await saveExpenseCategory(actor, data.id, data.values);
  });
  refreshAll();
  return result;
}

export async function saveSettingsAction(input: unknown) {
  const result = await runAction(settingsSchema, input, async (actor, data) => {
    await updateSettings(actor, data);
  });
  refreshAll();
  return result;
}

export async function setPromoEnabledAction(input: unknown) {
  const result = await runAction(promoToggleSchema, input, async (actor, data) => {
    await setPromoEnabled(actor, data.enabled);
  });
  refreshAll();
  return result;
}

export async function setCustomerPromoAction(id: string, input: unknown) {
  const schema = z.object({ id: idSchema, values: promoToggleSchema });
  const result = await runAction(schema, { id, values: input }, async (actor, data) => {
    await setCustomerPromoEnabled(actor, data.id, data.values.enabled);
  });
  refreshAll();
  return result;
}

export async function createUserAction(input: UserCreateValues) {
  const result = await runAction(userCreateSchema, input, async (actor, data) => {
    await createUser(actor, data);
  });
  refreshAll();
  return result;
}

export async function updateUserAction(id: string, input: unknown) {
  const schema = z.object({ id: idSchema, values: userUpdateSchema });
  const result = await runAction(schema, { id, values: input }, async (actor, data) => {
    await updateUser(actor, data.id, data.values);
  });
  refreshAll();
  return result;
}
