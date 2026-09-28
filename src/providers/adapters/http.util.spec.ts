import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { ProviderRequestError } from './ai-provider.adapter';
import { providerFetch, readSseEvents } from './http.util';

/** Builds a ReadableStream that delivers the given chunks one by one. */
function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const events = [];
  for await (const event of readSseEvents(stream)) {
    events.push(event);
  }
  return events;
}

describe('readSseEvents', () => {
  it('parses events split across network chunks', async () => {
    const events = await collect(
      streamOf('data: {"a"', ':1}\n\nevent: delta\nda', 'ta: hi\n\n'),
    );
    expect(events).toEqual([
      { event: undefined, data: '{"a":1}' },
      { event: 'delta', data: 'hi' },
    ]);
  });

  it('handles CRLF line endings, even split between chunks', async () => {
    const events = await collect(
      streamOf('data: one\r', '\n\r\ndata: two\r\n\r\n'),
    );
    expect(events.map((e) => e.data)).toEqual(['one', 'two']);
  });

  it('ignores comments/keep-alives and joins multi-line data', async () => {
    const events = await collect(
      streamOf(': keep-alive\n\ndata: line1\ndata: line2\n\n'),
    );
    expect(events).toEqual([{ event: undefined, data: 'line1\nline2' }]);
  });

  it('emits a final event without a trailing blank line', async () => {
    const events = await collect(streamOf('data: last'));
    expect(events).toEqual([{ event: undefined, data: 'last' }]);
  });
});

describe('providerFetch', () => {
  let server: Server;
  let baseUrl: string;
  let handler: (req: IncomingMessage, res: ServerResponse) => void;

  beforeAll(async () => {
    server = createServer((req, res) => handler(req, res));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  const statusSequence = (codes: number[]) => {
    let calls = 0;
    handler = (_req, res) => {
      const code = codes[Math.min(calls, codes.length - 1)];
      calls++;
      res.writeHead(code, { 'Retry-After': '0' }).end('{}');
    };
    return () => calls;
  };

  it('retries temporary failures (503) and then succeeds', async () => {
    const calls = statusSequence([503, 503, 200]);
    const response = await providerFetch(baseUrl, {
      method: 'GET',
      headers: {},
      timeoutMs: 2000,
    });
    expect(response.status).toBe(200);
    expect(calls()).toBe(3);
  });

  it('gives up after the retry budget', async () => {
    const calls = statusSequence([503]);
    await expect(
      providerFetch(baseUrl, {
        method: 'GET',
        headers: {},
        timeoutMs: 2000,
        retries: 1,
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(calls()).toBe(2);
  });

  it('does NOT retry permanent errors like 401', async () => {
    const calls = statusSequence([401, 200]);
    await expect(
      providerFetch(baseUrl, { method: 'GET', headers: {}, timeoutMs: 2000 }),
    ).rejects.toBeInstanceOf(ProviderRequestError);
    expect(calls()).toBe(1);
  });

  it('reports timeouts distinctly and does not retry them', async () => {
    let calls = 0;
    handler = () => {
      calls++; // never respond
    };
    await expect(
      providerFetch(baseUrl, { method: 'GET', headers: {}, timeoutMs: 150 }),
    ).rejects.toMatchObject({ timedOut: true, status: 504 });
    expect(calls).toBe(1);
  });
});
