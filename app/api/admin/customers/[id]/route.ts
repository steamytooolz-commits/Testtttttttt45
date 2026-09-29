import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, verifyCsrf } from '@/lib/security/session';
import { getClientIp, publicErrorMessage } from '@/lib/security/request';
import { AdminService } from '@/lib/services/admin';
import type { UserStatus, CustomerWithTierInfo } from '@/lib/repo/mysql';

const PAYMENT_TERMS = ['COD', 'NET_7', 'NET_14', 'NET_30', 'NET_60'];

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const customerId = parseInt(id, 10);
    if (isNaN(customerId) || customerId <= 0) {
      return NextResponse.json({ error: 'INVALID_ID', message: 'Invalid customer ID' }, { status: 400 });
    }

    const session = await getSessionFromRequest(req);

    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Admin privileges required' },
        { status: 403 }
      );
    }

    if (!verifyCsrf(session, req.headers.get('x-csrf-token'))) {
      return NextResponse.json(
        { error: 'CSRF_INVALID', message: 'Invalid or missing CSRF token' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { status, tier_id, business } = body;

    const fail = (message: string) =>
      NextResponse.json({ error: 'VALIDATION_ERROR', message }, { status: 400 });

    const validStatuses: UserStatus[] = ['PENDING_APPROVAL', 'APPROVED', 'SUSPENDED'];
    if (status && !validStatuses.includes(status)) {
      return fail(`Invalid status '${status}'. Must be PENDING_APPROVAL, APPROVED, or SUSPENDED.`);
    }

    let tierIdParsed: number | undefined = undefined;
    if (tier_id !== undefined && tier_id !== null) {
      tierIdParsed = parseInt(String(tier_id), 10);
      if (isNaN(tierIdParsed) || tierIdParsed <= 0) {
        return fail('Invalid tier ID');
      }
    }

    let businessUpdate: {
      businessType: string | null;
      vatNumber: string | null;
      creditLimit: string | null;
      paymentTerms: string;
      logoUrl: string | null;
    } | null = null;

    if (business !== undefined && business !== null) {
      if (typeof business !== 'object' || Array.isArray(business)) {
        return fail('business must be an object');
      }
      const raw = business as Record<string, unknown>;

      const readText = (
        field: string,
        max: number
      ): { ok: true; value: string | null } | { ok: false; message: string } => {
        const value = raw[field];
        if (value === undefined || value === null) return { ok: true, value: null };
        if (typeof value !== 'string') return { ok: false, message: `${field} must be a string` };
        const trimmed = value.trim();
        if (trimmed.length === 0) return { ok: true, value: null };
        if (trimmed.length > max) {
          return { ok: false, message: `${field} must be at most ${max} characters` };
        }
        return { ok: true, value: trimmed };
      };

      const businessType = readText('business_type', 50);
      if (!businessType.ok) return fail(businessType.message);

      const vatNumber = readText('vat_number', 20);
      if (!vatNumber.ok) return fail(vatNumber.message);
      if (vatNumber.value !== null && !/^[A-Za-z0-9 ./_-]{4,20}$/.test(vatNumber.value)) {
        return fail('vat_number may only contain letters, digits, spaces and . / _ -');
      }

      const logoUrl = readText('logo_url', 500);
      if (!logoUrl.ok) return fail(logoUrl.message);
      if (logoUrl.value !== null && !/^(https?:\/\/|\/)/.test(logoUrl.value)) {
        return fail('logo_url must be an absolute http(s) URL or a site-relative path');
      }

      const rawTerms = raw.payment_terms;
      let paymentTerms = 'NET_30';
      if (rawTerms !== undefined && rawTerms !== null && String(rawTerms).trim() !== '') {
        if (typeof rawTerms !== 'string' || !PAYMENT_TERMS.includes(rawTerms.trim().toUpperCase())) {
          return fail(`payment_terms must be one of ${PAYMENT_TERMS.join(', ')}`);
        }
        paymentTerms = rawTerms.trim().toUpperCase();
      }

      const rawCredit = raw.credit_limit;
      let creditLimit: string | null = null;
      if (rawCredit !== undefined && rawCredit !== null && String(rawCredit).trim() !== '') {
        const normalized = String(rawCredit).trim().replace(/,/g, '');
        if (!/^\d{1,10}(\.\d{1,2})?$/.test(normalized)) {
          return fail('credit_limit must be a positive amount like 25000 or 25000.00');
        }
        const asNumber = Number(normalized);
        if (!Number.isFinite(asNumber) || asNumber < 0 || asNumber > 9999999999.99) {
          return fail('credit_limit is out of range');
        }
        creditLimit = normalized.includes('.') ? normalized : `${normalized}.00`;
      }

      businessUpdate = {
        businessType: businessType.value,
        vatNumber: vatNumber.value === null ? null : vatNumber.value.toUpperCase(),
        creditLimit,
        paymentTerms,
        logoUrl: logoUrl.value,
      };
    }

    const clientIp = getClientIp(req);

    let updated: CustomerWithTierInfo | null = null;

    if (businessUpdate) {
      updated = await AdminService.updateBusinessProfile({
        customerId,
        ...businessUpdate,
        actorId: session.userId,
        actorRole: session.role,
        clientIp,
      });
    }

    if (status || tierIdParsed !== undefined || !businessUpdate) {
      updated = await AdminService.updateCustomer({
        customerId,
        status: status || undefined,
        tierId: tierIdParsed,
        actorId: session.userId,
        actorRole: session.role,
        clientIp,
      });
    }

    return NextResponse.json({
      success: true,
      customer: updated,
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : '';
    const message = publicErrorMessage(err, 'Failed to update customer');
    const status = raw.startsWith('FORBIDDEN') ? 403 : raw.includes('NOT_FOUND') ? 404 : 400;
    return NextResponse.json({ error: 'OPERATION_FAILED', message }, { status });
  }
}
