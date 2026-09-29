import { readApiData } from '@/lib/api-client';

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function solvePowChallenge(nonce: string, difficulty: string, maxAttempts = 500000): Promise<string> {
  let attempt = 0;
  while (attempt < maxAttempts) {
    const candidate = String(attempt);
    const hash = await sha256Hex(`${nonce}:${candidate}`);
    if (hash.startsWith(difficulty)) {
      return candidate;
    }
    attempt += 1;
  }
  throw new Error('POW_SOLVE_FAILED: exceeded max attempts');
}

export async function fetchAndSolveCaptcha(): Promise<{ nonce: string; solution: string }> {
  const res = await fetch('/api/auth/challenge', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error('Failed to fetch captcha challenge');
  }
  const data = await readApiData<{ nonce: string; difficulty: string }>(res);
  const solution = await solvePowChallenge(data.nonce, data.difficulty);
  return { nonce: data.nonce, solution };
}
