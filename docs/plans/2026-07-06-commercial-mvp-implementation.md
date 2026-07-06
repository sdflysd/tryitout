# Commercial MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first commercial beta loop for TryItOut: account login, access-code credits, queue-backed paid simulations, admin operations, analytics, and later BYOK tiers.

**Architecture:** Keep the existing React + Express app, but introduce a commercial service layer backed by Postgres-compatible repositories and a Redis/BullMQ-style simulation queue. The current file-backed simulation task implementation remains useful for local compatibility while the commercial path becomes the source of truth for paid users, credits, queueing, and admin visibility.

**Tech Stack:** React 19, Express, TypeScript, Node test runner with `tsx --test`, Postgres-compatible repository interfaces, Redis/BullMQ queue abstraction, existing AI Gateway and simulation engine.

---

## Phase 1: Commercial Domain Foundation

### Task 1: Add Commercial Domain Types

**Files:**
- Create: `frontend/src/contracts/commercial.ts`
- Test: `frontend/src/contracts/commercial.test.ts`

**Step 1: Write the failing test**

Create `frontend/src/contracts/commercial.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCESS_CODE_STATUSES,
  CREDIT_LEDGER_ENTRY_TYPES,
  SIMULATION_CREDIT_COSTS,
  USER_TIERS,
  getSimulationCreditCost,
  hasCommercialFeature,
} from "./commercial.js";

test("commercial constants expose MVP account and credit states", () => {
  assert.deepEqual(USER_TIERS, ["basic", "pro", "business"]);
  assert.deepEqual(ACCESS_CODE_STATUSES, ["active", "redeemed", "disabled", "expired"]);
  assert.deepEqual(CREDIT_LEDGER_ENTRY_TYPES, [
    "redeem",
    "hold",
    "capture",
    "release",
    "adjustment",
  ]);
});

test("simulation credit costs distinguish platform and BYOK deep mode", () => {
  assert.equal(getSimulationCreditCost({ interactionMode: "legacy", providerMode: "platform" }), 1);
  assert.equal(getSimulationCreditCost({ interactionMode: "enabled", providerMode: "platform" }), 3);
  assert.equal(getSimulationCreditCost({ interactionMode: "legacy", providerMode: "byok" }), 1);
  assert.equal(getSimulationCreditCost({ interactionMode: "enabled", providerMode: "byok" }), 2);
  assert.deepEqual(SIMULATION_CREDIT_COSTS.platform, { legacy: 1, enabled: 3 });
});

test("hasCommercialFeature reads tier feature flags", () => {
  assert.equal(hasCommercialFeature({ tier: "basic", features: [] }, "custom_model_provider"), false);
  assert.equal(hasCommercialFeature({ tier: "pro", features: ["custom_model_provider"] }, "custom_model_provider"), true);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd frontend
npm test -- src/contracts/commercial.test.ts
```

Expected: FAIL because `commercial.ts` does not exist.

**Step 3: Write minimal implementation**

Create `frontend/src/contracts/commercial.ts`:

```ts
import type { InteractionMode } from "../types.js";

export const USER_TIERS = ["basic", "pro", "business"] as const;
export type UserTier = typeof USER_TIERS[number];

export const COMMERCIAL_FEATURES = [
  "deep_mode",
  "custom_model_provider",
  "priority_queue",
] as const;
export type CommercialFeature = typeof COMMERCIAL_FEATURES[number];

export const ACCESS_CODE_STATUSES = [
  "active",
  "redeemed",
  "disabled",
  "expired",
] as const;
export type AccessCodeStatus = typeof ACCESS_CODE_STATUSES[number];

export const CREDIT_LEDGER_ENTRY_TYPES = [
  "redeem",
  "hold",
  "capture",
  "release",
  "adjustment",
] as const;
export type CreditLedgerEntryType = typeof CREDIT_LEDGER_ENTRY_TYPES[number];

export type CommercialProviderMode = "platform" | "byok";

export const SIMULATION_CREDIT_COSTS = {
  platform: {
    legacy: 1,
    enabled: 3,
  },
  byok: {
    legacy: 1,
    enabled: 2,
  },
} as const;

export interface CommercialEntitlements {
  tier: UserTier;
  tierExpiresAt?: string;
  features: CommercialFeature[];
}

export function hasCommercialFeature(
  entitlements: CommercialEntitlements,
  feature: CommercialFeature,
): boolean {
  return entitlements.features.includes(feature);
}

export function getSimulationCreditCost({
  interactionMode,
  providerMode,
}: {
  interactionMode: InteractionMode;
  providerMode: CommercialProviderMode;
}): number {
  return SIMULATION_CREDIT_COSTS[providerMode][interactionMode];
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
cd frontend
npm test -- src/contracts/commercial.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/contracts/commercial.ts frontend/src/contracts/commercial.test.ts
git commit -m "feat: add commercial domain contracts"
```

### Task 2: Add Access-Code Generation And Hashing

**Files:**
- Create: `frontend/src/server/commercial/access-codes.ts`
- Test: `frontend/src/server/commercial/access-codes.test.ts`

**Step 1: Write the failing test**

Create `frontend/src/server/commercial/access-codes.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  generateAccessCode,
  hashAccessCode,
  maskAccessCode,
  normalizeAccessCode,
  verifyAccessCode,
} from "./access-codes.js";

test("generateAccessCode creates grouped hard-to-guess codes", () => {
  const code = generateAccessCode(() => "ABCDEFGHJKLM");
  assert.match(code, /^TIO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
});

test("normalizeAccessCode uppercases and removes accidental whitespace", () => {
  assert.equal(normalizeAccessCode(" tio-abcd-1234-wxyz "), "TIO-ABCD-1234-WXYZ");
});

test("hashAccessCode and verifyAccessCode use normalized values", () => {
  const hash = hashAccessCode("tio-abcd-1234-wxyz", "pepper");
  assert.equal(verifyAccessCode("TIO-ABCD-1234-WXYZ", hash, "pepper"), true);
  assert.equal(verifyAccessCode("TIO-XXXX-1234-WXYZ", hash, "pepper"), false);
});

test("maskAccessCode preserves only prefix and suffix", () => {
  assert.equal(maskAccessCode("TIO-ABCD-1234-WXYZ"), "TIO-ABCD-****-WXYZ");
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd frontend
npm test -- src/server/commercial/access-codes.test.ts
```

Expected: FAIL because `access-codes.ts` does not exist.

**Step 3: Write minimal implementation**

Create `frontend/src/server/commercial/access-codes.ts`:

```ts
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeAccessCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export function generateAccessCode(randomSource?: () => string): string {
  const raw = randomSource?.() ?? randomToken(12);
  const normalized = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .padEnd(12, "X")
    .slice(0, 12);

  return `TIO-${normalized.slice(0, 4)}-${normalized.slice(4, 8)}-${normalized.slice(8, 12)}`;
}

export function hashAccessCode(code: string, pepper: string): string {
  return createHash("sha256")
    .update(`${normalizeAccessCode(code)}:${pepper}`)
    .digest("hex");
}

export function verifyAccessCode(code: string, expectedHash: string, pepper: string): boolean {
  const actual = Buffer.from(hashAccessCode(code, pepper), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function maskAccessCode(code: string): string {
  const normalized = normalizeAccessCode(code);
  const parts = normalized.split("-");
  if (parts.length === 4) {
    return `${parts[0]}-${parts[1]}-****-${parts[3]}`;
  }

  return `${normalized.slice(0, 8)}****${normalized.slice(-4)}`;
}

function randomToken(length: number): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
cd frontend
npm test -- src/server/commercial/access-codes.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/access-codes.ts frontend/src/server/commercial/access-codes.test.ts
git commit -m "feat: add access code utilities"
```

### Task 3: Add Password Hashing Utilities

**Files:**
- Create: `frontend/src/server/commercial/passwords.ts`
- Test: `frontend/src/server/commercial/passwords.test.ts`

**Step 1: Write the failing test**

Create `frontend/src/server/commercial/passwords.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { hashPassword, verifyPassword } from "./passwords.js";

test("hashPassword stores salted non-plaintext password hashes", async () => {
  const hash = await hashPassword("correct horse battery staple", {
    salt: Buffer.alloc(16, 1),
  });

  assert.notEqual(hash, "correct horse battery staple");
  assert.match(hash, /^scrypt\$/);
  assert.equal(await verifyPassword("correct horse battery staple", hash), true);
  assert.equal(await verifyPassword("wrong password", hash), false);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd frontend
npm test -- src/server/commercial/passwords.test.ts
```

Expected: FAIL because `passwords.ts` does not exist.

**Step 3: Write minimal implementation**

Create `frontend/src/server/commercial/passwords.ts`:

```ts
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export async function hashPassword(
  password: string,
  options: { salt?: Buffer } = {},
): Promise<string> {
  const salt = options.salt ?? randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH) as Buffer;

  return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const [algorithm, saltValue, hashValue] = encodedHash.split("$");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) {
    return false;
  }

  const salt = Buffer.from(saltValue, "base64");
  const expected = Buffer.from(hashValue, "base64");
  const actual = await scrypt(password, salt, expected.length) as Buffer;

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
cd frontend
npm test -- src/server/commercial/passwords.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/passwords.ts frontend/src/server/commercial/passwords.test.ts
git commit -m "feat: add password hashing utilities"
```

## Phase 2: Commercial Repositories And Services

### Task 4: Define Commercial Repository Interfaces And In-Memory Test Repository

**Files:**
- Create: `frontend/src/server/commercial/types.ts`
- Create: `frontend/src/server/commercial/repository.ts`
- Test: `frontend/src/server/commercial/repository.test.ts`

**Step 1: Write the failing test**

Create `frontend/src/server/commercial/repository.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryCommercialRepository } from "./repository.js";

test("InMemoryCommercialRepository stores users and ledger entries", async () => {
  const repo = new InMemoryCommercialRepository();
  await repo.saveUser({
    id: "user_1",
    email: "a@example.com",
    passwordHash: "hash",
    tier: "basic",
    features: [],
    status: "active",
    createdAt: "2026-07-06T00:00:00.000Z",
    updatedAt: "2026-07-06T00:00:00.000Z",
  });
  await repo.saveCreditAccount({ userId: "user_1", balance: 0, updatedAt: "2026-07-06T00:00:00.000Z" });
  await repo.appendLedgerEntry({
    id: "ledger_1",
    userId: "user_1",
    type: "redeem",
    amount: 10,
    balanceAfter: 10,
    createdAt: "2026-07-06T00:00:00.000Z",
  });

  assert.equal((await repo.findUserByEmail("A@EXAMPLE.COM"))?.id, "user_1");
  assert.equal((await repo.getCreditAccount("user_1"))?.balance, 0);
  assert.equal((await repo.listLedgerEntries("user_1")).length, 1);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd frontend
npm test -- src/server/commercial/repository.test.ts
```

Expected: FAIL because repository files do not exist.

**Step 3: Write minimal implementation**

Create `frontend/src/server/commercial/types.ts` with record interfaces for:

```ts
import type {
  AccessCodeStatus,
  CommercialFeature,
  CreditLedgerEntryType,
  UserTier,
} from "../../contracts/commercial.js";
import type { InteractionMode, SimulationType, UserInput } from "../../types.js";

export type UserStatus = "active" | "disabled";
export type CommercialTaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "refunded";

export interface CommercialUserRecord {
  id: string;
  email: string;
  passwordHash: string;
  tier: UserTier;
  tierExpiresAt?: string;
  features: CommercialFeature[];
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface UserCreditAccountRecord {
  userId: string;
  balance: number;
  updatedAt: string;
}

export interface CreditLedgerEntryRecord {
  id: string;
  userId: string;
  type: CreditLedgerEntryType;
  amount: number;
  balanceAfter: number;
  taskId?: string;
  accessCodeId?: string;
  reason?: string;
  createdAt: string;
}

export interface AccessCodeRecord {
  id: string;
  codeHash: string;
  maskedCode: string;
  status: AccessCodeStatus;
  credits: number;
  tierGrant?: UserTier;
  tierExpiresAt?: string;
  features: CommercialFeature[];
  source?: string;
  redeemedByUserId?: string;
  redeemedAt?: string;
  expiresAt?: string;
  createdByAdminId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommercialSimulationTaskRecord {
  id: string;
  userId: string;
  scenarioType: SimulationType;
  userInput: UserInput;
  interactionMode: InteractionMode;
  providerMode: "platform" | "byok";
  status: CommercialTaskStatus;
  creditCost: number;
  heldLedgerEntryId?: string;
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
}
```

Create `frontend/src/server/commercial/repository.ts`:

```ts
import type {
  AccessCodeRecord,
  CommercialSimulationTaskRecord,
  CommercialUserRecord,
  CreditLedgerEntryRecord,
  UserCreditAccountRecord,
} from "./types.js";

export interface CommercialRepository {
  saveUser(user: CommercialUserRecord): Promise<void>;
  findUserByEmail(email: string): Promise<CommercialUserRecord | undefined>;
  getUser(userId: string): Promise<CommercialUserRecord | undefined>;
  saveCreditAccount(account: UserCreditAccountRecord): Promise<void>;
  getCreditAccount(userId: string): Promise<UserCreditAccountRecord | undefined>;
  appendLedgerEntry(entry: CreditLedgerEntryRecord): Promise<void>;
  listLedgerEntries(userId: string): Promise<CreditLedgerEntryRecord[]>;
  saveAccessCode(code: AccessCodeRecord): Promise<void>;
  findAccessCodeByHash(codeHash: string): Promise<AccessCodeRecord | undefined>;
  saveCommercialTask(task: CommercialSimulationTaskRecord): Promise<void>;
  getCommercialTask(taskId: string): Promise<CommercialSimulationTaskRecord | undefined>;
}

export class InMemoryCommercialRepository implements CommercialRepository {
  private readonly users = new Map<string, CommercialUserRecord>();
  private readonly accounts = new Map<string, UserCreditAccountRecord>();
  private readonly ledger: CreditLedgerEntryRecord[] = [];
  private readonly accessCodes = new Map<string, AccessCodeRecord>();
  private readonly tasks = new Map<string, CommercialSimulationTaskRecord>();

  async saveUser(user: CommercialUserRecord): Promise<void> {
    this.users.set(user.id, user);
  }

  async findUserByEmail(email: string): Promise<CommercialUserRecord | undefined> {
    const normalized = email.trim().toLowerCase();
    return Array.from(this.users.values()).find((user) => user.email.toLowerCase() === normalized);
  }

  async getUser(userId: string): Promise<CommercialUserRecord | undefined> {
    return this.users.get(userId);
  }

  async saveCreditAccount(account: UserCreditAccountRecord): Promise<void> {
    this.accounts.set(account.userId, account);
  }

  async getCreditAccount(userId: string): Promise<UserCreditAccountRecord | undefined> {
    return this.accounts.get(userId);
  }

  async appendLedgerEntry(entry: CreditLedgerEntryRecord): Promise<void> {
    this.ledger.push(entry);
  }

  async listLedgerEntries(userId: string): Promise<CreditLedgerEntryRecord[]> {
    return this.ledger.filter((entry) => entry.userId === userId);
  }

  async saveAccessCode(code: AccessCodeRecord): Promise<void> {
    this.accessCodes.set(code.id, code);
  }

  async findAccessCodeByHash(codeHash: string): Promise<AccessCodeRecord | undefined> {
    return Array.from(this.accessCodes.values()).find((code) => code.codeHash === codeHash);
  }

  async saveCommercialTask(task: CommercialSimulationTaskRecord): Promise<void> {
    this.tasks.set(task.id, task);
  }

  async getCommercialTask(taskId: string): Promise<CommercialSimulationTaskRecord | undefined> {
    return this.tasks.get(taskId);
  }
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
cd frontend
npm test -- src/server/commercial/repository.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/types.ts frontend/src/server/commercial/repository.ts frontend/src/server/commercial/repository.test.ts
git commit -m "feat: add commercial repository interfaces"
```

### Task 5: Implement Auth Service

**Files:**
- Create: `frontend/src/server/commercial/auth-service.ts`
- Test: `frontend/src/server/commercial/auth-service.test.ts`

**Step 1: Write the failing test**

Create `frontend/src/server/commercial/auth-service.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryCommercialRepository } from "./repository.js";
import { CommercialAuthService } from "./auth-service.js";

test("CommercialAuthService registers and authenticates users", async () => {
  const service = new CommercialAuthService({
    repo: new InMemoryCommercialRepository(),
    createId: () => "user_1",
    now: () => "2026-07-06T00:00:00.000Z",
  });

  const registered = await service.register({ email: "A@Example.com", password: "password123" });
  assert.equal(registered.email, "a@example.com");
  assert.equal(registered.tier, "basic");

  const login = await service.login({ email: "a@example.com", password: "password123" });
  assert.equal(login.user.id, "user_1");
  assert.equal(login.creditBalance, 0);
});

test("CommercialAuthService rejects duplicate email and wrong password", async () => {
  const service = new CommercialAuthService({
    repo: new InMemoryCommercialRepository(),
    createId: () => "user_1",
    now: () => "2026-07-06T00:00:00.000Z",
  });

  await service.register({ email: "a@example.com", password: "password123" });
  await assert.rejects(() => service.register({ email: "A@EXAMPLE.COM", password: "password123" }), /already registered/);
  await assert.rejects(() => service.login({ email: "a@example.com", password: "wrong" }), /invalid credentials/);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd frontend
npm test -- src/server/commercial/auth-service.test.ts
```

Expected: FAIL because `auth-service.ts` does not exist.

**Step 3: Write minimal implementation**

Create `frontend/src/server/commercial/auth-service.ts`:

```ts
import { hashPassword, verifyPassword } from "./passwords.js";
import type { CommercialRepository } from "./repository.js";
import type { CommercialUserRecord } from "./types.js";

interface AuthServiceOptions {
  repo: CommercialRepository;
  createId?: () => string;
  now?: () => string;
}

export class CommercialAuthService {
  private readonly repo: CommercialRepository;
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(options: AuthServiceOptions) {
    this.repo = options.repo;
    this.createId = options.createId ?? (() => `user_${Math.random().toString(36).slice(2, 11)}`);
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async register({ email, password }: { email: string; password: string }): Promise<CommercialUserRecord> {
    const normalizedEmail = normalizeEmail(email);
    if (password.length < 8) {
      throw new Error("password must be at least 8 characters");
    }
    if (await this.repo.findUserByEmail(normalizedEmail)) {
      throw new Error("email already registered");
    }

    const now = this.now();
    const user: CommercialUserRecord = {
      id: this.createId(),
      email: normalizedEmail,
      passwordHash: await hashPassword(password),
      tier: "basic",
      features: [],
      status: "active",
      createdAt: now,
      updatedAt: now,
    };

    await this.repo.saveUser(user);
    await this.repo.saveCreditAccount({ userId: user.id, balance: 0, updatedAt: now });
    return user;
  }

  async login({ email, password }: { email: string; password: string }): Promise<{ user: CommercialUserRecord; creditBalance: number }> {
    const user = await this.repo.findUserByEmail(normalizeEmail(email));
    if (!user || user.status !== "active") {
      throw new Error("invalid credentials");
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      throw new Error("invalid credentials");
    }

    return {
      user,
      creditBalance: (await this.repo.getCreditAccount(user.id))?.balance ?? 0,
    };
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
cd frontend
npm test -- src/server/commercial/auth-service.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/auth-service.ts frontend/src/server/commercial/auth-service.test.ts
git commit -m "feat: add commercial auth service"
```

### Task 6: Implement Credit And Access-Code Redemption Service

**Files:**
- Create: `frontend/src/server/commercial/credit-service.ts`
- Test: `frontend/src/server/commercial/credit-service.test.ts`

**Step 1: Write the failing test**

Create `frontend/src/server/commercial/credit-service.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { hashAccessCode, maskAccessCode } from "./access-codes.js";
import { CreditService } from "./credit-service.js";
import { InMemoryCommercialRepository } from "./repository.js";

test("CreditService redeems an access code into balance and tier features", async () => {
  const repo = new InMemoryCommercialRepository();
  const now = "2026-07-06T00:00:00.000Z";
  await repo.saveUser({
    id: "user_1",
    email: "a@example.com",
    passwordHash: "hash",
    tier: "basic",
    features: [],
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await repo.saveCreditAccount({ userId: "user_1", balance: 0, updatedAt: now });
  await repo.saveAccessCode({
    id: "code_1",
    codeHash: hashAccessCode("TIO-ABCD-1234-WXYZ", "pepper"),
    maskedCode: maskAccessCode("TIO-ABCD-1234-WXYZ"),
    status: "active",
    credits: 10,
    tierGrant: "pro",
    features: ["custom_model_provider"],
    createdByAdminId: "admin_1",
    createdAt: now,
    updatedAt: now,
  });

  const service = new CreditService({
    repo,
    codePepper: "pepper",
    createId: (prefix) => `${prefix}_1`,
    now: () => now,
  });

  const result = await service.redeemAccessCode({
    userId: "user_1",
    code: "tio-abcd-1234-wxyz",
  });

  assert.equal(result.balance, 10);
  assert.equal(result.user.tier, "pro");
  assert.deepEqual(result.user.features, ["custom_model_provider"]);
  assert.equal((await repo.listLedgerEntries("user_1")).length, 1);
});

test("CreditService rejects redeemed codes", async () => {
  const repo = new InMemoryCommercialRepository();
  const now = "2026-07-06T00:00:00.000Z";
  await repo.saveUser({
    id: "user_1",
    email: "a@example.com",
    passwordHash: "hash",
    tier: "basic",
    features: [],
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await repo.saveCreditAccount({ userId: "user_1", balance: 0, updatedAt: now });
  await repo.saveAccessCode({
    id: "code_1",
    codeHash: hashAccessCode("TIO-ABCD-1234-WXYZ", "pepper"),
    maskedCode: maskAccessCode("TIO-ABCD-1234-WXYZ"),
    status: "redeemed",
    credits: 10,
    features: [],
    createdByAdminId: "admin_1",
    createdAt: now,
    updatedAt: now,
  });

  const service = new CreditService({ repo, codePepper: "pepper" });
  await assert.rejects(() => service.redeemAccessCode({ userId: "user_1", code: "TIO-ABCD-1234-WXYZ" }), /not available/);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd frontend
npm test -- src/server/commercial/credit-service.test.ts
```

Expected: FAIL because `credit-service.ts` does not exist.

**Step 3: Write minimal implementation**

Create `frontend/src/server/commercial/credit-service.ts`:

```ts
import { hashAccessCode } from "./access-codes.js";
import type { CommercialRepository } from "./repository.js";
import type { CommercialUserRecord } from "./types.js";

interface CreditServiceOptions {
  repo: CommercialRepository;
  codePepper: string;
  createId?: (prefix: string) => string;
  now?: () => string;
}

export class CreditService {
  private readonly repo: CommercialRepository;
  private readonly codePepper: string;
  private readonly createId: (prefix: string) => string;
  private readonly now: () => string;

  constructor(options: CreditServiceOptions) {
    this.repo = options.repo;
    this.codePepper = options.codePepper;
    this.createId = options.createId ?? ((prefix) => `${prefix}_${Math.random().toString(36).slice(2, 11)}`);
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async redeemAccessCode({
    userId,
    code,
  }: {
    userId: string;
    code: string;
  }): Promise<{ user: CommercialUserRecord; balance: number }> {
    const user = await this.repo.getUser(userId);
    if (!user) {
      throw new Error("user not found");
    }
    const accessCode = await this.repo.findAccessCodeByHash(hashAccessCode(code, this.codePepper));
    if (!accessCode || accessCode.status !== "active") {
      throw new Error("access code is not available");
    }

    const now = this.now();
    const currentBalance = (await this.repo.getCreditAccount(userId))?.balance ?? 0;
    const balanceAfter = currentBalance + accessCode.credits;
    const updatedFeatures = Array.from(new Set([...user.features, ...accessCode.features]));
    const updatedUser: CommercialUserRecord = {
      ...user,
      tier: accessCode.tierGrant ?? user.tier,
      tierExpiresAt: accessCode.tierExpiresAt ?? user.tierExpiresAt,
      features: updatedFeatures,
      updatedAt: now,
    };

    await this.repo.saveUser(updatedUser);
    await this.repo.saveCreditAccount({ userId, balance: balanceAfter, updatedAt: now });
    await this.repo.appendLedgerEntry({
      id: this.createId("ledger"),
      userId,
      type: "redeem",
      amount: accessCode.credits,
      balanceAfter,
      accessCodeId: accessCode.id,
      createdAt: now,
    });
    await this.repo.saveAccessCode({
      ...accessCode,
      status: "redeemed",
      redeemedByUserId: userId,
      redeemedAt: now,
      updatedAt: now,
    });

    return { user: updatedUser, balance: balanceAfter };
  }
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
cd frontend
npm test -- src/server/commercial/credit-service.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/credit-service.ts frontend/src/server/commercial/credit-service.test.ts
git commit -m "feat: add access code redemption service"
```

### Task 7: Implement Credit Holds, Capture, And Release

**Files:**
- Modify: `frontend/src/server/commercial/credit-service.ts`
- Test: `frontend/src/server/commercial/credit-service.test.ts`

**Step 1: Write the failing test**

Append tests:

```ts
test("CreditService holds, captures, and releases credits", async () => {
  const repo = new InMemoryCommercialRepository();
  const now = "2026-07-06T00:00:00.000Z";
  await repo.saveUser({
    id: "user_1",
    email: "a@example.com",
    passwordHash: "hash",
    tier: "basic",
    features: [],
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await repo.saveCreditAccount({ userId: "user_1", balance: 5, updatedAt: now });
  const service = new CreditService({
    repo,
    codePepper: "pepper",
    createId: (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`,
    now: () => now,
  });

  const hold = await service.holdCredits({ userId: "user_1", amount: 3, taskId: "task_1" });
  assert.equal(hold.balance, 2);
  await service.captureHeldCredits({ userId: "user_1", amount: 3, taskId: "task_1" });
  assert.equal((await repo.getCreditAccount("user_1"))?.balance, 2);

  const secondHold = await service.holdCredits({ userId: "user_1", amount: 1, taskId: "task_2" });
  assert.equal(secondHold.balance, 1);
  await service.releaseHeldCredits({ userId: "user_1", amount: 1, taskId: "task_2", reason: "failed" });
  assert.equal((await repo.getCreditAccount("user_1"))?.balance, 2);
});

test("CreditService rejects holds with insufficient balance", async () => {
  const repo = new InMemoryCommercialRepository();
  const now = "2026-07-06T00:00:00.000Z";
  await repo.saveCreditAccount({ userId: "user_1", balance: 1, updatedAt: now });
  const service = new CreditService({ repo, codePepper: "pepper", now: () => now });

  await assert.rejects(() => service.holdCredits({ userId: "user_1", amount: 2, taskId: "task_1" }), /insufficient credits/);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd frontend
npm test -- src/server/commercial/credit-service.test.ts
```

Expected: FAIL because hold/capture/release methods are missing.

**Step 3: Write minimal implementation**

Add methods to `CreditService`:

```ts
  async holdCredits({ userId, amount, taskId }: { userId: string; amount: number; taskId: string }): Promise<{ balance: number; ledgerEntryId: string }> {
    const account = await this.repo.getCreditAccount(userId);
    const balance = account?.balance ?? 0;
    if (amount <= 0) {
      throw new Error("credit amount must be positive");
    }
    if (balance < amount) {
      throw new Error("insufficient credits");
    }

    const now = this.now();
    const balanceAfter = balance - amount;
    const ledgerEntryId = this.createId("ledger");
    await this.repo.saveCreditAccount({ userId, balance: balanceAfter, updatedAt: now });
    await this.repo.appendLedgerEntry({
      id: ledgerEntryId,
      userId,
      type: "hold",
      amount: -amount,
      balanceAfter,
      taskId,
      createdAt: now,
    });

    return { balance: balanceAfter, ledgerEntryId };
  }

  async captureHeldCredits({ userId, amount, taskId }: { userId: string; amount: number; taskId: string }): Promise<void> {
    const account = await this.repo.getCreditAccount(userId);
    await this.repo.appendLedgerEntry({
      id: this.createId("ledger"),
      userId,
      type: "capture",
      amount: 0,
      balanceAfter: account?.balance ?? 0,
      taskId,
      createdAt: this.now(),
    });
  }

  async releaseHeldCredits({ userId, amount, taskId, reason }: { userId: string; amount: number; taskId: string; reason?: string }): Promise<{ balance: number }> {
    const account = await this.repo.getCreditAccount(userId);
    const balanceAfter = (account?.balance ?? 0) + amount;
    const now = this.now();
    await this.repo.saveCreditAccount({ userId, balance: balanceAfter, updatedAt: now });
    await this.repo.appendLedgerEntry({
      id: this.createId("ledger"),
      userId,
      type: "release",
      amount,
      balanceAfter,
      taskId,
      reason,
      createdAt: now,
    });

    return { balance: balanceAfter };
  }
```

**Step 4: Run test to verify it passes**

Run:

```bash
cd frontend
npm test -- src/server/commercial/credit-service.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/credit-service.ts frontend/src/server/commercial/credit-service.test.ts
git commit -m "feat: add credit hold lifecycle"
```

## Phase 3: Queue-Backed Commercial Simulation Tasks

### Task 8: Define Simulation Queue Interface And In-Memory Queue

**Files:**
- Create: `frontend/src/server/commercial/simulation-queue.ts`
- Test: `frontend/src/server/commercial/simulation-queue.test.ts`

**Step 1: Write the failing test**

Create `frontend/src/server/commercial/simulation-queue.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { InMemorySimulationQueue, getTaskConcurrencyWeight } from "./simulation-queue.js";

test("getTaskConcurrencyWeight weights deep tasks higher", () => {
  assert.equal(getTaskConcurrencyWeight("legacy"), 1);
  assert.equal(getTaskConcurrencyWeight("enabled"), 3);
});

test("InMemorySimulationQueue stores queued jobs", async () => {
  const queue = new InMemorySimulationQueue();
  await queue.enqueue({ taskId: "task_1", userId: "user_1", interactionMode: "enabled", weight: 3 });

  assert.deepEqual(await queue.listQueuedJobs(), [
    { taskId: "task_1", userId: "user_1", interactionMode: "enabled", weight: 3 },
  ]);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd frontend
npm test -- src/server/commercial/simulation-queue.test.ts
```

Expected: FAIL because `simulation-queue.ts` does not exist.

**Step 3: Write minimal implementation**

Create `frontend/src/server/commercial/simulation-queue.ts`:

```ts
import type { InteractionMode } from "../../types.js";

export interface SimulationQueueJob {
  taskId: string;
  userId: string;
  interactionMode: InteractionMode;
  weight: number;
}

export interface SimulationQueue {
  enqueue(job: SimulationQueueJob): Promise<void>;
}

export function getTaskConcurrencyWeight(mode: InteractionMode): number {
  return mode === "enabled" ? 3 : 1;
}

export class InMemorySimulationQueue implements SimulationQueue {
  private readonly jobs: SimulationQueueJob[] = [];

  async enqueue(job: SimulationQueueJob): Promise<void> {
    this.jobs.push(job);
  }

  async listQueuedJobs(): Promise<SimulationQueueJob[]> {
    return [...this.jobs];
  }
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
cd frontend
npm test -- src/server/commercial/simulation-queue.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/simulation-queue.ts frontend/src/server/commercial/simulation-queue.test.ts
git commit -m "feat: add commercial simulation queue interface"
```

### Task 9: Implement Commercial Simulation Task Service

**Files:**
- Create: `frontend/src/server/commercial/commercial-task-service.ts`
- Test: `frontend/src/server/commercial/commercial-task-service.test.ts`

**Step 1: Write the failing test**

Create `frontend/src/server/commercial/commercial-task-service.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { CreditService } from "./credit-service.js";
import { CommercialSimulationTaskService } from "./commercial-task-service.js";
import { InMemoryCommercialRepository } from "./repository.js";
import { InMemorySimulationQueue } from "./simulation-queue.js";

test("CommercialSimulationTaskService holds credits and queues a task", async () => {
  const repo = new InMemoryCommercialRepository();
  const queue = new InMemorySimulationQueue();
  const now = "2026-07-06T00:00:00.000Z";
  await repo.saveUser({
    id: "user_1",
    email: "a@example.com",
    passwordHash: "hash",
    tier: "basic",
    features: [],
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await repo.saveCreditAccount({ userId: "user_1", balance: 5, updatedAt: now });

  const service = new CommercialSimulationTaskService({
    repo,
    queue,
    creditService: new CreditService({ repo, codePepper: "pepper", createId: (prefix) => `${prefix}_1`, now: () => now }),
    createId: () => "task_1",
    now: () => now,
  });

  const task = await service.createTask({
    userId: "user_1",
    userInput: { type: "side_hustle", projectIdea: "AI 简历优化服务" },
    interactionMode: "enabled",
    providerMode: "platform",
  });

  assert.equal(task.status, "queued");
  assert.equal(task.creditCost, 3);
  assert.equal((await repo.getCreditAccount("user_1"))?.balance, 2);
  assert.equal((await queue.listQueuedJobs())[0]?.weight, 3);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd frontend
npm test -- src/server/commercial/commercial-task-service.test.ts
```

Expected: FAIL because service does not exist.

**Step 3: Write minimal implementation**

Create `frontend/src/server/commercial/commercial-task-service.ts`:

```ts
import { getSimulationCreditCost, type CommercialProviderMode } from "../../contracts/commercial.js";
import type { InteractionMode, UserInput } from "../../types.js";
import type { CreditService } from "./credit-service.js";
import type { CommercialRepository } from "./repository.js";
import { getTaskConcurrencyWeight, type SimulationQueue } from "./simulation-queue.js";
import type { CommercialSimulationTaskRecord } from "./types.js";

interface CommercialTaskServiceOptions {
  repo: CommercialRepository;
  queue: SimulationQueue;
  creditService: CreditService;
  createId?: () => string;
  now?: () => string;
}

export class CommercialSimulationTaskService {
  private readonly repo: CommercialRepository;
  private readonly queue: SimulationQueue;
  private readonly creditService: CreditService;
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(options: CommercialTaskServiceOptions) {
    this.repo = options.repo;
    this.queue = options.queue;
    this.creditService = options.creditService;
    this.createId = options.createId ?? (() => `task_${Math.random().toString(36).slice(2, 11)}`);
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async createTask({
    userId,
    userInput,
    interactionMode,
    providerMode,
  }: {
    userId: string;
    userInput: UserInput;
    interactionMode: InteractionMode;
    providerMode: CommercialProviderMode;
  }): Promise<CommercialSimulationTaskRecord> {
    const user = await this.repo.getUser(userId);
    if (!user || user.status !== "active") {
      throw new Error("user is not active");
    }
    const taskId = this.createId();
    const creditCost = getSimulationCreditCost({ interactionMode, providerMode });
    const hold = await this.creditService.holdCredits({ userId, amount: creditCost, taskId });
    const now = this.now();
    const task: CommercialSimulationTaskRecord = {
      id: taskId,
      userId,
      scenarioType: userInput.type,
      userInput,
      interactionMode,
      providerMode,
      status: "queued",
      creditCost,
      heldLedgerEntryId: hold.ledgerEntryId,
      createdAt: now,
      updatedAt: now,
    };

    await this.repo.saveCommercialTask(task);
    await this.queue.enqueue({
      taskId,
      userId,
      interactionMode,
      weight: getTaskConcurrencyWeight(interactionMode),
    });
    return task;
  }
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
cd frontend
npm test -- src/server/commercial/commercial-task-service.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/commercial-task-service.ts frontend/src/server/commercial/commercial-task-service.test.ts
git commit -m "feat: add commercial simulation task service"
```

### Task 10: Add Worker Completion And Failure Credit Policies

**Files:**
- Modify: `frontend/src/server/commercial/commercial-task-service.ts`
- Test: `frontend/src/server/commercial/commercial-task-service.test.ts`

**Step 1: Write the failing test**

Append tests:

```ts
test("CommercialSimulationTaskService captures credits on completion", async () => {
  const repo = new InMemoryCommercialRepository();
  const queue = new InMemorySimulationQueue();
  const now = "2026-07-06T00:00:00.000Z";
  await repo.saveUser({
    id: "user_1",
    email: "a@example.com",
    passwordHash: "hash",
    tier: "basic",
    features: [],
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await repo.saveCreditAccount({ userId: "user_1", balance: 5, updatedAt: now });
  const creditService = new CreditService({ repo, codePepper: "pepper", createId: (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`, now: () => now });
  const service = new CommercialSimulationTaskService({ repo, queue, creditService, createId: () => "task_1", now: () => now });
  await service.createTask({
    userId: "user_1",
    userInput: { type: "side_hustle", projectIdea: "AI 简历优化服务" },
    interactionMode: "legacy",
    providerMode: "platform",
  });

  await service.markCompleted("task_1");
  assert.equal((await repo.getCommercialTask("task_1"))?.status, "completed");
  assert.equal((await repo.getCreditAccount("user_1"))?.balance, 4);
});

test("CommercialSimulationTaskService releases credits on failure", async () => {
  const repo = new InMemoryCommercialRepository();
  const queue = new InMemorySimulationQueue();
  const now = "2026-07-06T00:00:00.000Z";
  await repo.saveUser({
    id: "user_1",
    email: "a@example.com",
    passwordHash: "hash",
    tier: "basic",
    features: [],
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await repo.saveCreditAccount({ userId: "user_1", balance: 5, updatedAt: now });
  const creditService = new CreditService({ repo, codePepper: "pepper", createId: (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`, now: () => now });
  const service = new CommercialSimulationTaskService({ repo, queue, creditService, createId: () => "task_1", now: () => now });
  await service.createTask({
    userId: "user_1",
    userInput: { type: "side_hustle", projectIdea: "AI 简历优化服务" },
    interactionMode: "enabled",
    providerMode: "platform",
  });

  await service.markFailed("task_1", "provider_timeout");
  assert.equal((await repo.getCommercialTask("task_1"))?.status, "failed");
  assert.equal((await repo.getCommercialTask("task_1"))?.errorCode, "provider_timeout");
  assert.equal((await repo.getCreditAccount("user_1"))?.balance, 5);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd frontend
npm test -- src/server/commercial/commercial-task-service.test.ts
```

Expected: FAIL because completion/failure methods are missing.

**Step 3: Write minimal implementation**

Add methods to `CommercialSimulationTaskService`:

```ts
  async markCompleted(taskId: string): Promise<CommercialSimulationTaskRecord> {
    const task = await this.requireTask(taskId);
    await this.creditService.captureHeldCredits({
      userId: task.userId,
      amount: task.creditCost,
      taskId,
    });
    const updated = { ...task, status: "completed" as const, updatedAt: this.now() };
    await this.repo.saveCommercialTask(updated);
    return updated;
  }

  async markFailed(taskId: string, errorCode: string): Promise<CommercialSimulationTaskRecord> {
    const task = await this.requireTask(taskId);
    await this.creditService.releaseHeldCredits({
      userId: task.userId,
      amount: task.creditCost,
      taskId,
      reason: errorCode,
    });
    const updated = { ...task, status: "failed" as const, errorCode, updatedAt: this.now() };
    await this.repo.saveCommercialTask(updated);
    return updated;
  }

  private async requireTask(taskId: string): Promise<CommercialSimulationTaskRecord> {
    const task = await this.repo.getCommercialTask(taskId);
    if (!task) {
      throw new Error("commercial simulation task not found");
    }
    return task;
  }
```

**Step 4: Run test to verify it passes**

Run:

```bash
cd frontend
npm test -- src/server/commercial/commercial-task-service.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/commercial-task-service.ts frontend/src/server/commercial/commercial-task-service.test.ts
git commit -m "feat: add commercial task credit settlement"
```

## Phase 4: API Wiring

### Task 11: Add Commercial Auth And Credit API Handlers

**Files:**
- Create: `frontend/src/server/commercial/commercial-api.ts`
- Test: `frontend/src/server/commercial/commercial-api.test.ts`

**Step 1: Write the failing test**

Create tests for register/login/redeem:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { hashAccessCode, maskAccessCode } from "./access-codes.js";
import { CommercialAuthService } from "./auth-service.js";
import { CreditService } from "./credit-service.js";
import {
  handleCommercialLoginRequest,
  handleCommercialRedeemRequest,
  handleCommercialRegisterRequest,
} from "./commercial-api.js";
import { InMemoryCommercialRepository } from "./repository.js";

test("commercial API registers and logs in users", async () => {
  const repo = new InMemoryCommercialRepository();
  const authService = new CommercialAuthService({
    repo,
    createId: () => "user_1",
    now: () => "2026-07-06T00:00:00.000Z",
  });

  const register = await handleCommercialRegisterRequest(
    { email: "a@example.com", password: "password123" },
    { authService },
  );
  assert.equal(register.status, 200);
  assert.equal(register.body.user?.email, "a@example.com");

  const login = await handleCommercialLoginRequest(
    { email: "a@example.com", password: "password123" },
    { authService },
  );
  assert.equal(login.status, 200);
  assert.equal(login.body.creditBalance, 0);
});

test("commercial API redeems access codes", async () => {
  const repo = new InMemoryCommercialRepository();
  const now = "2026-07-06T00:00:00.000Z";
  await repo.saveUser({
    id: "user_1",
    email: "a@example.com",
    passwordHash: "hash",
    tier: "basic",
    features: [],
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await repo.saveCreditAccount({ userId: "user_1", balance: 0, updatedAt: now });
  await repo.saveAccessCode({
    id: "code_1",
    codeHash: hashAccessCode("TIO-ABCD-1234-WXYZ", "pepper"),
    maskedCode: maskAccessCode("TIO-ABCD-1234-WXYZ"),
    status: "active",
    credits: 10,
    features: [],
    createdByAdminId: "admin_1",
    createdAt: now,
    updatedAt: now,
  });
  const creditService = new CreditService({ repo, codePepper: "pepper", now: () => now });

  const result = await handleCommercialRedeemRequest(
    { code: "TIO-ABCD-1234-WXYZ" },
    { userId: "user_1", creditService },
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.balance, 10);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
cd frontend
npm test -- src/server/commercial/commercial-api.test.ts
```

Expected: FAIL because `commercial-api.ts` does not exist.

**Step 3: Write minimal implementation**

Create `frontend/src/server/commercial/commercial-api.ts` with small body parsing helpers and three handlers returning `{ status, body }`.

Implementation requirements:

- `handleCommercialRegisterRequest(body, { authService })`.
- `handleCommercialLoginRequest(body, { authService })`.
- `handleCommercialRedeemRequest(body, { userId, creditService })`.
- Reject missing/invalid email, password, code with status 400.
- Never return `passwordHash`.
- Return user id, email, tier, features, and balance.

**Step 4: Run test to verify it passes**

Run:

```bash
cd frontend
npm test -- src/server/commercial/commercial-api.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/commercial-api.ts frontend/src/server/commercial/commercial-api.test.ts
git commit -m "feat: add commercial auth and credit APIs"
```

### Task 12: Add API Routes To `server.ts`

**Files:**
- Modify: `frontend/server.ts`
- Test: existing handler tests plus lint

**Step 1: Add route design checklist**

Before editing `server.ts`, decide how MVP authentication is represented:

- If sessions are not implemented yet, use a temporary `x-user-id` header helper for authenticated beta API tests.
- Do not expose this temporary helper as final production auth.
- Add a TODO comment only where the production session middleware will replace it.

**Step 2: Implement route wiring**

Modify `frontend/server.ts`:

- Instantiate `InMemoryCommercialRepository` only for local MVP wiring if Postgres implementation is not ready.
- Instantiate `CommercialAuthService`.
- Instantiate `CreditService`.
- Add:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/credits/redeem`
  - `GET /api/credits`
- Return JSON from handler results.

**Step 3: Run targeted tests**

Run:

```bash
cd frontend
npm test -- src/server/commercial/*.test.ts
npm run lint
```

Expected: PASS.

**Step 4: Commit**

```bash
git add frontend/server.ts
git commit -m "feat: wire commercial beta API routes"
```

## Phase 5: Admin MVP

### Task 13: Implement Admin Access-Code Service

**Files:**
- Create: `frontend/src/server/commercial/admin-service.ts`
- Test: `frontend/src/server/commercial/admin-service.test.ts`

**Step 1: Write failing tests**

Test batch generation:

- Creates requested number of access codes.
- Stores only code hash and masked code.
- Returns raw code only in creation response.
- Supports credits, tier grant, features, source, expiration.

**Step 2: Run test to verify it fails**

Run:

```bash
cd frontend
npm test -- src/server/commercial/admin-service.test.ts
```

Expected: FAIL.

**Step 3: Implement service**

Create `CommercialAdminService`:

- `createAccessCode(input)`.
- `createAccessCodeBatch(input)`.
- Use `generateAccessCode`, `hashAccessCode`, and `maskAccessCode`.
- Store `AccessCodeRecord`.
- Return raw code only in creation result.

**Step 4: Run test to verify it passes**

Run:

```bash
cd frontend
npm test -- src/server/commercial/admin-service.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/admin-service.ts frontend/src/server/commercial/admin-service.test.ts
git commit -m "feat: add admin access code generation"
```

### Task 14: Add Admin API Handlers

**Files:**
- Modify: `frontend/src/server/commercial/commercial-api.ts`
- Test: `frontend/src/server/commercial/commercial-api.test.ts`

**Step 1: Write failing tests**

Add tests for:

- `handleAdminCreateAccessCodeRequest`.
- `handleAdminCreateAccessCodeBatchRequest`.
- Rejects non-admin users if `isAdmin` is false.

**Step 2: Run test to verify it fails**

Run:

```bash
cd frontend
npm test -- src/server/commercial/commercial-api.test.ts
```

Expected: FAIL.

**Step 3: Implement handlers**

Add handlers:

- `handleAdminCreateAccessCodeRequest(body, { adminService, isAdmin })`.
- `handleAdminCreateAccessCodeBatchRequest(body, { adminService, isAdmin })`.

**Step 4: Run test to verify it passes**

Run:

```bash
cd frontend
npm test -- src/server/commercial/commercial-api.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/commercial-api.ts frontend/src/server/commercial/commercial-api.test.ts
git commit -m "feat: add admin access code APIs"
```

### Task 15: Add Admin Dashboard UI Skeleton

**Files:**
- Create: `frontend/src/components/admin/AdminDashboard.tsx`
- Create: `frontend/src/components/admin/AdminDashboard.test.tsx`
- Modify: `frontend/src/App.tsx`

**Step 1: Write failing component test**

Use existing React component test patterns from `frontend/src/components/*.test.tsx`.

Test that the dashboard renders sections:

- Overview.
- Users.
- Access Codes.
- Tasks.
- Feedback.
- Settings.

**Step 2: Run test to verify it fails**

Run:

```bash
cd frontend
npm test -- src/components/admin/AdminDashboard.test.tsx
```

Expected: FAIL.

**Step 3: Implement skeleton**

Create an operations-style dashboard, not a marketing page:

- Dense tabs or left navigation.
- Summary metrics row.
- Empty states for tables.
- No nested cards.
- Keep admin route hidden behind `window.location.pathname.startsWith("/admin")` until router is introduced.

**Step 4: Run test and lint**

Run:

```bash
cd frontend
npm test -- src/components/admin/AdminDashboard.test.tsx
npm run lint
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/components/admin/AdminDashboard.tsx frontend/src/components/admin/AdminDashboard.test.tsx frontend/src/App.tsx
git commit -m "feat: add admin dashboard skeleton"
```

## Phase 6: Analytics And Feedback

### Task 16: Move Validation Events To Commercial Analytics Repository

**Files:**
- Create: `frontend/src/server/commercial/analytics-service.ts`
- Test: `frontend/src/server/commercial/analytics-service.test.ts`
- Modify: `frontend/src/server/validation/event-api.ts`

**Step 1: Write failing tests**

Test:

- Stores sanitized event in repository.
- Preserves existing validation event shape.
- Adds `createdAt`.

**Step 2: Run test to verify it fails**

Run:

```bash
cd frontend
npm test -- src/server/commercial/analytics-service.test.ts src/server/validation/event-api.test.ts
```

Expected: FAIL for missing commercial analytics service.

**Step 3: Implement service and adapter**

Keep `appendValidationEvent` for local fallback, but allow `handleValidationEventRequest` to receive `analyticsService`.

**Step 4: Run tests**

Run:

```bash
cd frontend
npm test -- src/server/commercial/analytics-service.test.ts src/server/validation/event-api.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/analytics-service.ts frontend/src/server/commercial/analytics-service.test.ts frontend/src/server/validation/event-api.ts
git commit -m "feat: add commercial analytics event storage"
```

### Task 17: Add Report Feedback API

**Files:**
- Create: `frontend/src/server/commercial/feedback-service.ts`
- Test: `frontend/src/server/commercial/feedback-service.test.ts`
- Modify: `frontend/src/server/commercial/commercial-api.ts`

**Step 1: Write failing tests**

Test:

- Accepts numeric rating, usefulness, text, report id, task id.
- Trims text and caps length.
- Rejects invalid rating.

**Step 2: Run test to verify it fails**

Run:

```bash
cd frontend
npm test -- src/server/commercial/feedback-service.test.ts
```

Expected: FAIL.

**Step 3: Implement feedback service and API handler**

Create:

- `FeedbackService.submitFeedback`.
- `handleReportFeedbackRequest`.

**Step 4: Run tests**

Run:

```bash
cd frontend
npm test -- src/server/commercial/feedback-service.test.ts src/server/commercial/commercial-api.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/feedback-service.ts frontend/src/server/commercial/feedback-service.test.ts frontend/src/server/commercial/commercial-api.ts
git commit -m "feat: add report feedback API"
```

## Phase 7: BYOK Tiers

### Task 18: Add API Key Encryption Utilities

**Files:**
- Create: `frontend/src/server/commercial/secrets.ts`
- Test: `frontend/src/server/commercial/secrets.test.ts`

**Step 1: Write failing tests**

Test:

- Encrypts plaintext API key.
- Decrypts with same master key.
- Does not store plaintext inside ciphertext payload.
- Rejects invalid master key length.

**Step 2: Run test to verify it fails**

Run:

```bash
cd frontend
npm test -- src/server/commercial/secrets.test.ts
```

Expected: FAIL.

**Step 3: Implement AES-GCM encryption**

Use Node `crypto`:

- 32-byte master key from base64 env string.
- Random 12-byte IV.
- AES-256-GCM.
- Store `v1:<iv>:<tag>:<ciphertext>`.

**Step 4: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/secrets.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/secrets.ts frontend/src/server/commercial/secrets.test.ts
git commit -m "feat: add encrypted secret storage utilities"
```

### Task 19: Add User Model Provider Service

**Files:**
- Create: `frontend/src/server/commercial/model-provider-service.ts`
- Test: `frontend/src/server/commercial/model-provider-service.test.ts`
- Modify: `frontend/src/server/commercial/types.ts`
- Modify: `frontend/src/server/commercial/repository.ts`

**Step 1: Write failing tests**

Test:

- Basic users cannot save custom provider.
- Pro users with `custom_model_provider` can save provider.
- API key is encrypted in repository.
- Public DTO masks key and never returns encrypted value.
- Rejects non-HTTPS base URL.

**Step 2: Run test to verify it fails**

Run:

```bash
cd frontend
npm test -- src/server/commercial/model-provider-service.test.ts
```

Expected: FAIL.

**Step 3: Implement model provider service**

Add `UserModelProviderRecord` to `types.ts`:

- `id`
- `userId`
- `label`
- `baseUrl`
- `encryptedApiKey`
- `apiKeySuffix`
- `fastModel`
- `balancedModel`
- `deepModel`
- `createdAt`
- `updatedAt`

Add repository methods:

- `saveUserModelProvider`.
- `getUserModelProvider`.
- `deleteUserModelProvider`.

Create service methods:

- `saveProvider`.
- `getPublicProvider`.
- `deleteProvider`.

**Step 4: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/model-provider-service.test.ts src/server/commercial/repository.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/model-provider-service.ts frontend/src/server/commercial/model-provider-service.test.ts frontend/src/server/commercial/types.ts frontend/src/server/commercial/repository.ts
git commit -m "feat: add BYOK model provider service"
```

### Task 20: Route Commercial Tasks To User Providers

**Files:**
- Modify: `frontend/src/server/ai/provider-config.ts`
- Modify: `frontend/src/server/ai/ai-gateway.ts`
- Modify: `frontend/src/server/commercial/commercial-task-service.ts`
- Test: `frontend/src/server/commercial/commercial-task-service.test.ts`

**Step 1: Write failing test**

Add a test that a BYOK commercial task:

- Requires a stored provider.
- Records `providerMode: "byok"`.
- Exposes enough provider resolution metadata for worker execution.

**Step 2: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/commercial-task-service.test.ts
```

Expected: FAIL.

**Step 3: Implement provider resolution**

Do the smallest integration:

- Add a helper that builds an OpenAI-compatible adapter from a decrypted user provider config.
- Keep platform provider as the default.
- Worker path chooses user provider when task `providerMode` is `byok`.

**Step 4: Run focused AI and commercial tests**

Run:

```bash
cd frontend
npm test -- src/server/commercial/commercial-task-service.test.ts src/server/ai/adapters/openai-compatible.adapter.test.ts src/server/ai/provider-config.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/ai/provider-config.ts frontend/src/server/ai/ai-gateway.ts frontend/src/server/commercial/commercial-task-service.ts frontend/src/server/commercial/commercial-task-service.test.ts
git commit -m "feat: route commercial tasks to BYOK providers"
```

## Phase 8: Persistence And Deployment Readiness

### Task 21: Add Postgres Repository Skeleton

**Files:**
- Create: `frontend/src/server/commercial/postgres-repository.ts`
- Test: `frontend/src/server/commercial/postgres-repository.test.ts`

**Step 1: Write contract test**

Create tests that can run against a fake query client:

- `saveUser` emits expected insert/upsert query.
- `findUserByEmail` maps row to record.
- `appendLedgerEntry` inserts ledger row.

**Step 2: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/postgres-repository.test.ts
```

Expected: FAIL.

**Step 3: Implement repository skeleton**

Implement with a minimal `QueryClient` interface:

```ts
interface QueryClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
```

Do not add actual DB dependency until package decision is made.

**Step 4: Run test**

Run:

```bash
cd frontend
npm test -- src/server/commercial/postgres-repository.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/server/commercial/postgres-repository.ts frontend/src/server/commercial/postgres-repository.test.ts
git commit -m "feat: add postgres commercial repository skeleton"
```

### Task 22: Add Database Migration Draft

**Files:**
- Create: `frontend/db/migrations/001_commercial_mvp.sql`
- Create: `frontend/db/README.md`

**Step 1: Draft migration**

Include tables:

- `users`
- `user_sessions`
- `user_credit_accounts`
- `credit_ledger`
- `access_codes`
- `access_code_redemptions`
- `user_model_providers`
- `simulation_tasks`
- `simulation_reports`
- `user_feedback`
- `analytics_events`
- `admin_audit_logs`
- `system_settings`

**Step 2: Add README**

Document:

- Migration order.
- Required env vars.
- Local Postgres expectation.
- How to reset local commercial DB.

**Step 3: Review SQL manually**

Run:

```bash
cd frontend
npm run lint
```

Expected: PASS. SQL is not executed by current test suite.

**Step 4: Commit**

```bash
git add frontend/db/migrations/001_commercial_mvp.sql frontend/db/README.md
git commit -m "docs: add commercial database migration draft"
```

### Task 23: Add Commercial Environment Documentation

**Files:**
- Modify: `frontend/.env.example`
- Modify: `frontend/README.md`
- Modify: `README.zh-CN.md`

**Step 1: Update env example**

Add:

- `COMMERCIAL_MODE_ENABLED`
- `DATABASE_URL`
- `REDIS_URL`
- `ACCESS_CODE_PEPPER`
- `USER_SECRET_ENCRYPTION_KEY`
- `MAX_WEIGHTED_CONCURRENCY`
- `PLATFORM_LEGACY_CREDIT_COST`
- `PLATFORM_DEEP_CREDIT_COST`
- `BYOK_LEGACY_CREDIT_COST`
- `BYOK_DEEP_CREDIT_COST`

**Step 2: Update docs**

Explain:

- Commercial MVP mode is separate from local demo mode.
- Access-code credits.
- Queue-backed task execution.
- BYOK security requirements.

**Step 3: Run checks**

Run:

```bash
cd frontend
npm run lint
```

Expected: PASS.

**Step 4: Commit**

```bash
git add frontend/.env.example frontend/README.md README.zh-CN.md
git commit -m "docs: document commercial MVP configuration"
```

## Final Verification

Run:

```bash
cd frontend
npm run lint
npm test
npm run build
```

Expected:

- TypeScript check passes.
- Existing and new tests pass.
- Build succeeds.

Then inspect:

```bash
git status --short
git log --oneline -10
```

Expected:

- Working tree is clean except intentional local ignored files.
- Recent commits match completed tasks.
