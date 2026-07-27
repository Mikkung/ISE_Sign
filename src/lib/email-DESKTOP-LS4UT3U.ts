import nodemailer from "nodemailer";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailSendResult {
  sent: boolean;
  provider: "smtp" | "development-log";
  warning?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export class DevelopmentEmailProvider implements EmailProvider {
  async send(): Promise<EmailSendResult> {
    return {
      sent: false,
      provider: "development-log",
      warning: "SMTP credentials are not configured; email was recorded in notification_logs only."
    };
  }
}

export class SmtpEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<EmailSendResult> {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASSWORD
          ? {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASSWORD
            }
          : undefined
    });

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html
    });

    return {
      sent: true,
      provider: "smtp"
    };
  }
}

export function createEmailProvider(): EmailProvider {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    return new DevelopmentEmailProvider();
  }

  return new SmtpEmailProvider();
}
