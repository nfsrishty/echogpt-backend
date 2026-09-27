import { BadRequestException, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { sha256 } from '../common/utils/hash.util';
import { MailService } from '../mail/mail.service';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  /** Creates a fresh token (invalidating older unused ones) and emails it. */
  async sendVerification(user: { id: string; email: string }): Promise<void> {
    const token = randomBytes(32).toString('hex');

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.deleteMany({
        where: { userId: user.id, usedAt: null },
      }),
      this.prisma.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
        },
      }),
    ]);

    await this.mailService.sendEmailVerification(user.email, token);
  }

  async verify(token: string): Promise<void> {
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: sha256(token) },
    });

    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { isEmailVerified: true },
      }),
    ]);
  }

  async resend(userId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, isEmailVerified: true },
    });

    if (user.isEmailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    await this.sendVerification(user);
  }
}
