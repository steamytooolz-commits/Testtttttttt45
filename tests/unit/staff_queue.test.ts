import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { StaffQueueService } from '@/lib/services/staff_queue';
import { CartService } from '@/lib/services/cart';
import { CheckoutService } from '@/lib/services/checkout';
import {
  createCustomerAndUser,
  updateUserStatus,
  setStockBalance,
  getStockBalance,
  setCustomPrice,
  findSalesOrderById,
  getInvoiceByOrderId,
  getInvoiceById,
  listInvoicesByCustomerId,
  getSalesOrderLines,
  getStockMovementsBySku,
  memoryDb,
} from '@/lib/repo/mysql';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/security/session';
import { GET as staffQueueRoute } from '@/app/api/staff/queue/route';
import { POST as staffTransitionRoute } from '@/app/api/staff/orders/[id]/transition/route';

describe('Module 4: Staff Queue, Order Transitions & SARS Invoicing Tests', () => {
  let customerId: number;
  let customerUserId: number;
  let staffUserId: number;
  let adminUserId: number;

  let customerToken: string;
  let customerCsrf: string;
  let staffToken: string;
  let staffCsrf: string;
  let adminToken: string;
  let adminCsrf: string;

  beforeEach(async () => {

    memoryDb.resetDatabase();

    const { customer, user: custUser } = await createCustomerAndUser(
      {
        company_name: 'Metro Stationery Suppliers',
        contact_name: 'Sarah Connor',
        email: `buyer_${Date.now()}_${Math.random().toString(36).substring(7)}@metrostationery.co.za`,
        phone: '+27 11 555 1234',
        address_json: JSON.stringify({ street: '12 Main Rd', city: 'Sandton', province: 'GP', postal_code: '2196' }),
      },
      {
        password_hash: 'hash-cust',
        totp_secret_encrypted: 'totp-cust',
      }
    );
    customerId = customer.id;
    customerUserId = custUser.id;
    await updateUserStatus(customerUserId, 'APPROVED');
    await setCustomPrice({ customerId, sku: 'SKU-PPR-A4-80G', unitPrice: '85.00', actorId: customerUserId, actorRole: 'ADMIN' });
    await setCustomPrice({ customerId, sku: 'SKU-PPR-A4-75G', unitPrice: '79.50', actorId: customerUserId, actorRole: 'ADMIN' });
    await setCustomPrice({ customerId, sku: 'SKU-PEN-BLU-05', unitPrice: '110.00', actorId: customerUserId, actorRole: 'ADMIN' });
    await setCustomPrice({ customerId, sku: 'SKU-PEN-RED-05', unitPrice: '110.00', actorId: customerUserId, actorRole: 'ADMIN' });
    await setCustomPrice({ customerId, sku: 'SKU-FIL-LVR-BLK', unitPrice: '42.00', actorId: customerUserId, actorRole: 'ADMIN' });

    const custSession = await createSession({
      userId: customerUserId,
      email: custUser.email,
      role: 'CUSTOMER',
      status: 'APPROVED',
      customerId,
    });
    customerToken = custSession.token;
    customerCsrf = custSession.csrfToken;

    const staffUser = memoryDb.insertUser({
      customer_id: null,
      role: 'SALES_STAFF',
      email: `staff_${Date.now()}@stationerydepot.co.za`,
      password_hash: 'hash-staff',
      totp_secret_encrypted: 'totp-staff',
      status: 'APPROVED',
    });
    staffUserId = staffUser.id;

    const staffSession = await createSession({
      userId: staffUserId,
      email: staffUser.email,
      role: 'SALES_STAFF', customerId: null, status: 'APPROVED',
    });
    staffToken = staffSession.token;
    staffCsrf = staffSession.csrfToken;

    const adminUser = memoryDb.insertUser({
      customer_id: null,
      role: 'ADMIN',
      email: `admin_${Date.now()}@stationerydepot.co.za`,
      password_hash: 'hash-admin',
      totp_secret_encrypted: 'totp-admin',
      status: 'APPROVED',
    });
    adminUserId = adminUser.id;

    const adminSession = await createSession({
      userId: adminUserId,
      email: adminUser.email,
      role: 'ADMIN', customerId: null, status: 'APPROVED',
    });
    adminToken = adminSession.token;
    adminCsrf = adminSession.csrfToken;

    await setStockBalance('SKU-PPR-A4-80G', 100);
    await setStockBalance('SKU-PEN-BLU-05', 100);
  });

  it('transitions order from PENDING_SALES_REVIEW through APPROVED, INVOICED, and FULFILLED', async () => {

    await CartService.addItem(customerId, 'SKU-PPR-A4-80G', 5);

    const checkoutRes = await CheckoutService.processCheckout({
      customerId,
      userId: customerUserId,
      clientIp: '192.168.1.50',
    });

    const orderId = checkoutRes.order.id;
    expect(checkoutRes.order.status).toBe('PENDING_SALES_REVIEW');

    const queue = await StaffQueueService.getQueue({ status: 'PENDING_SALES_REVIEW' });
    expect(queue.some((o) => o.id === orderId)).toBe(true);

    const approveRes = await StaffQueueService.transitionOrder({
      orderId,
      action: 'APPROVE',
      actorId: staffUserId,
      actorRole: 'SALES_STAFF',
      clientIp: '192.168.1.100',
    });
    expect(approveRes.previousStatus).toBe('PENDING_SALES_REVIEW');
    expect(approveRes.newStatus).toBe('APPROVED');

    const approvedOrder = await findSalesOrderById(orderId);
    expect(approvedOrder?.status).toBe('APPROVED');

    const invoiceRes = await StaffQueueService.transitionOrder({
      orderId,
      action: 'INVOICE',
      actorId: staffUserId,
      actorRole: 'SALES_STAFF',
      clientIp: '192.168.1.100',
    });
    expect(invoiceRes.previousStatus).toBe('APPROVED');
    expect(invoiceRes.newStatus).toBe('INVOICED');
    expect(invoiceRes.invoice).toBeDefined();
    expect(invoiceRes.invoice?.invoice_number).toBe('INV-10001');
    expect(invoiceRes.invoice?.status).toBe('ISSUED');
    expect(invoiceRes.invoice?.subtotal).toBe(checkoutRes.order.subtotal);
    expect(invoiceRes.invoice?.vat).toBe(checkoutRes.order.vat);
    expect(invoiceRes.invoice?.total).toBe(checkoutRes.order.total);

    const invByOrder = await getInvoiceByOrderId(orderId);
    expect(invByOrder?.invoice_number).toBe('INV-10001');

    const fulfilRes = await StaffQueueService.transitionOrder({
      orderId,
      action: 'FULFIL',
      actorId: staffUserId,
      actorRole: 'SALES_STAFF',
      clientIp: '192.168.1.100',
    });
    expect(fulfilRes.previousStatus).toBe('INVOICED');
    expect(fulfilRes.newStatus).toBe('FULFILLED');

    const fulfilledOrder = await findSalesOrderById(orderId);
    expect(fulfilledOrder?.status).toBe('FULFILLED');
  });

  it('allocates strictly sequential invoice numbers (INV-10001, INV-10002) for subsequent orders', async () => {

    await CartService.addItem(customerId, 'SKU-PPR-A4-80G', 2);
    const res1 = await CheckoutService.processCheckout({ customerId, userId: customerUserId, clientIp: '1.1.1.1' });
    await StaffQueueService.transitionOrder({ orderId: res1.order.id, action: 'APPROVE', actorId: staffUserId, actorRole: 'SALES_STAFF' });
    const inv1 = await StaffQueueService.transitionOrder({ orderId: res1.order.id, action: 'INVOICE', actorId: staffUserId, actorRole: 'SALES_STAFF' });
    expect(inv1.invoice?.invoice_number).toBe('INV-10001');

    await CartService.addItem(customerId, 'SKU-PEN-BLU-05', 1);
    const res2 = await CheckoutService.processCheckout({ customerId, userId: customerUserId, clientIp: '1.1.1.1' });
    await StaffQueueService.transitionOrder({ orderId: res2.order.id, action: 'APPROVE', actorId: staffUserId, actorRole: 'SALES_STAFF' });
    const inv2 = await StaffQueueService.transitionOrder({ orderId: res2.order.id, action: 'INVOICE', actorId: staffUserId, actorRole: 'SALES_STAFF' });
    expect(inv2.invoice?.invoice_number).toBe('INV-10002');
  });

  it('restores inventory and records REFUND stock movement on CANCEL with reason', async () => {

    await setStockBalance('SKU-PPR-A4-80G', 50);

    await CartService.addItem(customerId, 'SKU-PPR-A4-80G', 10);
    const checkoutRes = await CheckoutService.processCheckout({
      customerId,
      userId: customerUserId,
      clientIp: '1.1.1.1',
    });
    const orderId = checkoutRes.order.id;

    let stock = await getStockBalance('SKU-PPR-A4-80G');
    expect(stock?.qty).toBe(40);

    const cancelReason = 'Customer duplicate request';
    const cancelRes = await StaffQueueService.transitionOrder({
      orderId,
      action: 'CANCEL',
      actorId: adminUserId,
      actorRole: 'ADMIN',
      cancelReason,
      clientIp: '192.168.1.100',
    });

    expect(cancelRes.newStatus).toBe('CANCELLED');
    const cancelledOrder = await findSalesOrderById(orderId);
    expect(cancelledOrder?.status).toBe('CANCELLED');
    expect(cancelledOrder?.cancel_reason).toBe(cancelReason);

    stock = await getStockBalance('SKU-PPR-A4-80G');
    expect(stock?.qty).toBe(50);

    const movements = await getStockMovementsBySku('SKU-PPR-A4-80G');
    const refundMovement = movements.find((m) => m.reason === 'REFUND' && m.ref_id === checkoutRes.order.order_number);
    expect(refundMovement).toBeDefined();
    expect(refundMovement?.delta).toBe(10);
  });

  it('rejects CANCEL without cancellation reason', async () => {
    await CartService.addItem(customerId, 'SKU-PPR-A4-80G', 2);
    const checkoutRes = await CheckoutService.processCheckout({ customerId, userId: customerUserId, clientIp: '1.1.1.1' });

    await expect(
      StaffQueueService.transitionOrder({
        orderId: checkoutRes.order.id,
        action: 'CANCEL',
        actorId: adminUserId,
        actorRole: 'ADMIN',
        cancelReason: '',
      })
    ).rejects.toThrow(/Cancellation reason is required/i);
  });

  it('rejects CANCEL from SALES_STAFF (refunds are ADMIN only)', async () => {
    await CartService.addItem(customerId, 'SKU-PPR-A4-80G', 2);
    const checkoutRes = await CheckoutService.processCheckout({ customerId, userId: customerUserId, clientIp: '1.1.1.1' });

    await expect(
      StaffQueueService.transitionOrder({
        orderId: checkoutRes.order.id,
        action: 'CANCEL',
        actorId: staffUserId,
        actorRole: 'SALES_STAFF',
        cancelReason: 'Staff should not be able to refund',
      })
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it('issues unique sequential invoice numbers under concurrent INVOICE transitions', async () => {
    await setStockBalance('SKU-PPR-A4-80G', 100);
    await CartService.addItem(customerId, 'SKU-PPR-A4-80G', 2);
    const first = await CheckoutService.processCheckout({ customerId, userId: customerUserId, clientIp: '1.1.1.1' });
    await CartService.addItem(customerId, 'SKU-PPR-A4-80G', 3);
    const second = await CheckoutService.processCheckout({ customerId, userId: customerUserId, clientIp: '1.1.1.1' });

    await StaffQueueService.transitionOrder({ orderId: first.order.id, action: 'APPROVE', actorId: staffUserId, actorRole: 'SALES_STAFF' });
    await StaffQueueService.transitionOrder({ orderId: second.order.id, action: 'APPROVE', actorId: staffUserId, actorRole: 'SALES_STAFF' });

    const [inv1, inv2] = await Promise.all([
      StaffQueueService.transitionOrder({ orderId: first.order.id, action: 'INVOICE', actorId: staffUserId, actorRole: 'SALES_STAFF' }),
      StaffQueueService.transitionOrder({ orderId: second.order.id, action: 'INVOICE', actorId: staffUserId, actorRole: 'SALES_STAFF' }),
    ]);

    const numbers = [inv1.invoice?.invoice_number, inv2.invoice?.invoice_number].sort();
    expect(new Set(numbers).size).toBe(2);
    const [low, high] = numbers.map((n) => parseInt(String(n).replace('INV-', ''), 10));
    expect(high - low).toBe(1);
  });

  it('rejects invalid transitions (e.g. FULFIL on PENDING_SALES_REVIEW order)', async () => {
    await CartService.addItem(customerId, 'SKU-PPR-A4-80G', 2);
    const checkoutRes = await CheckoutService.processCheckout({ customerId, userId: customerUserId, clientIp: '1.1.1.1' });

    await expect(
      StaffQueueService.transitionOrder({
        orderId: checkoutRes.order.id,
        action: 'FULFIL',
        actorId: staffUserId,
        actorRole: 'SALES_STAFF',
      })
    ).rejects.toThrow(/INVALID_TRANSITION/i);
  });

  it('enforces RBAC on GET /api/staff/queue (Staff/Admin allowed, Customer forbidden)', async () => {

    const custReq = new NextRequest('http://localhost:3000/api/staff/queue', {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${customerToken}`,
      },
    });
    const custRes = await staffQueueRoute(custReq);
    expect(custRes.status).toBe(403);

    const staffReq = new NextRequest('http://localhost:3000/api/staff/queue', {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${staffToken}`,
      },
    });
    const staffRes = await staffQueueRoute(staffReq);
    expect(staffRes.status).toBe(200);
    const staffData = await staffRes.json();
    expect(Array.isArray(staffData.orders)).toBe(true);
  });

  it('enforces CSRF and role check on POST /api/staff/orders/[id]/transition', async () => {
    await CartService.addItem(customerId, 'SKU-PPR-A4-80G', 2);
    const checkoutRes = await CheckoutService.processCheckout({ customerId, userId: customerUserId, clientIp: '1.1.1.1' });
    const orderId = String(checkoutRes.order.id);

    const noCsrfReq = new NextRequest(`http://localhost:3000/api/staff/orders/${orderId}/transition`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `${SESSION_COOKIE_NAME}=${staffToken}`,
      },
      body: JSON.stringify({ action: 'APPROVE' }),
    });
    const noCsrfRes = await staffTransitionRoute(noCsrfReq, { params: Promise.resolve({ id: orderId }) });
    expect(noCsrfRes.status).toBe(403);

    const custReq = new NextRequest(`http://localhost:3000/api/staff/orders/${orderId}/transition`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': customerCsrf,
        cookie: `${SESSION_COOKIE_NAME}=${customerToken}`,
      },
      body: JSON.stringify({ action: 'APPROVE' }),
    });
    const custRes = await staffTransitionRoute(custReq, { params: Promise.resolve({ id: orderId }) });
    expect(custRes.status).toBe(403);

    const validReq = new NextRequest(`http://localhost:3000/api/staff/orders/${orderId}/transition`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': staffCsrf,
        cookie: `${SESSION_COOKIE_NAME}=${staffToken}`,
      },
      body: JSON.stringify({ action: 'APPROVE' }),
    });
    const validRes = await staffTransitionRoute(validReq, { params: Promise.resolve({ id: orderId }) });
    expect(validRes.status).toBe(200);
    const validData = await validRes.json();
    expect(validData.success).toBe(true);
    expect(validData.newStatus).toBe('APPROVED');
  });
});
