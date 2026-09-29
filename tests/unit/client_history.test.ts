import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { OrderHistoryService } from '@/lib/services/order_history';
import { StaffQueueService } from '@/lib/services/staff_queue';
import { CartService } from '@/lib/services/cart';
import { CheckoutService } from '@/lib/services/checkout';
import {
  createCustomerAndUser,
  updateUserStatus,
  setStockBalance,
  setCustomPrice,
  memoryDb,
} from '@/lib/repo/mysql';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/security/session';
import { GET as getOrdersRoute } from '@/app/api/orders/route';
import { GET as getOrderByIdRoute } from '@/app/api/orders/[id]/route';
import { POST as postRepeatOrderRoute } from '@/app/api/orders/[id]/repeat/route';
import { GET as getInvoicesRoute } from '@/app/api/invoices/route';

describe('Module 5: Client History, Invoices & Repeat Order Tests', () => {
  let customer1Id: number;
  let customer1UserId: number;
  let customer1Token: string;
  let customer1Csrf: string;

  let customer2Id: number;
  let customer2UserId: number;
  let customer2Token: string;
  let customer2Csrf: string;

  let staffUserId: number;
  let staffToken: string;

  beforeEach(async () => {

    memoryDb.resetDatabase();

    const { customer: cust1, user: user1 } = await createCustomerAndUser(
      {
        company_name: 'Alpha Corporate Supplies',
        contact_name: 'Arthur Dent',
        email: `alpha_${Date.now()}_${Math.random().toString(36).substring(7)}@alpha.co.za`,
        phone: '+27 11 111 2222',
        address_json: JSON.stringify({ street: '100 Rivonia Rd', city: 'Sandton', province: 'GP', postal_code: '2196' }),
      },
      {
        password_hash: 'hash1',
        totp_secret_encrypted: 'totp1',
      }
    );
    customer1Id = cust1.id;
    customer1UserId = user1.id;
    await updateUserStatus(customer1UserId, 'APPROVED');
    await setCustomPrice({ customerId: customer1Id, sku: 'SKU-PPR-A4-80G', unitPrice: '85.00', actorId: customer1UserId, actorRole: 'ADMIN' });
    await setCustomPrice({ customerId: customer1Id, sku: 'SKU-PEN-BLU-05', unitPrice: '110.00', actorId: customer1UserId, actorRole: 'ADMIN' });
    await setCustomPrice({ customerId: customer1Id, sku: 'SKU-FIL-LVR-BLK', unitPrice: '42.00', actorId: customer1UserId, actorRole: 'ADMIN' });

    const session1 = await createSession({
      userId: customer1UserId,
      email: user1.email,
      role: 'CUSTOMER',
      status: 'APPROVED',
      customerId: customer1Id,
    });
    customer1Token = session1.token;
    customer1Csrf = session1.csrfToken;

    const { customer: cust2, user: user2 } = await createCustomerAndUser(
      {
        company_name: 'Beta School Supplies',
        contact_name: 'Ford Prefect',
        email: `beta_${Date.now()}_${Math.random().toString(36).substring(7)}@beta.co.za`,
        phone: '+27 21 333 4444',
        address_json: JSON.stringify({ street: '50 Long St', city: 'Cape Town', province: 'WC', postal_code: '8001' }),
      },
      {
        password_hash: 'hash2',
        totp_secret_encrypted: 'totp2',
      }
    );
    customer2Id = cust2.id;
    customer2UserId = user2.id;
    await updateUserStatus(customer2UserId, 'APPROVED');
    await setCustomPrice({ customerId: customer2Id, sku: 'SKU-PPR-A4-80G', unitPrice: '78.50', actorId: customer2UserId, actorRole: 'ADMIN' });
    await setCustomPrice({ customerId: customer2Id, sku: 'SKU-PEN-BLU-05', unitPrice: '98.00', actorId: customer2UserId, actorRole: 'ADMIN' });

    const session2 = await createSession({
      userId: customer2UserId,
      email: user2.email,
      role: 'CUSTOMER',
      status: 'APPROVED',
      customerId: customer2Id,
    });
    customer2Token = session2.token;
    customer2Csrf = session2.csrfToken;

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

    await setStockBalance('SKU-PPR-A4-80G', 500);
    await setStockBalance('SKU-PEN-BLU-05', 500);
  });

  it('lists customer own past orders and line snapshots correctly', async () => {

    await CartService.addItem(customer1Id, 'SKU-PPR-A4-80G', 3);
    const checkout1 = await CheckoutService.processCheckout({
      customerId: customer1Id,
      userId: customer1UserId,
      clientIp: '127.0.0.1',
    });

    await CartService.addItem(customer1Id, 'SKU-PEN-BLU-05', 5);
    const checkout2 = await CheckoutService.processCheckout({
      customerId: customer1Id,
      userId: customer1UserId,
      clientIp: '127.0.0.1',
    });

    const orders = await OrderHistoryService.listCustomerOrders(customer1Id);
    expect(orders.length).toBe(2);
    expect(orders[0].id).toBe(checkout2.order.id);
    expect(orders[1].id).toBe(checkout1.order.id);
    expect(orders[1].lines.length).toBe(1);
    expect(orders[1].lines[0].sku).toBe('SKU-PPR-A4-80G');
    expect(orders[1].lines[0].qty).toBe(3);

    const cust2Orders = await OrderHistoryService.listCustomerOrders(customer2Id);
    expect(cust2Orders.length).toBe(0);
  });

  it('allows 1-click repeat order cloning prior lines into cart at current tier prices', async () => {

    await CartService.addItem(customer1Id, 'SKU-PPR-A4-80G', 2);
    await CartService.addItem(customer1Id, 'SKU-PEN-BLU-05', 4);
    const checkout = await CheckoutService.processCheckout({
      customerId: customer1Id,
      userId: customer1UserId,
      clientIp: '127.0.0.1',
    });

    let cart = await CartService.getCart(customer1Id);
    expect(cart.items.length).toBe(0);

    const repeatRes = await OrderHistoryService.repeatOrder({
      orderId: checkout.order.id,
      customerId: customer1Id,
      userId: customer1UserId,
      clientIp: '127.0.0.1',
    });

    expect(repeatRes.success).toBe(true);
    expect(repeatRes.clonedCount).toBe(2);
    expect(repeatRes.skippedSkus).toEqual([]);

    cart = await CartService.getCart(customer1Id);
    expect(cart.items.length).toBe(2);
    const pprItem = cart.items.find((i) => i.sku === 'SKU-PPR-A4-80G');
    const penItem = cart.items.find((i) => i.sku === 'SKU-PEN-BLU-05');
    expect(pprItem?.qty).toBe(2);
    expect(penItem?.qty).toBe(4);
    expect(pprItem?.tier_code).toBe('CUSTOM');
  });

  it('rejects repeat order if user is not the owner', async () => {

    await CartService.addItem(customer1Id, 'SKU-PPR-A4-80G', 2);
    const checkout = await CheckoutService.processCheckout({
      customerId: customer1Id,
      userId: customer1UserId,
      clientIp: '127.0.0.1',
    });

    await expect(
      OrderHistoryService.repeatOrder({
        orderId: checkout.order.id,
        customerId: customer2Id,
        userId: customer2UserId,
      })
    ).rejects.toThrow(/FORBIDDEN/i);
  });

  it('lists issued sales invoices with numbers and totals', async () => {

    await CartService.addItem(customer1Id, 'SKU-PPR-A4-80G', 4);
    const checkout = await CheckoutService.processCheckout({
      customerId: customer1Id,
      userId: customer1UserId,
      clientIp: '127.0.0.1',
    });

    let invoices = await OrderHistoryService.listCustomerInvoices(customer1Id);
    expect(invoices.length).toBe(0);

    await StaffQueueService.transitionOrder({
      orderId: checkout.order.id,
      action: 'APPROVE',
      actorId: staffUserId,
      actorRole: 'SALES_STAFF',
    });
    const invRes = await StaffQueueService.transitionOrder({
      orderId: checkout.order.id,
      action: 'INVOICE',
      actorId: staffUserId,
      actorRole: 'SALES_STAFF',
    });

    invoices = await OrderHistoryService.listCustomerInvoices(customer1Id);
    expect(invoices.length).toBe(1);
    expect(invoices[0].invoice_number).toBe('INV-10001');
    expect(invoices[0].order_number).toBe(checkout.order.order_number);
    expect(invoices[0].total).toBe(checkout.order.total);
    expect(invoices[0].vat).toBe(checkout.order.vat);
    expect(invoices[0].subtotal).toBe(checkout.order.subtotal);
  });

  it('tests GET /api/orders endpoint with customer authentication', async () => {
    await CartService.addItem(customer1Id, 'SKU-PPR-A4-80G', 1);
    await CheckoutService.processCheckout({ customerId: customer1Id, userId: customer1UserId, clientIp: '1.1.1.1' });

    const req = new NextRequest('http://localhost:3000/api/orders', {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${customer1Token}`,
      },
    });

    const res = await getOrdersRoute(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.orders)).toBe(true);
    expect(data.orders.length).toBe(1);
  });

  it('tests GET /api/orders/[id] access control (owner & staff allowed, other customer forbidden)', async () => {
    await CartService.addItem(customer1Id, 'SKU-PPR-A4-80G', 2);
    const checkout = await CheckoutService.processCheckout({ customerId: customer1Id, userId: customer1UserId, clientIp: '1.1.1.1' });
    const orderId = String(checkout.order.id);

    const ownerReq = new NextRequest(`http://localhost:3000/api/orders/${orderId}`, {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${customer1Token}` },
    });
    const ownerRes = await getOrderByIdRoute(ownerReq, { params: Promise.resolve({ id: orderId }) });
    expect(ownerRes.status).toBe(200);
    const ownerData = await ownerRes.json();
    expect(ownerData.order.id).toBe(checkout.order.id);

    const otherReq = new NextRequest(`http://localhost:3000/api/orders/${orderId}`, {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${customer2Token}` },
    });
    const otherRes = await getOrderByIdRoute(otherReq, { params: Promise.resolve({ id: orderId }) });
    expect(otherRes.status).toBe(403);

    const staffReq = new NextRequest(`http://localhost:3000/api/orders/${orderId}`, {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${staffToken}` },
    });
    const staffRes = await getOrderByIdRoute(staffReq, { params: Promise.resolve({ id: orderId }) });
    expect(staffRes.status).toBe(200);
  });

  it('tests POST /api/orders/[id]/repeat endpoint (CSRF validation, cloning into cart)', async () => {
    await CartService.addItem(customer1Id, 'SKU-PPR-A4-80G', 5);
    const checkout = await CheckoutService.processCheckout({ customerId: customer1Id, userId: customer1UserId, clientIp: '1.1.1.1' });
    const orderId = String(checkout.order.id);

    const badCsrfReq = new NextRequest(`http://localhost:3000/api/orders/${orderId}/repeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'wrong-csrf',
        cookie: `${SESSION_COOKIE_NAME}=${customer1Token}`,
      },
    });
    const badCsrfRes = await postRepeatOrderRoute(badCsrfReq, { params: Promise.resolve({ id: orderId }) });
    expect(badCsrfRes.status).toBe(403);

    const validReq = new NextRequest(`http://localhost:3000/api/orders/${orderId}/repeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': customer1Csrf,
        cookie: `${SESSION_COOKIE_NAME}=${customer1Token}`,
      },
    });
    const validRes = await postRepeatOrderRoute(validReq, { params: Promise.resolve({ id: orderId }) });
    expect(validRes.status).toBe(200);
    const validData = await validRes.json();
    expect(validData.success).toBe(true);
    expect(validData.clonedCount).toBe(1);

    const cart = await CartService.getCart(customer1Id);
    expect(cart.items[0].sku).toBe('SKU-PPR-A4-80G');
    expect(cart.items[0].qty).toBe(5);
  });

  it('tests GET /api/invoices endpoint for authenticated customer', async () => {

    await CartService.addItem(customer1Id, 'SKU-PPR-A4-80G', 2);
    const checkout = await CheckoutService.processCheckout({ customerId: customer1Id, userId: customer1UserId, clientIp: '1.1.1.1' });
    await StaffQueueService.transitionOrder({ orderId: checkout.order.id, action: 'APPROVE', actorId: staffUserId, actorRole: 'SALES_STAFF' });
    await StaffQueueService.transitionOrder({ orderId: checkout.order.id, action: 'INVOICE', actorId: staffUserId, actorRole: 'SALES_STAFF' });

    const req = new NextRequest('http://localhost:3000/api/invoices', {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${customer1Token}`,
      },
    });

    const res = await getInvoicesRoute(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.invoices)).toBe(true);
    expect(data.invoices.length).toBe(1);
    expect(data.invoices[0].invoice_number).toBe('INV-10001');
  });
});
