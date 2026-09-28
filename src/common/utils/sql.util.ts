/**
 * Escapes LIKE wildcards so user input is matched literally.
 * Prisma's contains/startsWith do NOT do this: searching "%" would match
 * every row. Backslash is PostgreSQL's default LIKE escape character.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

/** "2026-09-27 00:00:00" (UTC). Safe to cast with ::timestamp in raw SQL. */
export function toSqlTimestamp(date: Date): string {
  return date.toISOString().replace('T', ' ').replace('Z', '');
}

export function startOfUtcDay(date: Date = new Date()): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}
