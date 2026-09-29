import 'server-only';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { issueCaptchaChallenge } from '@/lib/security/captcha';

export async function GET(): Promise<NextResponse> {
  const challenge = await issueCaptchaChallenge();
  return NextResponse.json(challenge, { status: 200 });
}
