import { HttpStatus } from '@nestjs/common';

/** 429 -> "Too Many Requests", 404 -> "Not Found" */
export function httpStatusText(statusCode: number): string {
  const name = HttpStatus[statusCode] as string | undefined;
  if (!name) {
    return 'Error';
  }

  return name
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
