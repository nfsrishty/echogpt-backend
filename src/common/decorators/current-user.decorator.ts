import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import {
  AuthenticatedRequest,
  AuthUser,
} from '../interfaces/auth-user.interface';

/**
 * Injects the authenticated user into a controller method.
 *   @CurrentUser() user: AuthUser
 *   @CurrentUser('id') userId: string
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    return field ? user?.[field] : user;
  },
);
