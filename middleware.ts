import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE_NAME = 'sd_session';
const DEFAULT_SECRET = 'stationery_depot_production_secret_key_minimum_32_bytes_long!';

const PUBLIC_MUTATION_PATHS = new Set([
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/2fa',
  '/api/auth/challenge',
  '/api/auth/change-password',
  '/api/auth/forgot-password',
]);

const HIDDEN_STAFF_PREFIXES = ['/api/staff/', '/api/admin/', '/api/exports/'];

function isHiddenStaffPath(pathname: string): boolean {
  return HIDDEN_STAFF_PREFIXES.some((prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix));
}

function getSecret(): Uint8Array {
  return new TextEncoder().encode(process.env.SESSION_SECRET || DEFAULT_SECRET);
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  const method = req.method.toUpperCase();

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  let userRole: string | null = null;

  if (token) {
    try {
      const { payload } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] });
      userRole = (payload.role as string) || null;
    } catch {
      userRole = null;
    }
  }

  if (isHiddenStaffPath(pathname)) {
    if (userRole !== 'ADMIN' && userRole !== 'SALES_STAFF') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/') && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
    if (!PUBLIC_MUTATION_PATHS.has(pathname)) {
      if (!token || !userRole) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }
      return NextResponse.next();
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
