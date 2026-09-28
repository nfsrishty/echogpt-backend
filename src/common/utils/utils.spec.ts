import { safeEqual, sha256 } from './hash.util';
import { httpStatusText } from './http-status.util';
import { escapeLike, startOfUtcDay, toSqlTimestamp } from './sql.util';
import { describeUserAgent } from './user-agent.util';

describe('escapeLike', () => {
  it.each([
    ['%', '\\%'],
    ['_', '\\_'],
    ['50%_off', '50\\%\\_off'],
    ['back\\slash', 'back\\\\slash'],
    ['plain text', 'plain text'],
  ])('escapes %p as %p', (input, expected) => {
    expect(escapeLike(input)).toBe(expected);
  });
});

describe('UTC date helpers', () => {
  it('startOfUtcDay truncates to midnight UTC', () => {
    expect(
      startOfUtcDay(new Date('2026-09-27T23:59:59.999Z')).toISOString(),
    ).toBe('2026-09-27T00:00:00.000Z');
  });

  it('toSqlTimestamp produces a zone-less UTC timestamp', () => {
    expect(toSqlTimestamp(new Date('2026-09-27T08:05:00.000Z'))).toBe(
      '2026-09-27 08:05:00.000',
    );
  });
});

describe('hash helpers', () => {
  it('sha256 is deterministic hex', () => {
    expect(sha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('safeEqual compares correctly, including different lengths', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('httpStatusText', () => {
  it.each([
    [404, 'Not Found'],
    [429, 'Too Many Requests'],
    [502, 'Bad Gateway'],
    [799, 'Error'],
  ])('%p -> %p', (code, text) => {
    expect(httpStatusText(code)).toBe(text);
  });
});

describe('describeUserAgent', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
      'Chrome on Windows',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0',
      'Edge on Windows',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      'Safari on macOS',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      'Safari on iOS',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
      'Chrome on Android',
    ],
    [
      'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
      'Firefox on Linux',
    ],
    ['PostmanRuntime/7.42.0', 'Postman'],
    ['curl/8.9.1', 'curl'],
    [null, 'Unknown device'],
  ])('%s -> %p', (ua, label) => {
    expect(describeUserAgent(ua)).toBe(label);
  });
});
