

const SENSITIVE_KEYS = new Set([
  'email',
  'phone',
  'address',
  'addressjson',
  'street',
  'city',
  'province',
  'postalcode',
  'postal_code',
  'password',
  'passwordhash',
  'newpassword',
  'new_password',
  'temppassword',
  'temp_password',
  'token',
  'csrftoken',
  'totpsecret',
  'totpsecretencrypted',
  'totpuri',
  'totpcode',
  'totp_code',
  'challengetoken',
  'challenge_token',
  'recaptchatoken',
  'recaptcha_token',
  'captchanonce',
  'captcha_nonce',
  'nonce',
  'pownonce',
  'pow_nonce',
  'solution',
  'code',
  'secret',
  'authorization',
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

function redactValue(key: string, val: unknown): unknown {
  if (val === null || val === undefined) {
    return val;
  }
  const lowerKey = normalizeKey(key);
  if (SENSITIVE_KEYS.has(lowerKey)) {
    return '[REDACTED]';
  }
  if (typeof val === 'object') {
    if (Array.isArray(val)) {
      return val.map((item) => redactValue(key, item));
    }
    const record = val as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};
    for (const k of Object.keys(record)) {
      sanitized[k] = redactValue(k, record[k]);
    }
    return sanitized;
  }
  return val;
}

export interface LogContext {
  [key: string]: unknown;
}

export const logger = {
  info(message: string, context?: LogContext): void {
    const sanitizedContext = context ? (redactValue('context', context) as LogContext) : undefined;
    const entry = {
      level: 'INFO',
      timestamp: new Date().toISOString(),
      message,
      ...(sanitizedContext ? { context: sanitizedContext } : {}),
    };
    process.stdout.write(`${JSON.stringify(entry)}\n`);
  },
  warn(message: string, context?: LogContext): void {
    const sanitizedContext = context ? (redactValue('context', context) as LogContext) : undefined;
    const entry = {
      level: 'WARN',
      timestamp: new Date().toISOString(),
      message,
      ...(sanitizedContext ? { context: sanitizedContext } : {}),
    };
    process.stderr.write(`${JSON.stringify(entry)}\n`);
  },
  error(message: string, error?: unknown, context?: LogContext): void {
    const sanitizedContext = context ? (redactValue('context', context) as LogContext) : undefined;
    const errorMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
    const entry = {
      level: 'ERROR',
      timestamp: new Date().toISOString(),
      message,
      error: errorMessage,
      ...(sanitizedContext ? { context: sanitizedContext } : {}),
    };
    process.stderr.write(`${JSON.stringify(entry)}\n`);
  },
};
