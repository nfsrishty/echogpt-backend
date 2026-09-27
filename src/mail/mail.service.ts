import { Injectable, Logger } from '@nestjs/common';

/**
 * Development mailer: logs emails to the console instead of sending them.
 * Swapping in a real provider (SMTP via nodemailer, SES, Resend) only means
 * changing this class; callers depend on these method names, not on transport.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  sendEmailVerification(to: string, token: string): Promise<void> {
    this.logger.log(
      `[DEV MAIL] To: ${to} | Email verification token: ${token} ` +
        `(POST /api/v1/auth/verify-email with {"token": "..."})`,
    );

    return Promise.resolve();
  }
}
