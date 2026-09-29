import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApiError, apiFetch, apiMessage, readApiData } from '@/lib/api-client';

const HTML_404 =
  '<!DOCTYPE html><html><head><title>404: This page could not be found</title></head><body></body></html>';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function htmlResponse(html: string, status = 404) {
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readApiData', () => {
  it('parses a JSON body and returns it', async () => {
    await expect(readApiData(jsonResponse({ orders: [1, 2] }))).resolves.toEqual({ orders: [1, 2] });
  });

  it('still returns the parsed payload for error statuses so callers can read details', async () => {
    await expect(
      readApiData(jsonResponse({ error: 'USER_NOT_FOUND', message: 'User #9 does not exist' }, 404))
    ).resolves.toEqual({ error: 'USER_NOT_FOUND', message: 'User #9 does not exist' });
  });

  it('throws a diagnostic naming the HTML page instead of a JSON parser crash', async () => {
    const err = await readApiData(htmlResponse(HTML_404)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toMatch(/Expected JSON/);
    expect((err as ApiError).message).toMatch(/text\/html/);
    expect((err as ApiError).message).toMatch(/404: This page could not be found/);
    expect((err as ApiError).message).not.toMatch(/Unexpected token/);
    expect((err as ApiError).status).toBe(404);
  });

  it('reports malformed JSON when the content type claims JSON', async () => {
    const res = new Response('{ not json ', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    await expect(readApiData(res)).rejects.toThrow(/Malformed JSON/);
  });

  it('returns null for an empty successful body and throws for an empty error body', async () => {
    await expect(readApiData(new Response(null, { status: 204 }))).resolves.toBeNull();
    await expect(readApiData(new Response('', { status: 500 }))).rejects.toThrow(/empty body/);
  });
});

describe('apiMessage', () => {
  it('prefers an explicit message over the error code', () => {
    expect(apiMessage({ message: 'Too many attempts', error: 'RATE_LIMIT_EXCEEDED' }, 'fallback')).toBe(
      'Too many attempts'
    );
  });

  it('uses a concrete error code', () => {
    expect(apiMessage({ error: 'USER_NOT_FOUND' }, 'fallback')).toBe('USER_NOT_FOUND');
  });

  it('never shows the useless generic "Validation failed" and names the field instead', () => {
    expect(
      apiMessage({ error: 'Validation failed', details: { email: ['Invalid email'] } }, 'fallback')
    ).toBe('Email: Invalid email');
    expect(
      apiMessage({ error: 'VALIDATION_ERROR', details: { credit_limit: ['Must be positive'] } }, 'fallback')
    ).toBe('Credit limit: Must be positive');
  });

  it('humanizes camelCase field names too', () => {
    expect(apiMessage({ details: { creditLimit: ['Too high'] } }, 'fallback')).toBe('Credit Limit: Too high');
  });

  it('falls back when there is nothing usable', () => {
    expect(apiMessage({ error: 'Validation failed' }, 'fallback')).toBe('Validation failed');
    expect(apiMessage(null, 'fallback')).toBe('fallback');
    expect(apiMessage({ details: { email: [] } }, 'fallback')).toBe('fallback');
    expect(apiMessage('plain string body', 'fallback')).toBe('plain string body');
  });
});

describe('apiFetch', () => {
  it('resolves the parsed body on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true, count: 3 })));
    await expect(apiFetch<{ ok: boolean; count: number }>('http://localhost/api/x', undefined, 'Failed')).resolves.toEqual(
      { ok: true, count: 3 }
    );
  });

  it('throws an ApiError carrying status, code and field details on a 400', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ error: 'VALIDATION_ERROR', details: { unitPrice: ['Must be a price like 85.00'] } }, 400)
      )
    );
    const err = (await apiFetch('http://localhost/api/x', undefined, 'Save failed').catch(
      (e: unknown) => e
    )) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('Unit Price: Must be a price like 85.00');
    expect(err.details).toEqual({ unitPrice: ['Must be a price like 85.00'] });
  });

  it('names an HTML error page rather than crashing on the parser', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse(HTML_404)));
    const err = (await apiFetch('http://localhost/api/x', undefined, 'Save failed').catch(
      (e: unknown) => e
    )) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toMatch(/Expected JSON/);
    expect(err.message).toMatch(/404: This page could not be found/);
  });
});
