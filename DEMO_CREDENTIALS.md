# Stationery Depot — Demo Credentials & Testing Guide

This private reference details all seeded accounts, credentials, role permissions, and workflows for testing the application.

---

## 🔑 Quick Credentials Table

| Role | Email | Password | Status | Organization / Details |
|---|---|---|---|---|
| **System Admin** | `admin@stationerydepot.co.za` | `password123` | `APPROVED` | Head Office Administrator (Full governance & catalogue management) |
| **Trade Customer** (Primary) | `procurement@capeoffice.co.za` | `password123` | `APPROVED` | Cape Office Supplies (Tier 1 Commercial: 15% discount) |
| **Sales Staff 1** | `staff1@stationerydepot.co.za` | `password123` | `APPROVED` | Order queue fulfilment & payment proof verification |
| **Sales Staff 2** | `staff2@stationerydepot.co.za` | `password123` | `APPROVED` | Secondary sales queue officer |
| **School Customer** | `orders@peninsulaschools.org` | `password123` | `APPROVED` | Peninsula Schools (Education tier: 12% discount) |
| **Retail Reseller** | `finance@bolandstationers.co.za` | `password123` | `APPROVED` | Boland Stationers (Reseller tier: 20% discount) |
| **Regional Customer** | `admin@karooofficesupplies.co.za` | `password123` | `APPROVED` | Karoo Office Supplies (Standard commercial: 8% discount) |
| **Prospect Customer** | `newbuyer@durbanoffice.co.za` | `password123` | `PENDING_APPROVAL` | Durban Office (Demonstrates the pending verification state) |

> **Note on Authentication:**
> 2FA/SMS blocking has been removed/streamlined for testing. Entering any password (or `password123`) for existing emails will log you in directly and issue a session. You can also click the **Quick Demo Credentials** buttons directly on `/login`.

---

## 🚀 Testing Key Workflows

### 1. B2B Trade Customer Workflow
1. Navigate to `/login` and sign in with `procurement@capeoffice.co.za`.
2. Visit `/catalog` to view wholesale tiered & custom quoted prices on SKUs.
3. Add items to cart, or go to `/quick-order` to test matrix grid ordering or bulk CSV uploads.
4. Complete EFT checkout at `/cart`.
5. Access `/orders` to view placed orders and upload payment proofs.
6. Access `/invoices` to download SARS-compliant sequential VAT invoices (`INV-...`) as PDF documents.

### 2. Administrator Portal Workflow
1. Sign in with `admin@stationerydepot.co.za`.
2. Visit `/admin`:
   - **Customer Approvals**: Approve or suspend customer accounts.
   - **Custom Pricing**: Assign SKU-level custom quoted contract pricing.
   - **Catalogue Management**: Create/edit products, upload images, import products via CSV or Excel (`.xlsx`).
   - **Price Tiers**: Create tiers or import matrix price tables.
   - **Stock Balances**: Real-time stock counts and stock movement adjustments.
   - **Audit Trail**: Immutable log of security and system actions.

### 3. Sales Staff Queue Workflow
1. Sign in with `staff1@stationerydepot.co.za`.
2. Visit `/queue`:
   - Review incoming sales orders (`PENDING_SALES_REVIEW`).
   - Transition orders: Approve -> Issue Invoice (`INV-...`) -> Fulfil/Dispatch.
   - Inspect EFT payment proofs uploaded by clients.

### 4. New Account Self-Registration
1. Visit `/register`.
2. Submit your business information.
3. Accounts are automatically saved and activated in MongoDB with an immediate session issued.
