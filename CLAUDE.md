# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Express 5 + Mongoose REST API (ES modules, plain JavaScript) backing the separate `first-frame` frontend repo. An **account** is the top-level tenant: it has users, **cases**, **archived cases** and **playlists**. Platform administrators curate shared **recommended** question sets keyed by charge. Design: `../specs/001-accounts.md`.

## Commands

```bash
npm run dev                  # nodemon main.js
npm start                    # node main.js
npm run test:unit            # vitest run test/unit (services, policies)
npm run test:http            # vitest run test/http (Supertest against src/app.js)
npx vitest run test/unit/caseService.test.js      # single file
npx vitest run test/unit -t "normalizes"           # single test by name
npm run admin:grant -- someone@example.com [--revoke] | --list   # PLATFORM admin
npm run reset:accounts -- --confirm                # one-off: drops users/cases/playlists (keeps recommended)
```

`npm test` is a placeholder that exits 1 — use `test:unit` / `test:http`. There is no linter or build step. `migrate:case-category` predates accounts and is obsolete after the reset.

Required `.env`: `PORT`, `NODE_ENV`, `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRATION`. **`MONGODB_URI` must be a replica set** (Atlas is): archiving, registration and the last-admin guard use transactions, which a standalone `mongod` rejects.

## Architecture

- **Entry:** `main.js` (loads env, connects DB via `db.js`, starts `server.js`) → `src/app.js` (cors → helmet → rate limiter → JSON body → routes → error handler). CORS is deliberately first so 429 responses still carry CORS headers.
- **Routing:** everything is mounted under `/api` (`src/routes/index.js`); `/auth` is also mounted at the root for backward compatibility.
- **Layering:** routes → controllers → services → models. Services take an `auth` context (not `req`), hold the validation/business logic, and throw `createAppError(message, statusCode, code?)` (`src/utils/error.js`); `errorHandler` turns that into `{ status, message, code? }`. `code` is only ever a string set by the API (e.g. `PASSWORD_CHANGE_REQUIRED`) — numeric driver codes like 11000 are never sent.
- **Express 5 async errors:** rejected promises in handlers/middleware are forwarded to the error handler automatically (e.g. `authHandler` just `throw`s).

### Accounts, auth and access

- **`authenticate`** verifies the Bearer JWT, then reloads the user **and their account** on every request: disabled user → 401, suspended account → 403, `mustChangePassword` → 403 `PASSWORD_CHANGE_REQUIRED` (except on `authenticate.allowPendingPasswordChange`, used only by `POST /auth/change-password`). It sets `req.auth = { userId, accountId, role, isPlatformAdmin }`, plus `req.user`/`req.userId`. The JWT carries only `{ id, isAdmin }`; account and role are never trusted from it.
- **Two kinds of admin — never conflate them.** `User.role === 'admin'` is the **account admin** (manages the account's users, creates cases, sets owners; gated by `requireAccountAdmin` + `assertAccountAdmin`). `User.isAdmin` is the **platform admin** (writes Recommended sets; gated by `requireAdmin`; granted only by `scripts/grantAdmin.js`). Neither implies the other.
- **`src/policies/accountScope.js` is the only place access filters are built.** Every case/archive/playlist query spreads `caseScopeFilter(auth)` / `archivedCaseScopeFilter(auth)` / `playlistScopeFilter(auth)` — admins see the whole account, members only cases where they are in `owners`. Out-of-scope records are **404**, never 403, so their existence isn't revealed. Don't hand-write `{ account: … }` filters in services.
- **Users** belong to exactly one account and are disabled, never deleted. Account admins create them with a temporary password (`mustChangePassword: true`). An account must keep one active admin: `updateAccountUser` checks this in a transaction that also writes the account document, so two admins demoting each other concurrently conflict instead of both committing (covered by a race test).
- **Cases:** only account admins create them; `account`/`createdBy` are immutable, `owners[]` changes only via `PUT /cases/:id/owners`. `updateCase`'s `allowedFields` whitelist is what keeps those fields out of regular updates.
- **Archiving** (`archiveService`): allowed for an admin or owner once `isCaseComplete` (`src/policies/caseCompletion.js`: every question has ≥1 entry in `case.answers[q.id]`). Inserts an `ArchivedCase` snapshot and deletes the live case in one transaction; `originalCaseId` is unique so a case archives once. `ArchivedCase` reuses `caseFields` from `Case.js` and marks every field immutable on the definitions (Mongoose ignores `immutable()` applied after schema construction). `archiveReason: 'purchase'` is reserved for the future automatic archive.
- **Playlists** belong to the account: everyone in it reads them, the creator or an account admin edits/deletes (403 otherwise), titles are unique per account.
- **Recommended sets** are global: any authenticated user reads, only platform admins write. `createdBy` can populate to `null` (author deleted by the reset).
- **Shared question shape:** `QuestionSchema` is defined in `src/models/Case.js` and reused by `Playlist` and `Recommended`. Question types live in `src/types.js`.

### Case categories and charges

- `src/caseCategories.js` is the catalog. A case stores a single `category` id of the form `<area-slug>.<matter-slug>` (e.g. `criminal.assault`), replacing the old `caseType` + `charge` pair.
- **This file is byte-mirrored with the frontend repo.** Keep it dependency-free, copy changes across, and bump `CATALOG_VERSION`. Ids derive from labels, so renaming a label orphans stored cases and requires a migration — treat the catalog as append-mostly.
- `src/charges.js` derives the distinct "matter" values (charges) from the catalog; it exists separately so the mirrored file stays untouched. `Recommended.charge` is unique and constrained to these, and inputs are resolved case-insensitively onto the canonical spelling (`resolveCharge`). `GET /api/recommended/lookup` accepts either `?charge=` or `?category=` and returns `{ recommended: null }` (200) when nothing is curated.

## Tests

Vitest with `test/setup.js`, which starts a single-node `MongoMemoryReplSet` (transactions need a replica set) and sets `JWT_SECRET`/`JWT_EXPIRATION`. Files run one at a time (`fileParallelism: false`). `test/helpers/fixtures.js` provides `initModels()` (create collections + indexes up front — call it in `beforeAll`, transactions can't create collections implicitly), `resetDb()`, `makeAccount({ admins, members, disabled })` with `authFor(user)`, `makeCase()` and `answerAll()`. Unit tests call services with an `auth` context; `test/http/` drives the real app with Supertest.
