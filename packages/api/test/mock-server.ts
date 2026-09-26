import { md5 } from '@sonora/utils';
import type { FetchLike } from '../src';

export interface Call {
  endpoint: string;
  method: string;
  params: URLSearchParams;
}

type Handler = (params: URLSearchParams) => unknown;

/**
 * Minimal in-process Subsonic server used by API tests. Verifies token auth
 * exactly like Navidrome: t must equal md5(password + s).
 */
export function mockServer(opts: { password?: string; handlers?: Record<string, Handler> } = {}) {
  const password = opts.password ?? 'secret';
  const calls: Call[] = [];
  const ok = (body: Record<string, unknown> = {}) => ({
    'subsonic-response': { status: 'ok', version: '1.16.1', type: 'navidrome', serverVersion: '0.64.2', openSubsonic: true, ...body },
  });
  const fail = (code: number, message: string) => ({
    'subsonic-response': { status: 'failed', version: '1.16.1', error: { code, message } },
  });
  const handlers: Record<string, Handler> = {
    ping: () => ({}),
    getOpenSubsonicExtensions: () => ({ openSubsonicExtensions: [{ name: 'formPost', versions: [1] }, { name: 'songLyrics', versions: [1] }] }),
    getUser: (p) => ({ user: { username: p.get('username'), adminRole: false, streamRole: true, downloadRole: true } }),
    ...opts.handlers,
  };

  const fetch: FetchLike = async (input, init) => {
    const url = new URL(input);
    const endpoint = url.pathname.replace(/^.*\/rest\//, '');
    const params = init?.method === 'POST' ? new URLSearchParams(String(init.body)) : url.searchParams;
    calls.push({ endpoint, method: init?.method ?? 'GET', params });
    if (!url.pathname.includes('/rest/')) return new Response('not found', { status: 404 });
    const salt = params.get('s') ?? '';
    if (params.get('p') || params.get('t') !== md5(password + salt)) {
      return Response.json(fail(40, 'Wrong username or password'));
    }
    if (params.get('f') !== 'json' && endpoint !== 'stream') return new Response('<xml/>');
    const handler = handlers[endpoint];
    if (!handler) return Response.json(fail(70, `Unknown endpoint ${endpoint}`));
    const body = handler(params);
    if (body instanceof Response) return body;
    return Response.json(ok(body as Record<string, unknown>));
  };

  return { fetch, calls, ok, fail };
}
