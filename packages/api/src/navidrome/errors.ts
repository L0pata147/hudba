/**
 * Error model for the Navidrome/Subsonic API layer.
 * UI code switches on `kind` to decide what to show (retry, re-login, 404 …).
 */

export type ApiErrorKind =
  | 'network' // server unreachable, DNS, CORS, offline
  | 'timeout'
  | 'auth' // wrong credentials / token rejected
  | 'forbidden' // user lacks the permission
  | 'not-found'
  | 'server' // 5xx or malformed response
  | 'unsupported' // endpoint/version not supported by the server
  | 'aborted'
  | 'api'; // any other Subsonic error code

export class NavidromeError extends Error {
  readonly kind: ApiErrorKind;
  /** Subsonic error code when available */
  readonly code?: number;
  readonly status?: number;

  constructor(kind: ApiErrorKind, message: string, opts: { code?: number; status?: number; cause?: unknown } = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'NavidromeError';
    this.kind = kind;
    this.code = opts.code;
    this.status = opts.status;
  }

  get retryable(): boolean {
    return this.kind === 'network' || this.kind === 'timeout' || this.kind === 'server';
  }
}

/** Maps a Subsonic `error.code` to our error kinds. */
export function kindForSubsonicCode(code: number): ApiErrorKind {
  switch (code) {
    case 40:
    case 41:
    case 42:
    case 43:
    case 44:
      return 'auth';
    case 50:
      return 'forbidden';
    case 70:
      return 'not-found';
    case 20:
    case 30:
      return 'unsupported';
    default:
      return 'api';
  }
}

export function isNavidromeError(e: unknown): e is NavidromeError {
  return e instanceof NavidromeError;
}

/** User-facing message for any thrown value. Never includes credentials. */
export function describeError(e: unknown): string {
  if (isNavidromeError(e)) {
    switch (e.kind) {
      case 'network':
        return 'Unable to connect to your music server. Check your connection and try again.';
      case 'timeout':
        return 'The server took too long to respond.';
      case 'auth':
        return 'Wrong username or password.';
      case 'forbidden':
        return 'Your account is not allowed to do that.';
      case 'not-found':
        return 'This item no longer exists on the server.';
      case 'unsupported':
        return 'Your server does not support this feature.';
      case 'server':
        return 'The server returned an unexpected response.';
      case 'aborted':
        return 'The request was cancelled.';
      default:
        return e.message || 'Something went wrong.';
    }
  }
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}
