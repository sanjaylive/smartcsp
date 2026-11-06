import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { maskEmail } from '@csp2all/shared';
import { config } from '../../config/config';
import { Db } from '../../common/db';
import { decryptSecret, encryptSecret, sha256 } from '../../common/crypto';
import { JobsService } from '../../jobs/jobs.service';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  template: string;
}

/** In-memory driver for automated tests. */
export const memoryOutbox: EmailMessage[] = [];

interface EmailDriver {
  send(msg: EmailMessage): Promise<{ messageId?: string }>;
}

class SmtpDriver implements EmailDriver {
  private transport: Transporter;
  constructor() {
    const c = config();
    this.transport = nodemailer.createTransport({
      host: c.SMTP_HOST,
      port: c.SMTP_PORT,
      secure: c.SMTP_SECURE,
      auth: c.SMTP_USER ? { user: c.SMTP_USER, pass: c.SMTP_PASSWORD } : undefined,
      connectionTimeout: 10_000,
    });
  }
  async send(msg: EmailMessage) {
    const r = await this.transport.sendMail({
      from: config().EMAIL_FROM,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    return { messageId: r.messageId };
  }
}

class MemoryDriver implements EmailDriver {
  async send(msg: EmailMessage) {
    memoryOutbox.push(msg);
    return { messageId: `mem-${memoryOutbox.length}` };
  }
}

class ConsoleDriver implements EmailDriver {
  private log = new Logger('ConsoleEmail');
  async send(msg: EmailMessage) {
    // Intentionally does not print the body: bodies can contain one-time codes.
    this.log.log(`email "${msg.template}" to ${maskEmail(msg.to)} (body suppressed)`);
    return {};
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function layout(title: string, bodyHtml: string) {
  return `<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;background:#F6F7FB;padding:24px">
<div style="max-width:480px;margin:auto;background:#fff;border-radius:14px;padding:24px;border:1px solid #DDE1EC">
<div style="font-weight:700;color:#4F46E5;font-size:18px">CSP2All</div><h1 style="font-size:20px;color:#161A2E">${esc(title)}</h1>${bodyHtml}
<p style="color:#525A75;font-size:12px;margin-top:24px">CSP2All is an independent record-keeping tool and is not affiliated with any government body, bank or payment network.</p></div></body></html>`;
}

@Injectable()
export class EmailService implements OnModuleInit {
  private driver: EmailDriver;

  constructor(
    private readonly db: Db,
    private readonly jobs: JobsService,
  ) {
    const d = config().EMAIL_DRIVER;
    this.driver =
      d === 'smtp' ? new SmtpDriver() : d === 'memory' ? new MemoryDriver() : new ConsoleDriver();
  }

  onModuleInit() {
    this.jobs.register('email.send', async (payload) => {
      const p = payload as {
        logId: string;
        to: string;
        subject: string;
        text: string;
        html?: string;
        template: string;
        encrypted?: boolean;
      };
      const msg: EmailMessage = p.encrypted
        ? (JSON.parse(decryptSecret(p.text)) as EmailMessage)
        : { to: p.to, subject: p.subject, text: p.text, html: p.html, template: p.template };
      await this.deliver(p.logId, msg);
    });
  }

  private async deliver(logId: string, msg: EmailMessage) {
    try {
      const r = await this.driver.send(msg);
      await this.db.emailLog.update({
        where: { id: logId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          providerMessageId: r.messageId,
          attempts: { increment: 1 },
        },
      });
    } catch (e) {
      await this.db.emailLog.update({
        where: { id: logId },
        data: {
          status: 'FAILED',
          error: (e as Error).message.slice(0, 300),
          attempts: { increment: 1 },
        },
      });
      throw e;
    }
  }

  /**
   * Sends (or queues) an email. Messages containing secrets are queued encrypted and only in Redis
   * (transient), never in the database outbox.
   */
  async send(msg: EmailMessage, opts: { containsSecret?: boolean } = {}) {
    const log = await this.db.emailLog.create({
      data: { toHash: sha256(msg.to), toMasked: maskEmail(msg.to), template: msg.template },
    });
    if (config().EMAIL_DELIVERY === 'inline') {
      await this.deliver(log.id, msg);
      return;
    }
    const payload = opts.containsSecret
      ? {
          logId: log.id,
          encrypted: true,
          text: encryptSecret(JSON.stringify(msg)),
          template: msg.template,
        }
      : { logId: log.id, ...msg };
    await this.jobs.enqueueTransient('email.send', payload, `email-${log.id}`);
  }

  /** Durable path for non-secret emails: logged and enqueued in the caller's transaction (outbox). */
  async sendInTx(tx: import('../../common/db').Tx, msg: EmailMessage, tenantId?: string | null) {
    const log = await tx.emailLog.create({
      data: { toHash: sha256(msg.to), toMasked: maskEmail(msg.to), template: msg.template },
    });
    await this.jobs.enqueue(
      tx,
      'email.send',
      { logId: log.id, ...msg },
      { tenantId, dedupeKey: `email:${log.id}` },
    );
  }

  otpEmail(to: string, code: string, minutes: number, purpose: string): EmailMessage {
    const title =
      purpose === 'ADMIN_LOGIN' ? 'Your CSP2All admin sign-in code' : 'Your CSP2All sign-in code';
    return {
      to,
      template: 'otp',
      subject: `${code} is your CSP2All code`,
      text: `Your CSP2All code is ${code}. It expires in ${minutes} minutes. If you did not request it, ignore this email. Never share this code.`,
      html: layout(
        title,
        `<p style="font-size:32px;letter-spacing:8px;font-weight:700;color:#161A2E">${esc(code)}</p><p>This code expires in ${minutes} minutes. Never share it with anyone, including CSP2All staff.</p>`,
      ),
    };
  }

  simple(to: string, template: string, subject: string, text: string): EmailMessage {
    return { to, template, subject, text, html: layout(subject, `<p>${esc(text)}</p>`) };
  }
}
