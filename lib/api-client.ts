/**
 * Shared client-side API plumbing for our own route handlers.
 *
 * When a route is missing, renamed or crashes, Next answers with an HTML document instead of
 * JSON — and a bare `res.json()` then fails with
 * `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`, which tells nobody anything.
 * These helpers check the content type before parsing and turn every failure into a message
 * that names the real problem (missing route, HTML error page, or the actual field error).
 */

export interface ApiFieldDetails {
  [field: string]: string[] | undefined;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: ApiFieldDetails;
  readonly data?: unknown;

  constructor(
    message: string,
    opts: { status: number; code?: string; details?: ApiFieldDetails; data?: unknown }
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = opts.status;
    this.code = opts.code;
    this.details = opts.details;
    this.data = opts.data;
  }
}

const GENERIC_CODES = new Set(['Validation failed', 'VALIDATION_ERROR']);

function humanizeField(field: string): string {
  const spaced = field
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  return spaced.length > 0 ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : field;
}

/**
 * Picks the most useful message out of a JSON error payload, in order of specificity:
 * `message` -> concrete `error` -> first zod field error -> generic `error` -> fallback.
 * This is what stops users seeing the bare string "Validation failed".
 */
export function apiMessage(data: unknown, fallback: string): string {
  if (typeof data === 'string' && data.trim().length > 0) {
    return data.trim();
  }

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;

    if (typeof record.message === 'string' && record.message.trim().length > 0) {
      return record.message.trim();
    }

    const errorCode = typeof record.error === 'string' ? record.error.trim() : '';
    if (errorCode.length > 0 && !GENERIC_CODES.has(errorCode)) {
      return errorCode;
    }

    const details = record.details;
    if (details && typeof details === 'object') {
      for (const [field, value] of Object.entries(details as Record<string, unknown>)) {
        const candidate = Array.isArray(value)
          ? value.find((entry) => typeof entry === 'string' && entry.trim().length > 0)
          : typeof value === 'string' && value.trim().length > 0
            ? value
            : undefined;
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
          return `${humanizeField(field)}: ${candidate.trim()}`;
        }
      }
    }

    if (errorCode.length > 0) {
      return errorCode;
    }
  }

  return fallback;
}

function bodySnippet(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(collapsed);
  if (title && title[1].trim().length > 0) {
    return `HTML page ("${title[1].trim().slice(0, 80)}")`;
  }
  return collapsed.slice(0, 100) || '(empty body)';
}

function requestPath(res: Response): string {
  try {
    return new URL(res.url).pathname;
  } catch {
    return 'the server';
  }
}

/** Shape of our route-handler JSON bodies, loose enough to index but typed for error fields. */
export type ApiResponseBody = Record<string, unknown> & {
  message?: string;
  error?: string;
  details?: ApiFieldDetails;
};

/**
 * Reads a response body as JSON without ever crashing on HTML. Throws ApiError carrying a
 * diagnostic for non-JSON or malformed bodies. The parsed payload is returned even for error
 * statuses, so callers can still inspect `error` / `details` and decide what to show.
 */
export async function readApiData<T = ApiResponseBody>(res: Response): Promise<T> {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const text = await res.text();

  if (text.trim().length === 0) {
    if (res.ok) {
      return null as T;
    }
    throw new ApiError(
      `${res.status} ${res.statusText || 'Request failed'} from ${requestPath(res)} with an empty body`,
      { status: res.status }
    );
  }

  if (!contentType.includes('json')) {
    throw new ApiError(
      `Expected JSON from ${requestPath(res)} but the server returned ${contentType.split(';')[0] || 'an unknown content type'} — ${bodySnippet(text)}. The route may not exist (check the URL) or it failed before responding.`,
      { status: res.status }
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(
      `Malformed JSON from ${requestPath(res)} (HTTP ${res.status}): ${bodySnippet(text)}`,
      { status: res.status }
    );
  }
}

/** `fetch` + `readApiData`, throwing an ApiError with the best available message on failure. */
export async function apiFetch<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
  fallbackMessage = 'Request failed'
): Promise<T> {
  const res = await fetch(input, init);
  const data = await readApiData(res);

  if (!res.ok) {
    const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : undefined;
    throw new ApiError(apiMessage(data, `${fallbackMessage} (HTTP ${res.status})`), {
      status: res.status,
      code: typeof record?.error === 'string' ? record.error : undefined,
      details: (record?.details as ApiFieldDetails | undefined) ?? undefined,
      data,
    });
  }

  return data as T;
}
