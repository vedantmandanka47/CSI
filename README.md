# CSI GCET SB — Official Web Platform

The modern web platform for the **Computer Society of India (CSI) GCET Student Branch**, built with Next.js, NestJS, and PostgreSQL.

---

## 🏛️ Architecture Overview

This project is structured as an npm workspaces monorepo:

```
├── apps/
│   ├── api/          # NestJS backend (REST API, Prisma, Pino logger, Helmet, Deny-by-default guard)
│   └── web/          # Next.js 15 App Router frontend (Tailwind CSS, "Indigo Lattice" tokens, Theme provider)
├── packages/
│   └── shared/       # Shared contracts, Zod schemas, Permission matrix, Error envelope schema
├── tests/            # Centralized test suites (unit, e2e, helpers)
│   ├── unit/         # Unit test suites (api, web, shared)
│   ├── e2e/          # API end-to-end integration tests
│   └── helpers/      # Test helpers and environment bootstrap
├── docs/             # Architecture decision records (ADRs), Data inventory, Risk register, Vendors
└── scripts/          # Categorized operational scripts (database, development, setup, validation)
```

### Core Architecture Principles
- **Docker-Free:** Developed and operated on native local infrastructure (Node.js 24 + PostgreSQL 18+).
- **Reverse Proxy:** Next.js proxies `/api/*` directly to NestJS without CORS friction.
- **Server-Side Deny-By-Default:** Every API route is blocked unless explicitly decorated with `@RequirePermissions()` or `@Public()`.
- **Append-Only Audit Log:** Database triggers prevent any `UPDATE`, `DELETE`, or `TRUNCATE` operations on `audit_log`.
- **WCAG 2.2 AA:** Accessible design system ("Indigo Lattice") verified via automated contrast ratio checkers.
- **Data Minimization & Integrity:** Strict compliance with DPDP principles (no demo users, Argon2id passwords, Ed25519 QR signing).

---

## 🚀 Quick Start

See [SETUP.md](SETUP.md) for the complete, step-by-step setup guide from a fresh clone.

### Prerequisites
- **Node.js:** `v24.x` (see `.nvmrc`)
- **npm:** `v11.x`
- **PostgreSQL:** `16+` / `18+` running locally on port 5432

### Quick Verification Commands
```bash
# Run all automated quality checks
npm run check:colors      # Verifies no hardcoded color literals exist outside tokens.css
npm run check:contrast    # Verifies WCAG 2.2 AA contrast ratios for all token pairings
npm run check:content     # Scans for placeholders, lorem ipsum, and banned compliance claims
npm run lint              # ESLint across all workspaces and scripts
npm run typecheck         # TypeScript strict typechecking
npm run test              # Unit & integration tests (Jest + Vitest)
npm run build             # Production build of shared, api, and web packages
```

---

## 📖 Documentation Index

- [SETUP.md](SETUP.md) — Local installation and database bootstrap walkthrough
- [docs/DECISIONS.md](docs/DECISIONS.md) — Architecture Decision Records (ADR-001, ADR-002, ADR-003)
- [docs/DATA_INVENTORY.md](docs/DATA_INVENTORY.md) — Personal data inventory and retention rules
- [docs/VENDORS.md](docs/VENDORS.md) — Third-party service processors and vendor registry
- [docs/RISKS.md](docs/RISKS.md) — Risk register and security traceability matrix
- [docs/STATE.md](docs/STATE.md) — Current implementation phase and module status
- [PRIVACY.md](PRIVACY.md) — Privacy disclosures and technical data safeguard factual records

---

## 🛡️ License & Copyright

Copyright © 2026 CSI GCET Student Branch. All rights reserved.
Official logos and brand emblems are proprietary assets of the Computer Society of India.

