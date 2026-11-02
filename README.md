# CSI GCET SB — Official Web Platform

> [!CAUTION]
> ### ⚠️ CRITICAL LEGAL NOTICE — PLEASE READ BEFORE ACCESSING OR CONTRIBUTING
> **This repository and its associated software code are proprietary and strictly protected by copyright law.**
> 
> **No person or entity is permitted to modify, update, alter, adapt, distribute, or fork this website or its underlying codebase under any circumstances without prior, formal written authorization.** Any unauthorized modification, duplication, or branching of this source code is strictly prohibited and constitutes an actionable infringement of copyright.
> 
> Formal exceptions may only be granted on a strict case-by-case basis and require official documentation and identity recording by the designated governing authorities:
> - **Branch Counselor / Advisor:** Prof. Hetal Gaudani
> - **Technical Mentors:** Shruti Patel & Krushal Bhadiyadra
> - **Running President:** Vedant Mandanka
> 
> All permissions remain valid exclusively during the active tenure of the current leadership.
> 
> **👉 You must review the complete terms and legal disclaimers in the [LICENSE](./LICENSE) file before browsing, downloading, executing, or interacting with this repository.**

---

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24.0.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![npm](https://img.shields.io/badge/npm-%3E%3D11.0.0-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/)
[![Next.js](https://img.shields.io/badge/Next.js-15.5-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11.x-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-6.x-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%2B%20%7C%2018%2B-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8%20Strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![WCAG](https://img.shields.io/badge/WCAG%202.2-AA%20Compliant-4CAF50)](https://www.w3.org/WAI/standards-guidelines/wcag/)
[![DPDP](https://img.shields.io/badge/DPDP%20Act%202023-Aligned-blue)](#security--data-privacy)
[![License](https://img.shields.io/badge/License-Proprietary%20%2F%20Restricted-red.svg)](./LICENSE)

---

## 🏛️ Executive Summary

The **CSI GCET Student Branch Web Platform** is an enterprise-grade, secure, multi-tier digital operations system designed and engineered for the **Computer Society of India (CSI) Student Branch at G H Patel College of Engineering & Technology (GCET)**, Vallabh Vidyanagar, Gujarat.

The platform provides end-to-end management of the student branch lifecycle, including:
- **Identity & RBAC:** Zero-trust, deny-by-default role-based access control with granular permissions and tenure validation.
- **Membership Operations:** Digital registration, annual renewals, approval workflows, and cryptographic student verification.
- **Event Management & Ticketing:** Event creation, capacity controls, automated registration ticketing, and venue scheduling.
- **Cryptographic Attendance Verification:** Anti-tamper, replay-resistant attendance passes with asymmetric Ed25519 and HMAC signing.
- **Student Activity Passport & Extracurricular Dossier:** Verifiable co-curricular transcripts and dynamic certificate generation.
- **Committee Workspaces & Role Shells:** Isolated workspaces for Technical, Editorial, Creative, and Operations committees.
- **Task Management & Asset Workflows:** Milestone checklists, asset lifecycle pipelines, and proof-of-work tracking.
- **Annual Term Rollover & Archival:** Automated tenure transitions, member state archiving, and historical dossier preservation.
- **Tamper-Evident Audit Ledger:** Append-only PostgreSQL trigger-enforced audit trails protecting institutional integrity.

---

## 🏗️ System Architecture & Monorepo Topology

The platform is architected as an npm workspaces monorepo optimized for native, low-latency execution:

```
csi-gcet-sb/
├── apps/
│   ├── api/                    # NestJS 11 Enterprise REST API Backend
│   │   ├── prisma/             # Schema definitions, migrations, and seed scripts
│   │   └── src/
│   │       ├── common/         # Guards, interceptors, filters, decorators, crypto utilities
│   │       └── modules/        # Domain modules (auth, users, events, attendance, passport,
│   │                           #   workspaces, tasks, rollover, audit, health)
│   └── web/                    # Next.js 15.5 App Router Frontend (React 19)
│       └── src/
│           ├── app/            # App Router pages, server components, and route handlers
│           ├── components/     # UI design system ("Indigo Lattice" tokens, accessibility)
│           ├── hooks/          # Client-side reactivity and session validation hooks
│           └── lib/            # API client, CSRF headers, and security interceptors
├── packages/
│   └── shared/                 # Zero-dependency TypeScript Core Library
│       ├── src/contracts/      # API Request/Response DTOs and Error envelopes
│       ├── src/schemas/        # Zod validation schemas shared by client & server
│       └── src/security/       # Canonical permission matrix and role definitions
├── scripts/                    # Categorized Operational and Tooling Scripts
│   ├── database/               # Native DB setup, dev resets, and backup/restore drills
│   ├── development/            # Cryptographic secret generators and dev utilities
│   ├── setup/                  # Administrative account bootstrapping
│   └── validation/             # Automated token, contrast, and compliance scanners
├── tests/                      # Centralized Monorepo Test Suites
│   ├── e2e/                    # End-to-end integration tests (isolated test DB)
│   ├── helpers/                # Test fixtures, database harness, and session mocks
│   └── unit/                   # Unit test suites across api, web, and shared
├── docs/                       # Technical reports, system diagrams, and specifications
└── storage/                    # Local asset storage directory (uploads, avatars, backups)
```

### Core Engineering Principles

1. **Docker-Free Native Performance:** Developed and deployed directly against native operating system services (Node.js 24 + PostgreSQL 16+/18+), avoiding container virtualization overhead and maximizing I/O throughput.
2. **Reverse Proxy Edge Architecture:** Next.js acts as the unified edge gateway, securely proxying `/api/*` traffic directly to NestJS on localhost. This eliminates cross-origin resource sharing (CORS) surface areas and simplifies cookie-based session management.
3. **Deny-by-Default Server Authorization:** Every API endpoint is rejected by default by the global `PermissionsGuard` unless explicitly decorated with `@RequirePermissions()` or `@Public()`.
4. **PostgreSQL Trigger-Enforced Audit Immutability:** Audit records in `audit_log` cannot be altered or purged. PostgreSQL triggers reject all `UPDATE`, `DELETE`, or `TRUNCATE` operations at the database engine level.
5. **Field-Level AES-256-GCM Encryption:** Sensitive student PII (phone numbers, emergency contacts) is encrypted at rest using authenticated AES-256-GCM encryption with SHA-256 key derivation.
6. **Accessible "Indigo Lattice" Design System:** Strict WCAG 2.2 Level AA compliance. Permanent light mode with high-contrast color token pairings validated by automated CI color checkers.
7. **DPDP Act (2023) Alignment:** Built on strict data minimization principles — zero placeholder accounts, explicit user consent recording, role-based tenure expiration, and automated data retention policies.

---

## ⚙️ Prerequisites & Environment Requirements

| Requirement | Supported Version | Notes |
|:---|:---|:---|
| **Node.js** | `>= 24.0.0` (LTS) | Enforced via `.nvmrc` and `package.json` engines |
| **npm** | `>= 11.0.0` | Monorepo package manager and workspace runner |
| **PostgreSQL** | `16+` or `18+` | Running locally on port `5432` with `citext` and `btree_gist` |
| **Operating System** | Windows, Linux, macOS | Fully cross-platform native scripts |

---

## 🚀 Quick Start & Installation

For a comprehensive walkthrough from a fresh environment, refer to the [Local Environment Setup Guide (SETUP.md)](./SETUP.md).

### 1. Database Provisioning
Connect to your local PostgreSQL instance as a superuser (`postgres`) and execute the database bootstrapping script:
```bash
psql -U postgres -f scripts/database/db-setup.sql
```
*This configures two isolated roles (`csi_migrator` for schema migrations, `csi_app` for runtime DML) and two databases (`csi_gcet_dev` and `csi_gcet_test`).*

### 2. Environment Configuration
Initialize the environment configuration files from templates:
```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Generate fresh, cryptographically secure secrets:
```bash
npm run gen:secrets
```
*Copy the generated `SESSION_SECRET`, `CSRF_SECRET`, `APP_ENCRYPTION_KEY`, and Ed25519 QR signing keys into `apps/api/.env`.*

### 3. Dependency Installation
Install all monorepo workspace dependencies:
```bash
npm ci
```

### 4. Database Migrations & Seeding
Apply database migrations and seed baseline roles and committees:
```bash
npm run db:migrate
npm run db:seed
```

### 5. First Administrator Account Bootstrapping
Create the initial super-administrator account interactively:
```bash
npm run bootstrap:admin
```

### 6. Start Development Servers
Launch both the NestJS API (`http://localhost:4000`) and Next.js frontend (`http://localhost:3000`) concurrently:
```bash
npm run dev
```

Verify service connectivity at `http://localhost:3000/health`.

---

## 🛠️ Verification & Quality Assurance Pipeline

The repository enforces strict continuous verification across code quality, security, and accessibility:

| Command | Target / Scope | Description |
|:---|:---|:---|
| `npm run check:colors` | Frontend styling | Verifies zero hardcoded HEX/RGB/HSL color literals exist outside `tokens.css` |
| `npm run check:contrast` | Accessibility | Validates WCAG 2.2 AA (4.5:1 text, 3.0:1 UI) contrast ratios for token pairs |
| `npm run check:content` | Content integrity | Scans for banned placeholder tokens, lorem ipsum, or unverified claims |
| `npm run lint` | Code quality | Runs ESLint across all workspaces, shared packages, and operational scripts |
| `npm run typecheck` | Type safety | Strict TypeScript compilation across all workspaces without emitting files |
| `npm run test` | Unit tests | Executes Jest and Vitest test suites across backend, frontend, and shared code |
| `npm run test:e2e` | Integration tests | Executes full end-to-end API integration tests against `csi_gcet_test` |
| `npm run build` | Production build | Compiles `packages/shared`, NestJS API bundle, and Next.js static/SSR pages |
| `npm run backup` | Operational ops | Generates an authenticated, timestamped SQL backup with SHA-256 checksums |
| `npm run restore:drill` | Disaster recovery | Validates backup restoration integrity safely against an isolated target |
| `npm run audit:deps` | Security scanning | Audits production dependencies for known high/critical CVE advisories |

---

## 🔒 Security & Data Privacy Architecture

### Authentication & Session Lifecycle
- **Session Tokens:** Cryptographically random (256-bit entropy) session identifiers stored in HTTP-only, `SameSite=Lax`, `Secure` cookies.
- **Password Security:** Multi-pass Argon2id hashing with unique per-user salts, resistant to GPU/ASIC rainbow attacks.
- **CSRF Protection:** Double-submit cookie pattern with cryptographic secret verification on all state-mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`).

### Role-Based Access Control (RBAC)
- **Deny-by-Default:** Every API route is inaccessible unless tagged with `@RequirePermissions()`.
- **Tenure Validation:** Committee workspace access automatically checks the active academic term and revokes expired privileges upon rollover.
- **Least Privilege:** Granular permission flags (e.g., `events:create`, `attendance:scan`, `passport:verify`, `admin:rollover`).

### DPDP Act (2023) Alignment & Safeguards
- **Zero Hardcoded Accounts:** No test or dummy user credentials exist in source code or database migrations.
- **PII Encryption at Rest:** Sensitive student attributes are stored using authenticated AES-256-GCM encryption.
- **Audit Logging:** Every administrative mutation, permission elevation, and data export is immutably logged with client IP, user agent, and timestamp.

---

## 👥 Governance & Administration

The CSI GCET Student Branch Web Platform operates under the governance and supervision of:

- **Branch Counselor / Faculty Advisor:** Prof. Hetal Gaudani
- **Technical Mentors:** Shruti Patel & Krushal Bhadiyadra
- **Running President:** Vedant Mandanka
- **Institution:** G H Patel College of Engineering & Technology (GCET), CVM University, Vallabh Vidyanagar, Gujarat, India.

---

## 📜 Proprietary License & Distribution

Copyright © 2026 CSI GCET Student Branch. All Rights Reserved.

This platform and its codebase are proprietary software. **No person or entity is allowed to change, update, modify, alter, or fork this website or its associated software code under any circumstances without formal written authorization.**

For complete legal terms, tenure restrictions, and liability disclaimers, please consult the **[LICENSE](./LICENSE)** file.
