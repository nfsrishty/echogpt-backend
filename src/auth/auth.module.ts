import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from '../mail/mail.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { TokenService } from './token.service';

@Module({
  imports: [
    // Secrets are passed per call (access vs refresh), so none is set here.
    // global: true lets the app-wide JwtAuthGuard inject JwtService.
    JwtModule.register({ global: true }),
    MailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, EmailVerificationService],
  exports: [TokenService],
})
export class AuthModule {}
