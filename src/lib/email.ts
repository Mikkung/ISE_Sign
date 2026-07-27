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
  async send(message: EmailMessage): Promise<EmailSendResult> {
    void message;

    return {
      sent: false,
      provider: "development-log",
      warning: "SMTP credentials are not configured; email was recorded in notification_logs only."
    };
  }
}

export class SmtpEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<EmailSendResult> {
    const nodemailer = await import("nodemailer");
    const port = Number(process.env.SMTP_PORT ?? 587);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE === "true" || port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    });

    await transporter.sendMail({
      from: process.env.EMAIL_FROM ?? process.env.SMTP_USER,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text
    });

    return {
      sent: true,
      provider: "smtp"
    };
  }
}

export function createEmailProvider(): EmailProvider {
  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASSWORD ||
    !process.env.EMAIL_FROM
  ) {
    return new DevelopmentEmailProvider();
  }

  return new SmtpEmailProvider();
}
