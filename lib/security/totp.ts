import 'server-only';
import * as OTPAuth from 'otpauth';

const DEFAULT_ISSUER = 'StationeryDepot';

export interface GeneratedTotp {
  secret: string;
  uri: string;
}

export function generateTotpSecret(email: string): GeneratedTotp {
  const issuer = process.env.TOTP_ISSUER || DEFAULT_ISSUER;
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer,
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });

  return {
    secret: secret.base32,
    uri: totp.toString(),
  };
}

export function verifyTotp(token: string, secretBase32: string): boolean {
  try {
    const issuer = process.env.TOTP_ISSUER || DEFAULT_ISSUER;
    const totp = new OTPAuth.TOTP({
      issuer,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secretBase32),
    });

    const delta = totp.validate({
      token: token.trim(),
      window: 1,
    });

    return delta !== null;
  } catch {
    return false;
  }
}

export function generateTotpToken(secretBase32: string): string {
  const issuer = process.env.TOTP_ISSUER || DEFAULT_ISSUER;
  const totp = new OTPAuth.TOTP({
    issuer,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
  return totp.generate();
}
