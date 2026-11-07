import "server-only";
import nodemailer from "nodemailer";
import { z } from "zod";

/**
 * Outgoing email over SMTP. The defaults suit a Gmail account with 2-Step
 * Verification and an app password; another provider only needs SMTP_HOST and
 * SMTP_PORT.
 */
const mailEnvSchema = z.object({
  SMTP_HOST: z.string().trim().min(1).default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
  SMTP_USER: z.string().trim().min(1),
  // Gmail shows app passwords in groups of four; the spaces are not part of it.
  SMTP_PASSWORD: z
    .string()
    .min(1)
    .transform((value) => value.replace(/\s+/g, "")),
  MAIL_FROM: z.string().trim().optional(),
});

type MailConfig = z.output<typeof mailEnvSchema>;

function readMailConfig(): MailConfig | null {
  const parsed = mailEnvSchema.safeParse({
    SMTP_HOST: process.env.SMTP_HOST || undefined,
    SMTP_PORT: process.env.SMTP_PORT || undefined,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD,
    MAIL_FROM: process.env.MAIL_FROM || undefined,
  });
  return parsed.success ? parsed.data : null;
}

export function isMailConfigured() {
  return readMailConfig() !== null;
}

export type OutgoingMail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Shown as the sender's name when MAIL_FROM is not set. */
  fromName: string;
};

export async function sendMail(mail: OutgoingMail) {
  const config = readMailConfig();
  if (!config) throw new Error("Email is not set up: SMTP_USER and SMTP_PASSWORD are required.");
  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD },
  });
  await transport.sendMail({
    from: config.MAIL_FROM ?? { name: mail.fromName, address: config.SMTP_USER },
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
}
