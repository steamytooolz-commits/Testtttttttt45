# Stationery Depot — Private Readme & Demo Accounts

This private guide lists all pre-seeded demo accounts, credentials, role permissions, and key testing workflows.

---

## 🔑 Demo Login Accounts

| Role | Email | Password | Status | Organization / Details |
|---|---|---|---|---|
| **System Admin** | `admin@stationerydepot.co.za` | `password123` | `APPROVED` | Head Office Administrator (Full catalogue, pricing tiers, customer approvals, stock balance movements, and audit log) |
| **Trade Customer** (Primary) | `procurement@capeoffice.co.za` | `password123` | `APPROVED` | Cape Office Supplies (Tier 1 Commercial: 15% discount, custom quoted prices, cart & orders) |
| **Sales Staff 1** | `staff1@stationerydepot.co.za` | `password123` | `APPROVED` | Sales Order Queue fulfillment, payment proof verification, and invoice generation |
| **Sales Staff 2** | `staff2@stationerydepot.co.za` | `password123` | `APPROVED` | Secondary sales queue officer |
| **School Customer** | `orders@peninsulaschools.org` | `password123` | `APPROVED` | Peninsula Schools (Education tier: 12% discount) |
| **Retail Reseller** | `finance@bolandstationers.co.za` | `password123` | `APPROVED` | Boland Stationers (Reseller tier: 20% discount) |
| **Regional Customer** | `admin@karooofficesupplies.co.za` | `password123` | `APPROVED` | Karoo Office Supplies (Standard commercial: 8% discount) |
| **Prospect Customer** | `newbuyer@durbanoffice.co.za` | `password123` | `PENDING_APPROVAL` | Durban Office (Demonstrates the pending verification state) |

> **Authentication note:**
> All pre-seeded accounts accept `password123`. For quick testing, you can also use the **Quick Demo Credentials** 1-tap buttons on the `/login` page or the demo switcher inside the mobile drawer.

---

## 📱 Mobile UI & Mobile Drawer Purpose

### What the Mobile Drawer Does:
The mobile drawer provides full, single-tap access to all key wholesale portal destinations ("XYZ"):
1. **Account & Role Banner**:
   - Shows active user email, assigned wholesale tier (e.g. `Tier 1: Commercial (15% off)`), and verification status (`Approved` vs `Pending`).
   - If logged out: High-contrast buttons for **Trade Sign In** and **Open Trade Account**.
2. **Core Portal Navigation**:
   - 📦 **Wholesale Catalog** (`/catalog`) — Full B2B catalogue with category & attribute filters.
   - ⚡ **Quick Matrix Order** (`/quick-order`) — Bulk SKU entry, matrix sizing grid, and CSV upload.
   - 🛒 **Shopping Cart** (`/cart`) — View items, subtotal, VAT calculation, and EFT checkout.
   - 📋 **Purchase Orders & Proofs** (`/orders`) — Status tracking, payment proof uploads, and 1-tap re-ordering.
   - 🧾 **Tax Invoices** (`/invoices`) — Download SARS-compliant sequential VAT invoices (`INV-...`).
   - 👤 **My Account & Tier Pricing** (`/account`) — Profile, delivery details, and assigned pricing rates.
3. **Staff & Operations (When Staff/Admin)**:
   - 🏢 **Fulfillment Queue** (`/queue`) — Review orders, inspect payment receipts, approve transitions.
   - ⚙️ **Admin Console** (`/admin`) — Manage customer approvals, SKU custom quotes, price tiers, stock movements, and audit log.
4. **Legal & Consumer Links**:
   - 📜 **Wholesale Terms** (`/terms`)
   - 🔒 **Privacy Policy** (`/privacy`)
   - 🛡️ **POPIA Compliance** (`/popia`)
   - 🌐 **Retail Storefront** (`https://thestationerydepot.co.za`)
5. **Quick Demo Credentials Switcher**:
   - Accessible right inside the drawer on mobile for seamless account switching without typing passwords on mobile keyboards.
6. **Mobile Header Polish**:
   - Added a direct **Cart button** in the mobile top bar with live item count so users can access their cart immediately without having to open the menu.
   - Smooth slide-out off-canvas drawer with backdrop blur and background scroll-lock.

---

## 🚀 Key Testing Workflows

### 1. B2B Trade Customer Workflow
1. Sign in with `procurement@capeoffice.co.za` (or click Cape Office on `/login`).
2. Navigate to `/catalog` to view live quoted prices on SKUs.
3. Add items to cart, or go to `/quick-order` to test bulk matrix ordering or CSV uploads.
4. Go to `/cart` and complete EFT checkout.
5. In `/orders`, inspect the placed order and upload an EFT proof of payment.
6. In `/invoices`, download SARS-compliant sequential VAT invoices (`INV-...`) as PDF documents.

### 2. Administrator Portal Workflow
1. Sign in with `admin@stationerydepot.co.za`.
2. Navigate to `/admin`:
   - **Customer Approvals**: Approve or suspend customer accounts.
   - **Custom Pricing**: Assign SKU-level custom quoted contract pricing.
   - **Catalogue Management**: Create/edit products, upload images, import products via CSV or Excel (`.xlsx`).
   - **Price Tiers**: Create tiers or import matrix price tables.
   - **Stock Balances**: Real-time stock counts and stock movement adjustments.
   - **Audit Trail**: Immutable log of security and system actions.

### 3. Sales Staff Queue Workflow
1. Sign in with `staff1@stationerydepot.co.za`.
2. Navigate to `/queue`:
   - Review incoming sales orders (`PENDING_SALES_REVIEW`).
   - Transition orders: Approve -> Issue Invoice (`INV-...`) -> Fulfil/Dispatch.
   - Inspect EFT payment proofs uploaded by clients.
