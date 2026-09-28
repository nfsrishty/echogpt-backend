/**
 * Turns a User-Agent header into a short label like "Chrome on Windows".
 * Order matters: Edge and Opera UAs also contain "Chrome", Chrome UAs contain
 * "Safari", Android UAs contain "Linux" and iPhone UAs contain "Mac OS X".
 */
export function describeUserAgent(userAgent?: string | null): string {
  if (!userAgent) {
    return 'Unknown device';
  }

  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\/|Opera/.test(userAgent)
      ? 'Opera'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Firefox\//.test(userAgent)
          ? 'Firefox'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : /PostmanRuntime/.test(userAgent)
              ? 'Postman'
              : /curl\//.test(userAgent)
                ? 'curl'
                : /^node$|undici/i.test(userAgent)
                  ? 'Node.js'
                  : 'Unknown app';

  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(userAgent)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(userAgent)
          ? 'macOS'
          : /CrOS/.test(userAgent)
            ? 'ChromeOS'
            : /Linux/.test(userAgent)
              ? 'Linux'
              : null;

  return os ? `${browser} on ${os}` : browser;
}
