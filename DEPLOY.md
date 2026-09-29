# DEPLOY.md — Production Runbook (`APP_DOMAIN`)

Target: four AMD Epyc virtual servers (Ubuntu 24.04 LTS), one role per node.
Internet-facing. No Docker. No third-party data plane. Forward-only migrations.

Throughout this file, `APP_DOMAIN` means your production domain (apex, e.g.
`yourshop.co.za`). Replace it everywhere it appears.

## 0. Provider: Domains.co.za

All four nodes are Linux VPS instances at Domains.co.za (Teraco, Johannesburg)
on AMD EPYC hardware with NVMe storage. The plans below are the current
Linux lineup (prices include VAT, traffic unmetered, no contracts):

| Node | Suggested plan | vCPU | RAM | NVMe | Indicative price |
|---|---|---|---|---|---|
| site01 (app) | 2 vCPU / 4 GB | 2 | 4 GB | 100 GB | ~R419/mo |
| mysql01 (ledger) | 4 vCPU / 8 GB | 4 | 8 GB | 200 GB | ~R829/mo |
| mongo01 (catalog) | 2 vCPU / 4 GB | 2 | 4 GB | 100 GB | ~R419/mo |
| redis01 (sessions) | 1 vCPU / 2 GB | 1 | 2 GB | 50 GB | ~R209/mo |

Size up rather than down for mysql01: the ledger carries row locks, invoice
sequencing, and audit writes under concurrent checkout. Every plan includes a
dedicated IPv4 address, VNC console (emergency access if SSH breaks), and free
monthly snapshots — snapshots complement, but never replace, the database
dumps in §3–§5.

Enable **private networking** between the four instances (secure 10Gbps,
unmetered; request it via the Domains.co.za panel or support if it is not
already active on your account) and assign:

| Node | Public IP | Private IP |
|---|---|---|
| site01 | provider-assigned | 10.10.0.10 |
| mysql01 | none (remove if assigned) | 10.10.0.11 |
| mongo01 | none (remove if assigned) | 10.10.0.12 |
| redis01 | none (remove if assigned) | 10.10.0.13 |

Database nodes must not be reachable from the internet; §2 enforces this with
host firewalls on top. Select the Ubuntu 24.04 LTS image when provisioning
each VPS. All four nodes are self-managed: every step below is yours to run.

## 1. Topology

```
Internet (443/80)
  |
site01  <provider public IPv4> / 10.10.0.10 (private)  App + nginx + TLS
  |--3306--> mysql01  10.10.0.11 (private only)        MySQL 8 ledger + identity
  |--27017-> mongo01  10.10.0.12 (private only)        MongoDB 7 catalog
  |--6379--> redis01  10.10.0.13 (private only)        Redis 7 sessions/cache/locks/queues
```

Public DNS (`APP_DOMAIN` zone):

| Host | Type | Value |
|---|---|---|
| `APP_DOMAIN` | A | site01 public IPv4 |
| `www.APP_DOMAIN` | CNAME | `APP_DOMAIN` |

The app serves `https://APP_DOMAIN` (apex). `www` redirects to apex at nginx.
Database nodes have NO public IPs and accept traffic only from `10.10.0.10`.

Port matrix:

| From → To | Port | Purpose |
|---|---|---|
| Internet → site01 | 80, 443 | HTTP (ACME + redirect), HTTPS |
| Admin → all nodes | 22 | SSH (key only, see §3) |
| site01 → mysql01 | 3306 | App ledger access |
| site01 → mongo01 | 27017 | App catalog access |
| site01 → redis01 | 6379 | App sessions/cache/locks |

Nothing else is open between nodes. Database ports are never exposed to the internet.

## 2. Base Hardening (ALL Four Nodes)

Run as root on a fresh Ubuntu 24.04 image:

```bash
apt update && apt upgrade -y
apt install -y ufw fail2ban unattended-upgrades chrony ca-certificates curl gnupg
timedatectl set-timezone Africa/Johannesburg
useradd -m -s /bin/bash deploy
mkdir -p /home/deploy/.ssh && chmod 700 /home/deploy/.ssh
printf '%s\n' 'YOUR_SSH_PUBLIC_KEY_HERE' > /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
usermod -aG sudo deploy
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart ssh
```

Unattended security upgrades:

```bash
dpkg-reconfigure -plow unattended-upgrades
```

Fail2ban for SSH (default jail is sufficient; verify it is enabled):

```bash
systemctl enable --now fail2ban
fail2ban-client status sshd
```

Host firewall. On site01:

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

On each database node (example mysql01; repeat per role with its port):

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow from 10.10.0.10 to any port 3306
ufw enable
```

Use port `27017` on mongo01 and `6379` on redis01 instead of `3306`.
From here on, work as the `deploy` user unless stated.

## 3. mysql01 — MySQL 8 Ledger

```bash
sudo apt install -y mysql-server
sudo mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH caching_sha2_password BY 'STRONG_LOCAL_ROOT_PASSWORD';"
```

Bind to the private network only (`/etc/mysql/mysql.conf.d/mysqld.cnf`):

```ini
[mysqld]
bind-address = 10.10.0.11
require_secure_transport = OFF
```

Restart: `sudo systemctl restart mysql`.

Create database and least-privilege app user (run `sudo mysql -p` locally):

```sql
CREATE DATABASE IF NOT EXISTS stationery CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'stationery_app'@'10.10.0.10' IDENTIFIED BY 'STRONG_APP_DB_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES, CREATE TEMPORARY TABLES, LOCK TABLES, EXECUTE ON stationery.* TO 'stationery_app'@'10.10.0.10';
FLUSH PRIVILEGES;
```

`DATABASE_URL` shape (used on site01 only, never committed):

```
DATABASE_URL=mysql://stationery_app:STRONG_APP_DB_PASSWORD@10.10.0.11:3306/stationery
```

Nightly logical backup (root crontab on mysql01, `sudo crontab -e`):

```cron
15 2 * * * /usr/bin/mysqldump --single-transaction --routines --triggers stationery | /usr/bin/gzip > /var/backups/mysql/stationery-$(date +\%F).sql.gz && /usr/bin/find /var/backups/mysql -name 'stationery-*.sql.gz' -mtime +14 -delete
```

Copy `/var/backups/mysql` offsite daily (pull from a backup host with rsync over SSH; backups contain PII — encrypt at rest and restrict to operator access, POPIA). Take a Domains.co.za panel snapshot before every production update as a second line of defence. Restore drill monthly:

```bash
gunzip -c /var/backups/mysql/stationery-<DATE>.sql.gz | mysql -u root -p stationery_restore_test
```

## 4. mongo01 — MongoDB 7 Catalog

```bash
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update && sudo apt install -y mongodb-org
```

`/etc/mongod.conf` (private bind, auth on, no public exposure):

```yaml
net:
  port: 27017
  bindIp: 10.10.0.12
security:
  authorization: enabled
storage:
  dbPath: /var/lib/mongodb
systemLog:
  destination: file
  path: /var/log/mongodb/mongod.log
```

Start without auth once to create users, then restart with auth:

```bash
sudo systemctl start mongod
mongosh --host 10.10.0.12 <<'EOF'
use admin
db.createUser({ user: 'siteAdmin', pwd: 'STRONG_MONGO_ROOT_PASSWORD', roles: ['userAdminAnyDatabase', 'dbAdminAnyDatabase'] })
use stationery
db.createUser({ user: 'stationery_app', pwd: 'STRONG_APP_MONGO_PASSWORD', roles: [{ role: 'readWrite', db: 'stationery' }] })
EOF
sudo systemctl restart mongod
```

`MONGO_URL` shape (site01 only):

```
MONGO_URL=mongodb://stationery_app:STRONG_APP_MONGO_PASSWORD@10.10.0.12:27017/stationery
```

Nightly backup (root crontab on mongo01):

```cron
25 2 * * * /usr/bin/mongodump --host 10.10.0.12 -u siteAdmin -p 'STRONG_MONGO_ROOT_PASSWORD' --authenticationDatabase admin --db stationery --gzip --archive=/var/backups/mongo/stationery-$(date +\%F).gz && /usr/bin/find /var/backups/mongo -name 'stationery-*.gz' -mtime +14 -delete
```

Pull offsite like MySQL backups.

## 5. redis01 — Redis 7 Sessions and Cache

```bash
sudo apt install -y redis-server
```

`/etc/redis/redis.conf` (private bind, auth, persistence, no eviction of live keys):

```ini
bind 10.10.0.13
port 6379
protected-mode yes
requirepass STRONG_REDIS_PASSWORD
save 900 1
save 300 10
appendonly yes
appendfsync everysec
maxmemory 1gb
maxmemory-policy noeviction
rename-command FLUSHDB ""
rename-command FLUSHALL ""
```

Restart: `sudo systemctl restart redis-server`. Verify from site01 later:

```bash
redis-cli -h 10.10.0.13 -a 'STRONG_REDIS_PASSWORD' ping
```

`REDIS_URL` shape (site01 only):

```
REDIS_URL=redis://:STRONG_REDIS_PASSWORD@10.10.0.13:6379
```

Redis holds sessions (30 min sliding), carts (7 days, mirrored to MySQL `draft_orders`), stock locks (10 s), catalog cache (60 s), rate-limit buckets, and the staff stream. It is never authoritative: a flush costs at most active logins (users sign in again) and warm caches. Back up the append-only file with the same offsite job:

```cron
35 2 * * * /bin/cp /var/lib/redis/appendonlydir/*.aof /var/backups/redis/ 2>/dev/null; /usr/bin/find /var/backups/redis -mtime +7 -delete
```

## 6. site01 — Application Node

### 6.1 Node.js 22 and source

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git nginx certbot python3-certbot-nginx
node --version
sudo mkdir -p /srv/stationery && sudo chown deploy:deploy /srv/stationery
git clone https://github.com/steamytooolz-commits/stationery-depot-core.git /srv/stationery/app
cd /srv/stationery/app
git checkout main
npm install --no-audit --no-fund
```

### 6.2 Environment file (never committed, root-readable only)

`/srv/stationery/app/.env` (mode `600`, owner `deploy`):

```ini
DATABASE_URL=mysql://stationery_app:STRONG_APP_DB_PASSWORD@10.10.0.11:3306/stationery
MONGO_URL=mongodb://stationery_app:STRONG_APP_MONGO_PASSWORD@10.10.0.12:27017/stationery
REDIS_URL=redis://:STRONG_REDIS_PASSWORD@10.10.0.13:6379
SESSION_SECRET=<64+ random bytes hex — generate below>
RECAPTCHA_SECRET=<Google reCAPTCHA v2/v3 secret for APP_DOMAIN>
TOTP_ISSUER=StationeryDepot
MAIL_HOST=<mail relay hostname — leave empty to disable outbound mail>
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=<relay username if authenticated>
MAIL_PASS=<relay password if authenticated>
MAIL_FROM=Stationery Depot <no-reply@APP_DOMAIN>
SALES_TEAM_EMAIL=sales@APP_DOMAIN
```

Generate the session secret:

```bash
openssl rand -hex 48
```

Never rotate `SESSION_SECRET` on a live system without a TOTP re-enrollment
plan: every stored TOTP secret is encrypted with a key derived from it, so
rotation orphans all two-factor secrets and locks every user out at the 2FA
step. If rotation is ever required, schedule a maintenance window, rotate,
then walk every user through fresh TOTP enrollment at next login.

Google reCAPTCHA keys are created once in the Google admin console for exactly `APP_DOMAIN` (and `www.APP_DOMAIN`); only the secret goes here. The site key is baked into the login/register pages at build time if the frontend integration requires it.

Outbound mail (sales invoice + payment-proof notifications) is optional: with `MAIL_HOST` empty the app logs sends instead of delivering them. Payment-proof files are stored under `uploads/payment-proofs/` on site01 — include that directory in server backups and exclude it from any public web root (it is outside `public/` by design and only reachable through authenticated, audited staff endpoints).

### 6.3 Migrate then build

```bash
cd /srv/stationery/app
set -a; source .env; set +a
npm run migrate
npm run build
npm prune --omit=dev
```

`npm run migrate` is the ONLY writer of schema besides the app itself. Migrations are forward-only; there is no down-migration path by design.

### 6.4 systemd service

`/etc/systemd/system/stationery.service` (root):

```ini
[Unit]
Description=Stationery Depot Core (Next.js standalone)
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/srv/stationery/app
EnvironmentFile=/srv/stationery/app/.env
Environment=PORT=3000
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /srv/stationery/app/.next/standalone/server.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now stationery
sudo systemctl status stationery --no-pager
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/catalog
```

Expect `200` with zero price fields (public trade gate).

### 6.5 nginx reverse proxy and TLS

`/etc/nginx/sites-available/stationery` (root, symlink into `sites-enabled`, remove `default`):

```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;

server {
  listen 80;
  server_name APP_DOMAIN www.APP_DOMAIN;
  location /.well-known/acme-challenge/ { root /var/www/html; }
  location / { return 301 https://APP_DOMAIN$request_uri; }
}

server {
  listen 443 ssl;
  server_name www.APP_DOMAIN;
  ssl_certificate /etc/letsencrypt/live/APP_DOMAIN/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/APP_DOMAIN/privkey.pem;
  return 301 https://APP_DOMAIN$request_uri;
}

server {
  listen 443 ssl http2;
  server_name APP_DOMAIN;

  ssl_certificate /etc/letsencrypt/live/APP_DOMAIN/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/APP_DOMAIN/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_prefer_server_ciphers on;

  client_max_body_size 10m;

  location / {
    limit_req zone=api burst=60 nodelay;
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
  }
}
```

Issue certificates and reload:

```bash
sudo certbot --nginx -d APP_DOMAIN -d www.APP_DOMAIN --redirect --agree-tos -m ops@APP_DOMAIN --no-eff-email
sudo nginx -t && sudo systemctl reload nginx
```

Certbot renews automatically via its systemd timer; verify with `sudo certbot renew --dry-run`.
The app already sends `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and a strict Content-Security-Policy — do not strip them at the proxy.

## 7. Bootstrap the First ADMIN (Runbook SQL)

Accounts are created only through the registration flow — migrations seed no users and no credentials. After deploy:

1. Open `https://APP_DOMAIN/register` and register the operator account (strong password, complete TOTP setup).
2. On mysql01, promote it (replace the email):

```sql
UPDATE users SET role = 'ADMIN', status = 'APPROVED', failed_login_count = 0, locked_until = NULL
WHERE email = 'operator@APP_DOMAIN';
UPDATE customers SET status = 'APPROVED' WHERE email = 'operator@APP_DOMAIN';
```

3. Log in with password + TOTP. All further approvals, tier assignments, and adjustments happen in `/admin` as ADMIN, each written to `audit_log`.

## 8. POPIA Operations

- **Erasure**: ADMIN only, in `/admin` on the customer record (two-step confirm) or `POST /api/admin/popia/erase/[customerId]`. PII is anonymized and logins blocked; orders, invoices, lines, movements, and drafts are preserved under legal hold. Every erasure writes a `POPIA_ERASURE` audit row.
- **Staging purge** (staging environments only, weekly cron on mysql01 as root):

```cron
5 3 * * 0 /usr/bin/mysql -u root -p'STRONG_LOCAL_ROOT_PASSWORD' stationery -e "DELETE FROM draft_orders WHERE updated_at < UTC_TIMESTAMP() - INTERVAL 7 DAY; INSERT INTO audit_log (actor_id, actor_role, action, entity_type, entity_id, before_hash, after_hash, ip, created_at) VALUES (NULL, 'SYSTEM', 'STAGING_PURGE', 'draft_orders', 'older-than-7d', NULL, NULL, '127.0.0.1', UTC_TIMESTAMP());"
```

- Backups contain PII: encrypt at rest, restrict to operators, and cover them in the PAIA manual.

## 9. Updates and Rollback

```bash
cd /srv/stationery/app
git pull --ff-only origin main
npm install --no-audit --no-fund
set -a; source .env; set +a
npm run migrate
npm run build
npm prune --omit=dev
sudo systemctl restart stationery
curl -s -o /dev/null -w '%{http_code}\n' https://APP_DOMAIN/api/catalog
```

Rollback is forward-only for data: check out the previous tag/commit, rebuild, restart. Never hand-edit production rows except the bootstrap in §7; every other change flows through the app (audited) or versioned migrations.

## 10. Monitoring and Troubleshooting

- `sudo systemctl status stationery`, `sudo journalctl -u stationery -f`.
- Health probe (public, exercises Mongo + Redis + MySQL session check): `GET https://APP_DOMAIN/api/catalog` must return `200`. Alert on anything else.
- Disk/memory per node: `/var/lib/mysql`, `/var/lib/mongodb`, `/var/lib/redis`, `/srv/stationery`; alert above 80%.
- Slow checkout or `STOCK_LOCK_CONFLICT`: inspect Redis `lock:stock:*` TTLs and MySQL `SHOW ENGINE INNODB STATUS` for lock waits.
- `429` bursts: token buckets refill automatically; sustained abuse → block at `ufw` and review `audit_log` (`LOGIN_FAILURE`, `2FA_FAILURE`).
- Locked out of SSH: use the Domains.co.za panel VNC console to get back in, then fix keys/firewall from inside.
- Clock skew breaks TOTP and invoice dating: `chrony` is mandatory on all nodes (`chronyc tracking`).

## 11. Security Notes Specific to This Deployment

- Database credentials exist in exactly one place each: the service config on its own node plus site01 `.env` (mode 600). They are never logged (POPIA-redacting logger), never committed (CI secret scan), and never leave the private subnet.
- `X-Frame-Options: DENY` means the app cannot be iframed — including preview iframes. This is intentional.
- `test-token-valid` reCAPTCHA bypass works only when `NODE_ENV` is not `production`. Production verifies every registration and login against Google.
- Rate limits are token buckets per IP and per account on registration, login, 2FA, checkout, and exports.
