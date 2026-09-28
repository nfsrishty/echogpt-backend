import { RoleName } from '@prisma/client';
import { Request } from 'express';

/** The authenticated user attached to each request by JwtAuthGuard. */
export interface AuthUser {
  id: string;
  email: string;
  role: RoleName;
  sessionId: string;
}

/** Filled in by AI routes so the usage log can record provider and tokens. */
export interface UsageContext {
  providerId?: string;
  promptTokens?: number;
  completionTokens?: number;
}

export type AuthenticatedRequest = Request & {
  user?: AuthUser;
  usage?: UsageContext;
  /** Set by QuotaGuard on @ConsumesQuota() routes. */
  consumesQuota?: boolean;
  /**
   * Resolves when the handler has finished its own work. The usage logger
   * waits on it, because after a client disconnect the handler may still be
   * saving a partial answer and attaching token usage.
   */
  handlerSettled?: Promise<void>;
};

/** Claims inside the short-lived access token. */
export interface JwtAccessPayload {
  sub: string;
  email: string;
  role: RoleName;
  sid: string;
}

/** Claims inside the long-lived refresh token. */
export interface JwtRefreshPayload {
  sub: string;
  sid: string;
  jti: string;
}
