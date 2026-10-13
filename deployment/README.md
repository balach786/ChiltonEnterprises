# Deployment guide

Target topology:

```
Browser ──► React SPA (Vercel / nginx)  ──► Express API (Node 20)  ──► MongoDB Atlas (replica set)
                 same origin or                     │
                 VITE_API_BASE_URL                  └── uploads/ (attachment files)
```

Two requirements that are easy to miss:

1. **MongoDB must be a replica set (or Atlas).** Multi-document transactions — customer creation,
   payments, draw confirmation, transfers — need replica-set semantics. A standalone `mongod`
   still works, but the API logs `transactions: not supported` and falls back to sequential
   writes. `/api/health` reports which mode is active.
2. **No secret ever reaches the frontend.** The SPA only knows `VITE_API_BASE_URL`. Database URIs,
   JWT keys and bcrypt settings live exclusively in the API environment.

## Option A — MongoDB Atlas + managed Node host + Vercel (recommended)

### 1. Database (MongoDB Atlas)

1. Create a cluster (M10 or higher for production; any Atlas cluster is a replica set, so
   transactions work out of the box).
2. Create a database user with `readWrite` on the `showroom` database.
3. Allow the API host's IP (or `0.0.0.0/0` behind an API-only network — prefer the narrower rule).
4. Copy the SRV connection string:
   `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority`

### 2. API (Render, Railway, Fly.io, or any Node 20 host)

```bash
cd backend
npm ci
npm run build          # emits dist/
```

Start command: `node dist/server.js` · build command: `npm ci && npm run build` ·
Node version: 20.x · health check path: `/api/health`.

Environment variables (all required unless marked optional):

| Variable | Example | Notes |
| --- | --- | --- |
| `NODE_ENV` | `production` | |
| `PORT` | `4000` | Most PaaS inject this automatically |
| `MONGODB_URI` | `mongodb+srv://…` | Atlas SRV string |
| `MONGODB_DB` | `showroom` | |
| `JWT_SECRET` | 64+ random chars | `openssl rand -hex 48` |
| `JWT_EXPIRES_IN` | `12h` | optional |
| `JWT_REFRESH_EXPIRES_IN` | `30d` | optional |
| `BCRYPT_ROUNDS` | `12` | 10–12 |
| `CORS_ORIGINS` | `https://showroom.example.com` | comma separated |
| `FRONTEND_URL` | `https://showroom.example.com` | used in emails/links |
| `USE_TRANSACTIONS` | `true` | keep on for Atlas |
| `TRUST_PROXY` | `1` | set when behind a proxy so audit IPs are real |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_MAX` | `900000` / `600` / `30` | optional |
| `SEED_DEFAULT_ADMIN` | `true` | only for the very first boot |
| `DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD` | — | change the password immediately |
| `UPLOADS_DIR` | `/var/data/uploads` | optional; must be a persistent volume |
| `MAX_UPLOAD_MB` | `5` | optional |

Then:

```bash
npm run init:tokens        # guarantees the 120-slot register exists
npm run seed               # base configuration: settings, accounts, partners, admin user
```

`npm run seed` is idempotent — it never overwrites existing records. `npm run seed:demo` adds a
labelled demonstration dataset; do **not** run it in production.

### 3. Frontend (Vercel)

Root directory: `frontend`. Framework preset: Vite. Build `npm run build`, output `dist`.
`frontend/vercel.json` already sets the SPA rewrite and asset caching.

| Variable | Value |
| --- | --- |
| `VITE_API_BASE_URL` | `https://<your-api-host>` (must be in the API's `CORS_ORIGINS`) |
| `VITE_APP_NAME` | `Motorcycle Showroom Management` |

Leave `VITE_API_BASE_URL` empty only when the SPA is served from the same origin that proxies
`/api` (Option B/C).

## Option B — one server with Docker Compose

```bash
cp backend/.env.example deployment/.env      # then set JWT_SECRET and DEFAULT_ADMIN_PASSWORD
docker compose -f deployment/docker-compose.yml up --build -d
docker compose -f deployment/docker-compose.yml exec api node dist/scripts/initTokens.js
docker compose -f deployment/docker-compose.yml exec api node dist/scripts/seed.js
```

* `mongo` starts as a single-member replica set `rs0` (`mongo-init-replica.js`), so transactions
  are available.
* `api` is the compiled Express app from `backend/Dockerfile`.
* `web` is nginx serving the built SPA and proxying `/api` to `api:4000` (`deployment/nginx.conf`),
  exposed on `http://localhost:8080`.

> The compose stack, Dockerfiles and nginx config in this folder were **not executed** in the
> build environment (no Docker daemon available). They are provided ready to run and were
> reviewed against the API's runtime requirements.

## Option C — VPS without Docker

```bash
# 1. MongoDB as a single-node replica set
mongod --replSet rs0 --dbpath /var/lib/mongodb --bind_ip 127.0.0.1 --fork --logpath /var/log/mongod.log
mongosh --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]})'

# 2. API
cd backend && npm ci && cp .env.example .env && $EDITOR .env
npm run build && npm run init:tokens && npm run seed
pm2 start ../deployment/ecosystem.config.cjs --env production && pm2 save
# or: sudo cp ../deployment/showroom-api.service /etc/systemd/system/ && sudo systemctl enable --now showroom-api

# 3. Frontend
cd ../frontend && npm ci && VITE_API_BASE_URL= npm run build
# serve dist/ with nginx and proxy /api to 127.0.0.1:4000 (see deployment/nginx.conf)
```

## First-run checklist

1. `GET /api/health` → `status: ok`, `database.state: connected`, `expectedTokenSlots: 120`.
2. Sign in as the seeded administrator and **change the password immediately** (Profile page).
3. Settings → business name, report header, receipt prefix, duplicate-CNIC policy, scheme month.
4. Create the real user accounts for each role (Admin → Users). Passwords are bcrypt-hashed;
   `mustChangePassword` is set for new users.
5. Confirm Cash and Bank accounts and their opening balances (Cash & Bank → New account).
   Opening balances post an `OPENING_BALANCE` movement so the ledger still reconciles.
6. Enter the three partners if the seeded names differ (Partners). No ownership percentage is
   stored, by design.
7. Import historical customers if required:
   `npm run import:csv -- ./data/customers.csv [--payments ./data/payments.csv] [--dry-run]`
   * customers CSV: `tokenNumber,name,cnic,phone,location,joiningDate,monthlyInstallment[,fatherName,address,notes]`
   * payments CSV: `tokenNumber,monthNumber,amount,date,method[,notes]`
   Every row is validated before anything is written. Historical amounts must come from your own
   records — the importer never invents values, and `--dry-run` reports what it would do.
8. Record a test payment, print the receipt, then reverse it to confirm the audit trail behaves.
9. Take the first archive: `GET /api/backups/export?format=json` (or `npm run archive:export`).

## Backups

* **In-app archive** — `GET /api/backups/export?format=json|xlsx|csv` streams every collection and
  writes a `BackupRecord` row (kind, format, size, per-collection counts, checksum, who ran it).
* **Restore** — the archive can be replayed into an empty database; `integration/backup.test.ts`
  verifies that record counts match after a restore.
* **Database level** — `mongodump --uri="$MONGODB_URI"` on a schedule, plus Atlas continuous
  backups for production. Store at least one off-site copy.
* Restoring over live data is destructive: point `MONGODB_DB` at a scratch database first, verify
  the counts, then switch.

## Post-deploy verification

```bash
curl -s https://<api>/api/health | jq .
TOKEN=$(curl -s -X POST https://<api>/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"admin@showroom.local","password":"<password>"}' | jq -r .data.accessToken)
curl -s -H "Authorization: Bearer $TOKEN" https://<api>/api/tokens | jq '.data.total'        # 120
curl -s -H "Authorization: Bearer $TOKEN" https://<api>/api/dashboard/summary | jq '.data.balances'
curl -s -o /tmp/customers.xlsx -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" \
  'https://<api>/api/reports/customers?format=xlsx'                                          # 200
```

Also confirm from a browser on the production SPA: login, dashboard figures, one payment with a
printable receipt, one export download, and that a `viewer` account cannot reach Admin screens.

## Hardening notes

* HTTPS everywhere; set `TRUST_PROXY=1` behind a proxy so audit entries record the real client IP.
* Keep `CORS_ORIGINS` to the exact SPA origin(s) — avoid `*` in production.
* Rotate `JWT_SECRET` if it is ever exposed; sessions invalidate on the next request.
* The audit log and `backuprecords` are append-only in practice: no endpoint deletes them.
* Rate limits are on by default (`express-rate-limit`), stricter for auth and for exports.
