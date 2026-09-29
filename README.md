# Stationery Depot Core

Security-critical B2B stationery wholesaler core system for South African commercial enterprises, educational institutions, and retail distributors. Fixed scope. Proof over promises.

## Features

- **Staff-approved access**: registration enters `PENDING_APPROVAL`; pricing, cart, and checkout unlock only after staff approval.
- **New-prospect flow**: the registration tick-box ("already a registered client?") lets brand-new prospects register too. They are flagged `is_new_prospect`, audited as `PROSPECT_REGISTERED`, and surface in admin with a "needs contact" banner/filter. Sales contacts them, loads custom quoted prices, then approves — approval is the green light that unlocks their SKUs and pricing on the site.
- **Custom quoted prices**: every client gets per-product custom prices set by ADMIN at quote time (`customer_product_prices`, `CUSTOM` tier code on lines); price tiers remain as fallback defaults. Registration first, quote second, approval last.
- **Sales invoices**: sequential `INV-…` sales invoices go to the customer (PDF download) and to sales staff in the queue (PDF for Pastel capture) plus mapping-driven Pastel CSV export.
- **Tiered contract rates**: per-customer price tiers resolved from MySQL at catalog, cart, and checkout time; line snapshots are immutable.
- **Immutable SARS ledger**: invoices issue from a strictly monotonic atomic sequence (`INV-…`) under row locks, one per order. Credit notes (`CN-…`, ADMIN-only) restock lines and mark invoices `CREDITED`, blocking double-credit.
- **Enterprise security**: argon2id hashing, mandatory TOTP 2FA on every login, self-hosted proof-of-work captcha + honeypot (no third party), CSRF-bound sliding sessions with per-user instant invalidation, token-bucket rate limits, append-only audit log.
- **Credential recovery**: `pwd_reset_required` gate, ADMIN one-time temp password + 2FA reset, `/change-password` portal, full audit trail.
- **Documents**: real PDF sales invoices (`/api/invoices/[id]/pdf`) + monthly statements with balances, via @react-pdf/renderer. Issued invoices are emailed to the sales team with the PDF attached.
- **Payments**: customers pay by EFT at checkout and upload a proof of payment (`/api/orders/[id]/payment-proof`, PNG/JPEG/WebP/PDF, magic-byte validated); proofs land on the staff queue with a copy emailed to sales (`/api/staff/payment-proofs/[id]` to view).
- **Catalogue import**: strict CSV import with per-row error report, category auto-create, zero-stock seeding, cache invalidation + template route.
- **High-volume ordering**: matrix quick-order with live validation, CSV ingestion with template download, reusable requisition templates.
- **Staff queue**: approve, invoice, fulfil, and ADMIN-only cancel with reason and stock refund. Queue auto-refreshes every 30s.
- **Product catalogue management (ADMIN-only)**: Product Catalogue tab in admin — create/edit products with image upload, per-tier prices, CSV **and MS Excel (.xlsx)** import with per-row error report plus downloadable templates. Every product carries an image (upload or URL) shown across the catalogue.
- **Price tier import (ADMIN-only)**: New Price Tier panel defaults to file upload — CSV or Excel, auto-detected SKU+price or matrix layouts, adjustable column mapping, dry-run preview with row errors, merge-into-existing option, downloadable CSV/Excel templates.
- **Brand**: navy/sky-blue theme (`--color-brand-*`), retail logo (`/brand-logo.png`), and a `thestationerydepot.co.za` link in headers, footers, and auth pages.
- **Pastel export**: mapping-driven CSV for `customers` and `sales_orders` with a validation error report, streamed to download.
- **Admin minimum**: customer approval, tier create/update, read-only audit viewer, ADMIN-only POPIA erasure preserving financial records.
- **Responsive**: mobile, tablet, and desktop layouts; tables scroll horizontally instead of breaking.

## Tech Stack

- **Framework**: Next.js 16 (App Router, Node.js runtime, standalone output, Turbopack build)
- **Language**: TypeScript 5.9 strict (`no-any`, no `as unknown as`, no disables — enforced by CI lint)
- **Styling**: Tailwind CSS v4 only (CSS-first, no other styling system)
- **Database**: MySQL 8 (ledger + identity), MongoDB (catalog only, never prices or PII), Redis (sessions + per-user sets, cart, locks, catalog cache, PoW challenges, rate limits)
- **Security**: jose (JWT), argon2 (argon2id), otpauth (TOTP), @react-pdf/renderer (documents), nodemailer (env-gated outbound mail)
- **Testing**: Vitest
- **Styling rule**: no code comments anywhere in the codebase; code must be self-explanatory

## Roles and Authorization

| Capability | CUSTOMER | SALES_STAFF | ADMIN |
|---|---|---|---|
| Browse catalog with tier prices (APPROVED only) | Yes | — | — |
| Cart, checkout, own orders/invoices, repeat | Own only | — | — |
| Staff queue view, approve/invoice/fulfil | — | Yes | Yes |
| Cancel orders (refund) | — | — | Yes |
| Customer approve/suspend/tier assign | — | — | Yes |
| Stock adjust, tier create/update | — | — | Yes |
| Pastel + admin exports | — | Yes | Yes |
| Audit viewer | — | Yes (read) | Yes (read) |
| POPIA erasure | — | — | Yes |

Catalog pricing requires a valid session AND `APPROVED` status, checked inside the handler on every request. Customers can only ever read their own rows.

## Environment Variables

Secrets live only in a git-ignored `.env` with exactly these keys. No `NEXT_PUBLIC_` secrets. `.env.example` carries empty placeholders only.

```
DATABASE_URL=
MONGO_URL=
REDIS_URL=
SESSION_SECRET=
TOTP_ISSUER=StationeryDepot
```

`SESSION_SECRET` must be at least 32 bytes (96-char hex recommended, see `npm run gen:secret`). Captcha is self-hosted proof-of-work + honeypot (`/api/auth/challenge`); no third-party keys. Non-production accepts `test-token-valid` for tests; production requires a real PoW solution.

## Development Setup

```bash
npm install
cp .env.example .env
npm run dev
```

## Scripts

```bash
npm run dev        # Next.js dev server
npm run build      # Production build (typecheck enforced, no source maps)
npm run start      # Serve the production build
npm run lint       # ESLint (Next core-web-vitals + TypeScript sets)
npm run typecheck  # tsc --noEmit
npm test           # Vitest unit suite (in-memory mocks, no infrastructure needed)
npm run migrate    # Apply migrations/mysql/*.sql + migrations/mongo/*.mjs
```

## Structure

- `/app`: App Router pages by role group (`(public)`, `(auth)`, `(client)`, `(staff)`) plus `/app/components` for shared client components and `/app/api` mirroring the route contract.
- `/lib/repo/mysql|mongo|redis`: typed repositories, dual real-client/in-memory branches. Every module starts with `import 'server-only'`.
- `/lib/services`: domain logic (auth, catalog, catalog_import, products, documents, cart, checkout, quick_order, requisition, order_history, staff_queue, admin, pastel).
- `/lib/security`: argon2id, TOTP, sessions, CSRF, reCAPTCHA, IP helpers.
- `/lib/validation`: zod schemas for every input boundary, including the password-reset token interface (no SMTP in Core).
- `/lib/logger`: POPIA-redacting JSONL logger.
- `/config/pastel-mappings`: human-owned Pastel CSV mappings (`customers`, `sales_orders`).
- `/migrations/mysql`, `/migrations/mongo`: the only database write paths outside repositories, run via `npm run migrate`.
- `/tests/unit`: authorization matrix, price-gate payloads, concurrency, ledger invariants, mapper rules.
- `/.github/workflows/ci.yml`: install, typecheck, lint, tests, build, migration check, secret scan, exclusion grep.

## Money and Time Rules

All money is `DECIMAL(12,2)` strings computed with integer cents arithmetic; floating point never touches money, including display. Quantities are integers. All timestamps are UTC.

## Specification Deviations (Approved)

1. **Dependency exceptions**: the stack lock names an exact set; additionally installed are `lucide-react` (icons), `clsx` + `tailwind-merge` (class merging), `server-only` (mandated by the server-only data-layer rule), `eslint` + `eslint-config-next` (lint), `@tailwindcss/postcss` (required by Tailwind v4), `@react-pdf/renderer` (PDF documents, declarative layout engine), `nodemailer` (env-gated outbound mail for sales notifications), and `xlsx` (MS Excel catalogue import). Each is justified; nothing else may be added.
2. **Kept working surface beyond the contract**: bulk ordering, requisitions/templates, quick-order UI, PATCH customer management, inventory/stock/movement/tax views, product catalogue management (create/edit, image upload, CSV/Excel import), credit notes, PDF documents, and the reports export predate the contract, are fully tested, and are retained as recorded deviations.
3. **CI exists** (the exclusions list CI pipelines) because the security rules require CI to fail on committed secrets; it runs checks only, no deploys.
4. **Staging purge** runs as documented operator SQL (see DEPLOY.md), not a route, keeping the API contract closed.
5. **Password reset** exists as validation schemas only; no routes, no SMTP.

## Security operations

- **Layered bot defense**: Cloudflare free tier (WAF + Bot Fight Mode) in front; self-hosted proof-of-work captcha + honeypot in app. PoW difficulty escalates automatically (`0000` → `00000`) while auth-abuse signals are elevated, then drops back.
- **Rate limits with `Retry-After`**: auth endpoints return `429` with `Retry-After`; login/2FA/register use separate per-IP **and** per-account buckets (never a combined key). Expensive endpoints (imports, PDFs, exports) have per-user **daily quotas** (`QUOTA_EXCEEDED`).
- **Anti-spam registration**: disposable-email domain blocklist (`lib/validation/index.ts`, refresh from public lists weekly), 3/hour per-email cap, failed captchas are tarpitted 2–4s.
- **Uploads**: extension + size + magic-byte sniffing must all agree; product images are re-served as static files only.
- **Database integrity**: every write path is parameterized; money/stock mutations run in transactions with `CHECK` constraints as backstop (`010_safety_checks.sql`); financial rows are never deleted (POPIA anonymizes instead).
- **Backups**: `npm run backup` snapshots MySQL (`mysqldump --single-transaction`), Mongo collections (JSON), Redis RDB, and product images into `.local-db/backups/<timestamp>/`. Run it before `npm run migrate` and nightly via Task Scheduler. Test a restore quarterly.
- **Least privilege**: the app must run as `stationery_app`, never root. Apply once as root: `mysql -u root stationery < migrations/mysql/manual_001_least_privilege.sql` (adjust host/user first).

## Deployment

See [DEPLOY.md](./DEPLOY.md) for the full production runbook: 4-node AMD Epyc layout on `domain.co.za` (app, MySQL, MongoDB, Redis), internet hardening, TLS, backups, bootstrap, and operations.

## License

© 2026 Stationery Depot (Pty) Ltd. South Africa. All rights reserved.
POPIA Compliant • Fixed Scope Core
