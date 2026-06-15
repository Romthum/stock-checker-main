# Production Architecture Notes

## Goals

- LAN-first POS operation.
- Sales and stock updates continue when the internet is down.
- PostgreSQL data stays on the Mini PC SSD.
- Remote dashboard access uses Cloudflare Tunnel, not router port forwarding.
- Docker runs every service.
- PostgreSQL is prepared for 100,000+ products and millions of transactions.

## Services

| Service | Purpose |
| --- | --- |
| `web` | Next.js standalone app and server API |
| `postgres` | Primary local database |
| `nginx` | LAN reverse proxy and Grafana sub-path proxy |
| `cloudflared` | Remote access through Cloudflare Tunnel |
| `backup` | Daily PostgreSQL backups |
| `prometheus` | Metrics collection |
| `grafana` | Monitoring dashboard |
| `postgres-exporter` | PostgreSQL metrics |
| `node-exporter` | Host metrics |
| `cadvisor` | Container metrics |

## Database Design

Core tables:

- `users`: local authentication and roles.
- `branches`: future multi-branch boundary.
- `products`: catalog and current stock balance.
- `product_barcodes`: multiple barcodes per product.
- `stock_movements`: append-only inventory event history.
- `sales_orders`, `sales_order_items`, `payments`: POS transaction foundation.
- `audit_logs`: sensitive operations.

Important indexes:

- Partial unique index on active `products.sku`.
- Trigram indexes on product name and SKU.
- Movement indexes by product and branch/date.

## Auth

Authentication is local:

- Passwords are hashed server-side.
- Login creates an HttpOnly session cookie.
- API routes re-check the user from PostgreSQL on every request.
- Owner-only operations are enforced server-side.

Roles:

- `OWNER`
- `MANAGER`
- `CASHIER`
- `INVENTORY_STAFF`
- `AUDITOR`
- `STAFF`

## Stock Consistency

Stock writes must use server transactions:

1. Lock product row with `FOR UPDATE`.
2. Validate resulting quantity.
3. Insert `stock_movements`.
4. Update `products.qty`.
5. Commit.

This protects the POS from double-clicks and concurrent cashier operations.

## Disaster Recovery

## Local Storage And Backup Paths

The Docker stack stores persistent data on the host machine through bind mounts.
Set these paths in `.env`:

```env
POSTGRES_DATA_DIR=D:/pos-data/postgres
UPLOADS_DIR=D:/pos-data/uploads
BACKUP_DIR=E:/pos-backups/postgres
```

Recommended layout:

- PostgreSQL data: internal NVMe SSD.
- Uploads: internal NVMe SSD.
- Daily backups: external SSD, NAS, or a second internal drive.
- Offsite copy: encrypted cloud sync.

Do not keep the only backup on the same physical SSD as PostgreSQL in production.

Internet outage:

- POS still works through LAN.
- Remote access and offsite sync pause until internet returns.

App container failure:

```powershell
docker compose restart web nginx
```

Database restore:

```powershell
docker compose stop web
docker compose stop postgres
Rename-Item data/postgres data/postgres_corrupt
New-Item -ItemType Directory data/postgres
docker compose up -d postgres
pg_restore -h localhost -U pos_app -d pos backups/postgres/latest.dump
docker compose up -d
```

Recommended targets:

- RPO: 24 hours with daily backup.
- RPO: under 1 hour if WAL archiving is added.
- RTO: 1-4 hours with spare SSD/Mini PC ready.

## Hardware

Minimum:

- Intel N100
- 16GB RAM
- 512GB NVMe SSD
- Gigabit LAN
- UPS 600VA+
- External SSD 1TB for local backup

Recommended:

- Intel i3-N305 or better
- 32GB RAM
- 1TB high-endurance NVMe SSD
- UPS 1000VA
- Offsite encrypted backup
- Spare Mini PC or spare SSD image

## Future Expansion

Multi-branch:

- Keep each branch local-first.
- Add central reporting database.
- Sync append-only events and summary tables.

AI analytics:

- Start with daily summary tables.
- Add forecasting worker later.
- Keep heavy analytics away from cashier transaction paths.

Mobile app:

- Use the same API and role permissions.
- Prefer Cloudflare Access or a separate mobile API gateway.
