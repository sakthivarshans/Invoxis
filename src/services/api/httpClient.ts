import { API_BASE_URL } from '../../config';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
    public readonly requestId?: string | null
  ) {
    super(message);
    this.name = 'ApiError';
  }
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

/** Human-readable message for any thrown value; backend messages are passed through unchanged. */
export function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    const fields = Array.isArray(e.details)
      ? (e.details as Array<{ field?: string; message?: string }>)
          .filter((d) => d?.message)
          .map((d) => (d.field ? `${d.field}: ${d.message}` : d.message))
          .join('; ')
      : '';
    return fields ? `${e.message} (${fields})` : e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  form?: FormData;
  signal?: AbortSignal;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(API_BASE_URL + path, window.location.origin);
  Object.entries(opts.query ?? {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  });

  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form; // browser sets the multipart boundary
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), { method: opts.method ?? 'GET', headers, body, signal: opts.signal });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new ApiError(
      `Cannot reach the backend at ${API_BASE_URL}. Is it running, and is this origin allowed by CORS_ORIGINS?`,
      0,
      'network_error'
    );
  }

  if (res.status === 204) return undefined as T;

  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    /* non-JSON body */
  }

  if (!res.ok) {
    const err = payload?.error;
    throw new ApiError(
      err?.message || `Request failed with HTTP ${res.status}`,
      res.status,
      err?.code || 'http_error',
      err?.details,
      err?.request_id
    );
  }
  return payload as T;
}
