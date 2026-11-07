/**
 * Input schemas shared by forms and the server. Amounts arrive as strings and
 * are parsed to integers without passing through a float. Forms validate the raw
 * strings (`raw: true` on the resolver); the server parses again and uses the
 * transformed values, so client validation is never trusted.
 */
import { z } from "zod";
import { isValidTimeZone, isValidYmd } from "@/lib/dates";
import {
  MAX_EXPENSE_CENTS,
  MAX_LINE_ITEMS,
  MAX_PAYMENT_CENTS,
  MAX_QUANTITY_MILLI,
  MAX_TRANSACTION_CENTS,
  MAX_UNIT_PRICE_CENTS,
  parseMoneyToCents,
  parseQuantityToMilli,
} from "@/lib/money";
import { ORDER_STATUSES, PAYMENT_METHODS, PRICING_UNITS, ROLES } from "@/lib/labels";

function money(options: { max: number; min?: number; label: string }) {
  const { max, min = 0, label } = options;
  return z.string().transform((value, context) => {
    const cents = parseMoneyToCents(value);
    if (cents === null) {
      context.addIssue({ code: "custom", message: `Enter a valid ${label}, e.g. 1250.50` });
      return z.NEVER;
    }
    if (cents < min) {
      context.addIssue({ code: "custom", message: `The ${label} must be more than zero.` });
      return z.NEVER;
    }
    if (cents > max) {
      context.addIssue({ code: "custom", message: `The ${label} is above the allowed limit.` });
      return z.NEVER;
    }
    return cents;
  });
}

const quantity = z.string().transform((value, context) => {
  const milli = parseQuantityToMilli(value);
  if (milli === null || milli === 0 || milli > MAX_QUANTITY_MILLI) {
    context.addIssue({ code: "custom", message: "Enter a quantity above 0, up to 3 decimals." });
    return z.NEVER;
  }
  return milli;
});

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer.`)
    .optional()
    .transform((value) => value || null);

const ymd = z.string().refine(isValidYmd, "Enter a valid date.");
const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter a valid date and time.");
const optionalLocalDateTime = z
  .union([localDateTime, z.literal("")])
  .optional()
  .transform((value) => value || null);

const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (!value) return true;
    try {
      const { protocol } = new URL(value);
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }, "Enter a full http(s) link.")
  .optional()
  .transform((value) => value || null);

const email = z.email("Enter a valid email address.").max(254);
const optionalEmail = z
  .union([email, z.literal("")])
  .optional()
  .transform((value) => value || null);

export const reasonSchema = z.object({
  reason: z.string().trim().min(3, "Give a reason.").max(500),
});

export const transactionItemSchema = z.object({
  serviceId: z.string().min(1, "Choose a service."),
  quantity,
  unitPrice: money({ max: MAX_UNIT_PRICE_CENTS, label: "price" }),
});

export const transactionSchema = z.object({
  customerId: z.string().optional(),
  customerName: optionalText(120),
  customerPhone: optionalText(40),
  customerEmail: optionalEmail,
  items: z
    .array(transactionItemSchema)
    .min(1, "Add at least one service.")
    .max(MAX_LINE_ITEMS, `An order can have up to ${MAX_LINE_ITEMS} items.`),
  discount: money({ max: MAX_TRANSACTION_CENTS, label: "discount" }),
  additionalCharge: money({ max: MAX_TRANSACTION_CENTS, label: "charge" }),
  /** Left unset, a new order uses an earned free load by itself. */
  redeemFreeLoad: z.boolean().optional(),
  orderDate: localDateTime,
  dueDate: optionalLocalDateTime,
  notes: optionalText(1000),
});
export type TransactionFormValues = z.input<typeof transactionSchema>;
export type TransactionInput = z.output<typeof transactionSchema>;

export const statusUpdateSchema = z.object({
  status: z.enum(ORDER_STATUSES).refine((status) => status !== "CANCELLED", {
    message: "Void the order to cancel it.",
  }),
});

export const paymentSchema = z.object({
  amount: money({ max: MAX_PAYMENT_CENTS, min: 1, label: "amount" }),
  method: z.enum(PAYMENT_METHODS),
  paidAt: localDateTime,
  referenceNumber: optionalText(100),
  notes: optionalText(500),
});
export type PaymentFormValues = z.input<typeof paymentSchema>;
export type PaymentInput = z.output<typeof paymentSchema>;

export const refundSchema = paymentSchema.extend({
  notes: z.string().trim().min(3, "Give a reason for the refund.").max(500),
});
export type RefundFormValues = z.input<typeof refundSchema>;
export type RefundInput = z.output<typeof refundSchema>;

export const expenseSchema = z.object({
  categoryId: z.string().min(1, "Choose a category."),
  description: z.string().trim().min(2, "Enter a description.").max(300),
  amount: money({ max: MAX_EXPENSE_CENTS, min: 1, label: "amount" }),
  expenseDate: ymd,
  paymentMethod: z.enum(PAYMENT_METHODS),
  payee: optionalText(200),
  referenceNumber: optionalText(100),
  notes: optionalText(1000),
  attachmentUrl: httpUrl,
});
export type ExpenseFormValues = z.input<typeof expenseSchema>;
export type ExpenseInput = z.output<typeof expenseSchema>;

export const serviceSchema = z
  .object({
    name: z.string().trim().min(2, "Enter a name.").max(120),
    description: optionalText(500),
    pricingUnit: z.enum(PRICING_UNITS),
    currentPrice: money({ max: MAX_UNIT_PRICE_CENTS, label: "price" }),
    promoEligible: z.boolean().default(false),
    isActive: z.boolean(),
  })
  .refine((service) => !service.promoEligible || service.pricingUnit === "PER_LOAD", {
    message: "Only a service priced per load can count for the promo.",
    path: ["promoEligible"],
  });
export type ServiceFormValues = z.input<typeof serviceSchema>;
export type ServiceInput = z.output<typeof serviceSchema>;

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(120),
  phone: optionalText(40),
  email: optionalEmail,
  notes: optionalText(1000),
});
export type CustomerFormValues = z.input<typeof customerSchema>;
export type CustomerInput = z.output<typeof customerSchema>;

const password = z.string().min(10, "Use at least 10 characters.").max(72, "Use 72 or fewer.");

export const userCreateSchema = z.object({
  name: z.string().trim().min(2, "Enter a name.").max(120),
  email: email.transform((value) => value.toLowerCase()),
  role: z.enum(ROLES),
  password,
});
export type UserCreateValues = z.input<typeof userCreateSchema>;
export type UserCreateInput = z.output<typeof userCreateSchema>;

export const firstOwnerSchema = userCreateSchema
  .omit({ role: true })
  .extend({ confirmPassword: z.string() })
  .refine((owner) => owner.password === owner.confirmPassword, {
    message: "The passwords do not match.",
    path: ["confirmPassword"],
  });
export type FirstOwnerValues = z.input<typeof firstOwnerSchema>;
export type FirstOwnerInput = z.output<typeof firstOwnerSchema>;

export const forgotPasswordSchema = z.object({
  email: email.transform((value) => value.toLowerCase()),
});
export type ForgotPasswordValues = z.input<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(20, "This reset link is incomplete.").max(200),
    password,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "The passwords do not match.",
    path: ["confirmPassword"],
  });
export type ResetPasswordValues = z.input<typeof resetPasswordSchema>;
export type ResetPasswordInput = z.output<typeof resetPasswordSchema>;

export const userUpdateSchema = z.object({
  name: z.string().trim().min(2, "Enter a name.").max(120),
  role: z.enum(ROLES),
  isActive: z.boolean(),
  password: z.union([password, z.literal("")]).optional(),
});
export type UserUpdateValues = z.input<typeof userUpdateSchema>;
export type UserUpdateInput = z.output<typeof userUpdateSchema>;

export const settingsSchema = z.object({
  shopName: z.string().trim().min(2, "Enter the shop name.").max(120),
  address: z.string().trim().max(300),
  contactNumber: z.string().trim().max(60),
  receiptFooter: z.string().trim().max(300),
  receiptPrefix: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{1,6}$/, "Use 1 to 6 capital letters or digits."),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code, e.g. PHP."),
  timeZone: z.string().trim().refine(isValidTimeZone, "Enter a valid time zone."),
});
export type SettingsInput = z.infer<typeof settingsSchema>;

export const promoToggleSchema = z.object({ enabled: z.boolean() });

export const categorySchema = z.object({
  name: z.string().trim().min(2, "Enter a name.").max(80),
  isActive: z.boolean(),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const dateRangeSchema = z
  .object({ from: ymd, to: ymd })
  .refine((range) => range.from <= range.to, "The start date must be before the end date.");
