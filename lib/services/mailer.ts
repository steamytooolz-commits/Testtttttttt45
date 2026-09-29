import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Outbound email service.
 *
 * Mail delivery is env-gated: when MAIL_HOST is unset (local dev, CI, unit
 * tests) the service degrades to a logged no-op so flows never fail because
 * of mail. In production set MAIL_HOST/MAIL_PORT/MAIL_USER/MAIL_PASS/MAIL_FROM
 * and SALES_TEAM_EMAIL in .env (mode 600, never committed).
 *
 * Tests can observe sends via setEmailSpy.
 */

type MailAttachment = { filename: string; content: Buffer; contentType?: string };

export interface MailMessage {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  const host = process.env.MAIL_HOST;
  if (!host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.MAIL_PORT || 587),
      secure: process.env.MAIL_SECURE === 'true',
      auth:
        process.env.MAIL_USER && process.env.MAIL_PASS
          ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
          : undefined,
    });
  }
  return transporter;
}

/** Test hook: set to capture every "sent" message (no-op mode included). */
export let onEmailSent: ((msg: { to: string; subject: string; attachments: MailAttachment[] }) => void) | null = null;

export function setEmailSpy(fn: typeof onEmailSent): void {
  onEmailSent = fn;
}

function normalizeTo(to: string | string[]): string {
  return Array.isArray(to) ? to.join(', ') : to;
}

/** Fire-and-forget send: resolves after delivery attempt, never throws. */
export async function sendMail(msg: MailMessage): Promise<void> {
  const from = process.env.MAIL_FROM || 'Stationery Depot <no-reply@stationerydepot.co.za>';
  const tx = getTransporter();
  const to = normalizeTo(msg.to);

  if (!tx) {
    console.log(
      `[mailer:noop] to=${to} subject="${msg.subject}" attachments=${msg.attachments?.length ?? 0} (MAIL_HOST not configured)`
    );
    try {
      onEmailSent?.({ to, subject: msg.subject, attachments: msg.attachments ?? [] });
    } catch {
      // spy must never break the flow
    }
    return;
  }

  try {
    await tx.sendMail({
      from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      attachments: msg.attachments,
    });
    try {
      onEmailSent?.({ to, subject: msg.subject, attachments: msg.attachments ?? [] });
    } catch {
      // spy must never break the flow
    }
  } catch (err) {
    // Mail is an enhancement: log and swallow so business flows are unaffected.
    console.error(`[mailer] failed to send to=${to} subject="${msg.subject}":`, err instanceof Error ? err.message : err);
  }
}

/** Recipient list for sales-team notifications. */
export function salesTeamEmails(): string[] {
  const raw = process.env.SALES_TEAM_EMAIL || 'sales@stationerydepot.co.za';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
