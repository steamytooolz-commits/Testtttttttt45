import 'server-only';
import { NextResponse } from 'next/server';
import { QuickOrderService } from '@/lib/services/quick_order';

export async function GET() {
  const csvData = QuickOrderService.generateSampleCsvTemplate();

  return new NextResponse(csvData, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="stationery_order_template.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
