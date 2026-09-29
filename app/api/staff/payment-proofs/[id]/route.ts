import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/security/session';
import { getClientIp } from '@/lib/security/request';
import { getPaymentProofFile, createAuditLog } from '@/lib/repo/mysql';

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const params = await props.params;
  const proofId = Number(params.id);
  if (!proofId || isNaN(proofId) || proofId <= 0) {
    return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Invalid proof ID' }, { status: 400 });
  }

  const clientIp = getClientIp(req);
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (session.role !== 'SALES_STAFF' && session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'FORBIDDEN', message: 'Staff access required' }, { status: 403 });
  }

  const result = await getPaymentProofFile(proofId);
  if (!result) {
    return NextResponse.json({ error: 'NOT_FOUND', message: 'Proof not found' }, { status: 404 });
  }

  await createAuditLog({
    actor_id: session.userId,
    actor_role: session.role,
    action: 'PAYMENT_PROOF_DOWNLOADED',
    entity_type: 'payment_proofs',
    entity_id: String(proofId),
    before_hash: null,
    after_hash: result.proof.sha256,
    ip: clientIp,
  });

  const safeName = result.proof.filename.replace(/"/g, '');
  return new NextResponse(new Uint8Array(result.bytes), {
    status: 200,
    headers: {
      'Content-Type': result.proof.mime_type,
      'Content-Length': String(result.bytes.length),
      'Content-Disposition': `inline; filename="${safeName}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
