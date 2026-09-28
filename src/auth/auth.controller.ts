import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ApiAuth } from '../common/decorators/api-auth.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { MessageResponseDto } from '../common/dto/message-response.dto';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { getClientMeta } from '../common/utils/request-meta.util';
import { AuthService } from './auth.service';
import { AuthResponseDto, TokensResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { SessionResponseDto } from './dto/session-response.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

/** Stricter limit on credential endpoints to slow down brute-force attempts. */
const AUTH_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  @ApiOperation({
    summary: 'Register a new account',
    description:
      'Creates a USER-role account on the Free plan, sends an email verification token, and returns a token pair.',
  })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Validation failed',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Email already registered',
  })
  @ApiTooManyRequestsResponse({
    type: ErrorResponseDto,
    description: 'Rate limit exceeded (5/min)',
  })
  register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
  ): Promise<AuthResponseDto> {
    return this.authService.register(dto, getClientMeta(request));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in',
    description:
      'Opens a new session for this device and returns a token pair.',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Validation failed',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Invalid email or password',
  })
  @ApiTooManyRequestsResponse({
    type: ErrorResponseDto,
    description: 'Rate limit exceeded (5/min)',
  })
  login(
    @Body() dto: LoginDto,
    @Req() request: Request,
  ): Promise<AuthResponseDto> {
    return this.authService.login(dto, getClientMeta(request));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh the token pair',
    description:
      'Exchanges a refresh token for a new access + refresh token. Each refresh token is single-use; presenting an already-used one revokes the session.',
  })
  @ApiOkResponse({ type: TokensResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Malformed refresh token',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Invalid, expired, revoked or reused refresh token',
  })
  refresh(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
  ): Promise<TokensResponseDto> {
    return this.authService.refresh(dto.refreshToken, getClientMeta(request));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth()
  @ApiOperation({
    summary: 'Log out of the current device',
    description:
      'Revokes the current session. Its access and refresh tokens stop working immediately.',
  })
  @ApiNoContentResponse({ description: 'Session revoked' })
  async logout(@CurrentUser() user: AuthUser): Promise<void> {
    await this.authService.logout(user);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiAuth()
  @ApiOperation({ summary: 'Log out of all devices' })
  @ApiOkResponse({ type: MessageResponseDto })
  async logoutAll(@CurrentUser() user: AuthUser): Promise<MessageResponseDto> {
    const count = await this.authService.logoutAll(user);

    return { message: `Logged out of ${count} session(s)` };
  }

  @Get('sessions')
  @ApiAuth()
  @ApiOperation({
    summary: 'List my active sessions (logged-in devices)',
    description:
      'Each login opens a session. `current` marks the device making this request.',
  })
  @ApiOkResponse({ type: SessionResponseDto, isArray: true })
  listSessions(@CurrentUser() user: AuthUser): Promise<SessionResponseDto[]> {
    return this.authService.listSessions(user);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth()
  @ApiOperation({
    summary: 'Sign out one of my devices',
    description:
      'Revokes that session immediately. Revoking the current session is the same as logging out.',
  })
  @ApiNoContentResponse({ description: 'Session revoked' })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'No such active session of yours',
  })
  async revokeSession(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.authService.revokeSession(user, id);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify an email address with the emailed token' })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Invalid or expired token',
  })
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<MessageResponseDto> {
    await this.authService.verifyEmail(dto.token);

    return { message: 'Email verified successfully' };
  }

  @Throttle(AUTH_THROTTLE)
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiAuth()
  @ApiOperation({ summary: 'Resend the email verification token' })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Email already verified',
  })
  async resendVerification(
    @CurrentUser() user: AuthUser,
  ): Promise<MessageResponseDto> {
    await this.authService.resendVerification(user);

    return { message: 'Verification email sent' };
  }
}
