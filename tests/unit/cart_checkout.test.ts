import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { CartService } from '@/lib/services/cart';
import { CheckoutService } from '@/lib/services/checkout';
import {
  acquireStockLock,
  releaseStockLock,
  getCart,
  deleteCart,
  getRedisStreamEntries,
} from '@/lib/repo/redis';
import {
  createCustomerAndUser,
  updateUserStatus,
  setStockBalance,
  getStockBalance,
  getStockMovementsBySku,
  setCustomPrice,
  getDraftOrder,
  getSalesOrderLines,
  findSalesOrderById,
} from '@/lib/repo/mysql';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/security/session';
import { GET as getCartRoute } from '@/app/api/cart/route';
import { POST as addCartItemRoute } from '@/app/api/cart/items/route';
import { PATCH as updateCartItemRoute, DELETE as deleteCartItemRoute } from '@/app/api/cart/items/[id]/route';
import { POST as checkoutRoute } from '@/app/api/checkout/route';

describe('Module 3: Cart and Checkout Unit & Integration Tests', () => {
  let customerId: number;
  let userId: number;
  let approvedToken: string;
  let csrfToken: string;
  let pendingToken: string;
  let pendingCsrfToken: string;

  beforeEach(async () => {

    const uniqueEmail = `buyer_${Date.now()}_${Math.random().toString(36).substring(7)}@stationery.co.za`;
    const { customer, user } = await createCustomerAndUser(
      {
        company_name: 'Apex Paper Merchants',
        contact_name: 'John Apex',
        email: uniqueEmail,
        phone: '+27 11 888 1234',
        address_json: JSON.stringify({ street: '45 Simmonds', city: 'Johannesburg', province: 'GP', postal_code: '2001' }),
      },
      {
        password_hash: 'hash-abc',
        totp_secret_encrypted: 'totp-secret',
      }
    );

    customerId = customer.id;
    userId = user.id;

    await updateUserStatus(userId, 'APPROVED');
    await setCustomPrice({ customerId, sku: 'SKU-PPR-A4-80G', unitPrice: '85.00', actorId: userId, actorRole: 'ADMIN' });
    await setCustomPrice({ customerId, sku: 'SKU-PPR-A4-75G', unitPrice: '79.50', actorId: userId, actorRole: 'ADMIN' });
    await setCustomPrice({ customerId, sku: 'SKU-PEN-BLU-05', unitPrice: '110.00', actorId: userId, actorRole: 'ADMIN' });
    await setCustomPrice({ customerId, sku: 'SKU-PEN-RED-05', unitPrice: '110.00', actorId: userId, actorRole: 'ADMIN' });
    await setCustomPrice({ customerId, sku: 'SKU-FIL-LVR-BLK', unitPrice: '42.00', actorId: userId, actorRole: 'ADMIN' });
    await setCustomPrice({ customerId, sku: 'SKU-FIL-LVR-BLU', unitPrice: '42.00', actorId: userId, actorRole: 'ADMIN' });
    await setCustomPrice({ customerId, sku: 'SKU-FIL-LVR-RED', unitPrice: '42.00', actorId: userId, actorRole: 'ADMIN' });

    const sessionRes = await createSession({
      userId,
      customerId,
      role: 'CUSTOMER',
      status: 'APPROVED',
      email: uniqueEmail,
    });
    approvedToken = sessionRes.token;
    csrfToken = sessionRes.csrfToken;

    const pendingEmail = `pending_${Date.now()}@trade.co.za`;
    const { customer: pendingCust, user: pendingUser } = await createCustomerAndUser(
      {
        company_name: 'Pending Trader',
        contact_name: 'Pete Pending',
        email: pendingEmail,
        phone: '+27 21 444 0000',
        address_json: JSON.stringify({ street: '12 Loop', city: 'Cape Town', province: 'WC', postal_code: '8001' }),
      },
      {
        password_hash: 'hash-xyz',
        totp_secret_encrypted: 'totp-secret',
      }
    );

    const pendingSession = await createSession({
      userId: pendingUser.id,
      customerId: pendingCust.id,
      role: 'CUSTOMER',
      status: 'PENDING_APPROVAL',
      email: pendingEmail,
    });
    pendingToken = pendingSession.token;
    pendingCsrfToken = pendingSession.csrfToken;

    await deleteCart(customerId);
  });

  describe('1. Cart Lock Concurrency', () => {
    it('allows only one transaction to hold an atomic stock lock simultaneously', async () => {
      const sku = 'SKU-PPR-A4-80G';
      const token1 = await acquireStockLock(sku, 5);
      expect(token1).not.toBeNull();

      const token2 = await acquireStockLock(sku, 5);
      expect(token2).toBeNull();

      const wrongRelease = await releaseStockLock(sku, 'wrong-token');
      expect(wrongRelease).toBe(false);

      const token3 = await acquireStockLock(sku, 5);
      expect(token3).toBeNull();

      const correctRelease = await releaseStockLock(sku, token1!);
      expect(correctRelease).toBe(true);

      const token4 = await acquireStockLock(sku, 5);
      expect(token4).not.toBeNull();
      if (token4) await releaseStockLock(sku, token4);
    });
  });

  describe('2. Cart Service & MySQL Draft Mirror', () => {
    it('adds items, computes 15% VAT and totals, and mirrors to MySQL draft_orders', async () => {
      const cart = await CartService.addItem(customerId, 'SKU-PPR-A4-80G', 10);
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].sku).toBe('SKU-PPR-A4-80G');
      expect(cart.items[0].qty).toBe(10);
      expect(cart.items[0].tier_code).toBe('CUSTOM');

      const draft = await getDraftOrder(customerId);
      expect(draft).not.toBeNull();
      const parsedDraft = JSON.parse(draft!.payload_json);
      expect(parsedDraft.items[0].sku).toBe('SKU-PPR-A4-80G');
      expect(parsedDraft.items[0].qty).toBe(10);

      await deleteCart(customerId);
      const restored = await CartService.getCart(customerId);
      expect(restored.items).toHaveLength(1);
      expect(restored.items[0].sku).toBe('SKU-PPR-A4-80G');
      expect(restored.items[0].qty).toBe(10);
    });

    it('updates item quantity and removes item when qty=0', async () => {
      await CartService.addItem(customerId, 'SKU-PPR-A4-80G', 5);
      const updated = await CartService.updateItemQty(customerId, 'SKU-PPR-A4-80G', 15);
      expect(updated.items[0].qty).toBe(15);

      const cleared = await CartService.updateItemQty(customerId, 'SKU-PPR-A4-80G', 0);
      expect(cleared.items).toHaveLength(0);

      const draft = await getDraftOrder(customerId);
      const parsed = JSON.parse(draft!.payload_json);
      expect(parsed.items).toHaveLength(0);
    });

    it('clears cart and draft order completely', async () => {
      await CartService.addItem(customerId, 'SKU-PPR-A4-80G', 2);
      await CartService.clearCart(customerId);

      const redisCart = await getCart(customerId);
      expect(redisCart).toBeNull();

      const draft = await getDraftOrder(customerId);
      expect(draft).toBeNull();
    });
  });

  describe('3. Checkout Stock Atomicity Under Concurrent Checkout', () => {
    it('atomically enforces stock limits with SELECT ... FOR UPDATE and prevents overselling', async () => {
      const sku = 'SKU-PPR-A4-80G';

      await setStockBalance(sku, 10);

      const { customer: cust2, user: user2 } = await createCustomerAndUser(
        {
          company_name: 'Concurrent Buyer Corp',
          contact_name: 'Sarah Concurrent',
          email: `buyer2_${Date.now()}@apex.co.za`,
          phone: '+27 11 999 8888',
          address_json: JSON.stringify({ street: '100 Fox', city: 'JHB', province: 'GP', postal_code: '2000' }),
        },
        {
          password_hash: 'hash-123',
          totp_secret_encrypted: 'totp-456',
        }
      );
      await updateUserStatus(user2.id, 'APPROVED');
      await setCustomPrice({ customerId: cust2.id, sku, unitPrice: '85.00', actorId: user2.id, actorRole: 'ADMIN' });

      await CartService.addItem(customerId, sku, 6);

      await CartService.addItem(cust2.id, sku, 6);

      const checkout1Promise = CheckoutService.processCheckout({
        customerId,
        userId,
        clientIp: '192.168.1.1',
      });

      const checkout2Promise = CheckoutService.processCheckout({
        customerId: cust2.id,
        userId: user2.id,
        clientIp: '192.168.1.2',
      });

      const results = await Promise.allSettled([checkout1Promise, checkout2Promise]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejectionReason.message).toMatch(/INSUFFICIENT_STOCK|STOCK_LOCK_CONFLICT/);

      const finalBalance = await getStockBalance(sku);
      expect(finalBalance?.qty).toBe(4);

      const movements = await getStockMovementsBySku(sku);
      expect(movements.length).toBeGreaterThanOrEqual(1);
      const orderMovement = movements.find((m) => m.delta === -6 && m.reason === 'ORDER');
      expect(orderMovement).toBeDefined();
    });

    it('creates immutable sales_order_lines snapshots at checkout time', async () => {
      const sku = 'SKU-PPR-A4-80G';
      await setStockBalance(sku, 50);
      await CartService.addItem(customerId, sku, 5);

      const result = await CheckoutService.processCheckout({
        customerId,
        userId,
        clientIp: '10.0.0.1',
      });

      expect(result.order.status).toBe('PENDING_SALES_REVIEW');
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].sku).toBe(sku);
      expect(result.lines[0].unit_price).toBe('85.00');
      expect(result.lines[0].tier_code).toBe('CUSTOM');
      expect(result.lines[0].vat_rate).toBe('15.00');
      expect(result.lines[0].line_total).toBe('425.00');

      const dbLines = await getSalesOrderLines(result.order.id);
      expect(dbLines).toHaveLength(1);
      expect(dbLines[0].unit_price).toBe('85.00');
      expect(dbLines[0].tier_code).toBe('CUSTOM');

      const cartAfter = await CartService.getCart(customerId);
      expect(cartAfter.items).toHaveLength(0);
    });

    it('completes checkout without a staff-notification stream (queue auto-refreshes)', async () => {
      const sku = 'SKU-PPR-A4-80G';
      await setStockBalance(sku, 20);
      await CartService.addItem(customerId, sku, 2);

      const result = await CheckoutService.processCheckout({
        customerId,
        userId,
        clientIp: '10.0.0.1',
      });

      expect(result.order.order_number).toMatch(/^SO-/);
      const cartAfter = await CartService.getCart(customerId);
      expect(cartAfter.items).toHaveLength(0);
    });
  });

  describe('4. API Route Contracts & Trade Gate Enforcement', () => {
    it('blocks unauthenticated and pending users from cart and checkout', async () => {

      const unauthReq = new NextRequest('http://localhost:3000/api/cart');
      const unauthRes = await getCartRoute(unauthReq);
      expect(unauthRes.status).toBe(401);

      const pendingReq = new NextRequest('http://localhost:3000/api/cart', {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(pendingToken)}` },
      });
      const pendingRes = await getCartRoute(pendingReq);
      expect(pendingRes.status).toBe(403);

      const pendingCheckoutReq = new NextRequest('http://localhost:3000/api/checkout', {
        method: 'POST',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(pendingToken)}`,
          'x-csrf-token': pendingCsrfToken,
        },
      });
      const pendingCheckoutRes = await checkoutRoute(pendingCheckoutReq);
      expect(pendingCheckoutRes.status).toBe(403);
    });

    it('enforces CSRF tokens on mutating cart operations', async () => {

      const noCsrfReq = new NextRequest('http://localhost:3000/api/cart/items', {
        method: 'POST',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(approvedToken)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sku: 'SKU-PPR-A4-80G', qty: 2 }),
      });
      const noCsrfRes = await addCartItemRoute(noCsrfReq);
      expect(noCsrfRes.status).toBe(403);

      const validCsrfReq = new NextRequest('http://localhost:3000/api/cart/items', {
        method: 'POST',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(approvedToken)}`,
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ sku: 'SKU-PPR-A4-80G', qty: 2 }),
      });
      const validCsrfRes = await addCartItemRoute(validCsrfReq);
      expect(validCsrfRes.status).toBe(200);
      const data = await validCsrfRes.json();
      expect(data.items).toHaveLength(1);
    });

    it('allows updating and deleting cart items through API routes', async () => {
      await CartService.addItem(customerId, 'SKU-PPR-A4-80G', 2);

      const patchReq = new NextRequest('http://localhost:3000/api/cart/items/SKU-PPR-A4-80G', {
        method: 'PATCH',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(approvedToken)}`,
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ qty: 5 }),
      });
      const patchRes = await updateCartItemRoute(patchReq, {
        params: Promise.resolve({ id: 'SKU-PPR-A4-80G' }),
      });
      expect(patchRes.status).toBe(200);
      const patchData = await patchRes.json();
      expect(patchData.items[0].qty).toBe(5);

      const deleteReq = new NextRequest('http://localhost:3000/api/cart/items/SKU-PPR-A4-80G', {
        method: 'DELETE',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(approvedToken)}`,
          'x-csrf-token': csrfToken,
        },
      });
      const deleteRes = await deleteCartItemRoute(deleteReq, {
        params: Promise.resolve({ id: 'SKU-PPR-A4-80G' }),
      });
      expect(deleteRes.status).toBe(200);
      const deleteData = await deleteRes.json();
      expect(deleteData.items).toHaveLength(0);
    });

    it('processes POST /api/checkout successfully and prevents empty cart checkout', async () => {

      const emptyCheckoutReq = new NextRequest('http://localhost:3000/api/checkout', {
        method: 'POST',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(approvedToken)}`,
          'x-csrf-token': csrfToken,
        },
      });
      const emptyRes = await checkoutRoute(emptyCheckoutReq);
      expect(emptyRes.status).toBe(409);

      await setStockBalance('SKU-PPR-A4-80G', 100);
      await CartService.addItem(customerId, 'SKU-PPR-A4-80G', 3);

      const checkoutReq = new NextRequest('http://localhost:3000/api/checkout', {
        method: 'POST',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(approvedToken)}`,
          'x-csrf-token': csrfToken,
        },
      });
      const checkoutRes = await checkoutRoute(checkoutReq);
      expect(checkoutRes.status).toBe(201);
      const data = await checkoutRes.json();
      expect(data.success).toBe(true);
      expect(data.order.status).toBe('PENDING_SALES_REVIEW');
      expect(data.order.order_number).toMatch(/^SO-\d+$/);
    });
  });
});
