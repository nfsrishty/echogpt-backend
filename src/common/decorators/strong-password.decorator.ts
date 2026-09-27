import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Password policy used everywhere a NEW password is set.
 * Max 72: bcrypt silently ignores bytes beyond 72, so longer input would give
 * a false sense of security.
 */
export const StrongPassword = () =>
  applyDecorators(
    IsString(),
    MinLength(8),
    MaxLength(72),
    Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
      message: 'password must contain at least one letter and one number',
    }),
  );
