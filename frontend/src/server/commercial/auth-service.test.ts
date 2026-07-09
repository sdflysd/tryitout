import assert from "node:assert/strict";
import test from "node:test";

import {
  CommercialAuthError,
  CommercialAuthService,
} from "./auth-service.js";
import { InMemoryCommercialRepository } from "./repository.js";
import { hashSessionToken } from "./tokens.js";
import type { CommercialRepository } from "./repository.js";

const SESSION_SECRET = "commercial-session-secret-with-at-least-32-characters";
const NOW = "2026-07-07T00:00:00.000Z";

test("register normalizes email, hashes password, and creates an empty credit account", async () => {
  const { repo, service } = makeService();

  const result = await service.register({
    email: "  User@Example.TEST  ",
    password: "correct horse battery staple",
  });

  assert.equal(result.user.id, "user_1");
  assert.equal(result.user.email, "User@Example.TEST");
  assert.equal(result.user.emailNormalized, "user@example.test");
  assert.equal(result.user.role, "user");
  assert.equal(result.user.tier, "basic");
  assert.equal(result.user.status, "active");
  assert.deepEqual(result.user.features, []);
  assert.equal("passwordHash" in result.user, false);

  const storedUser = await repo.getUser("user_1");
  assert.ok(storedUser);
  assert.equal(storedUser.email, "User@Example.TEST");
  assert.equal(storedUser.emailNormalized, "user@example.test");
  assert.notEqual(storedUser.passwordHash, "correct horse battery staple");
  assert.equal(
    storedUser.passwordHash.includes("correct horse battery staple"),
    false,
  );
  assert.equal(storedUser.createdAt, NOW);
  assert.equal(storedUser.updatedAt, NOW);

  assert.deepEqual(await repo.getCreditAccount("user_1"), {
    userId: "user_1",
    balance: 0,
    frozenCredits: 0,
    totalRedeemed: 0,
    totalCaptured: 0,
    updatedAt: NOW,
  });
});

test("register rejects duplicate normalized email", async () => {
  const { service } = makeService();

  await service.register({
    email: "user@example.test",
    password: "commercial-secret",
  });

  await assert.rejects(
    () =>
      service.register({
        email: "  USER@example.test ",
        password: "commercial-secret",
      }),
    authError("email_already_registered"),
  );
});

test("register rejects blank email and password", async () => {
  const { service } = makeService();

  await assert.rejects(
    () => service.register({ email: "   ", password: "commercial-secret" }),
    authError("invalid_input"),
  );
  await assert.rejects(
    () =>
      service.register({
        email: "not-an-email",
        password: "commercial-secret",
      }),
    authError("invalid_input"),
  );
  await assert.rejects(
    () => service.register({ email: "user@example.test", password: "   " }),
    authError("invalid_input"),
  );
});

test("register maps repository normalized email uniqueness errors to auth errors", async () => {
  const repo = new DuplicateEmailRepository();
  const service = new CommercialAuthService({
    repository: repo,
    sessionSecret: SESSION_SECRET,
    now: () => NOW,
    createId: () => "user_1",
  });

  await assert.rejects(
    () =>
      service.register({
        email: "user@example.test",
        password: "commercial-secret",
      }),
    authError("email_already_registered"),
  );
});

test("login returns a raw session token and stores only its hash", async () => {
  const { repo, service } = makeService({ sessionToken: "raw-session-token" });
  await service.register({
    email: "user@example.test",
    password: "commercial-secret",
  });

  const result = await service.login({
    email: " USER@example.test ",
    password: "commercial-secret",
    userAgent: "node:test",
    ipHash: "ip_hash",
  });

  assert.equal(result.sessionToken, "raw-session-token");
  assert.equal(result.user.id, "user_1");
  assert.equal("passwordHash" in result.user, false);

  const storedUser = await repo.getUser("user_1");
  assert.equal(storedUser?.lastLoginAt, NOW);
  assert.equal(storedUser?.updatedAt, NOW);

  const tokenHash = hashSessionToken("raw-session-token", SESSION_SECRET);
  const session = await repo.findSessionByTokenHash(tokenHash);
  assert.ok(session);
  assert.equal(session.id, "session_1");
  assert.equal(session.userId, "user_1");
  assert.equal(session.tokenHash, tokenHash);
  assert.notEqual(session.tokenHash, "raw-session-token");
  assert.equal(session.tokenHash.includes("raw-session-token"), false);
  assert.equal(session.userAgent, "node:test");
  assert.equal(session.ipHash, "ip_hash");
  assert.equal(session.createdAt, NOW);
  assert.equal(session.expiresAt, "2026-08-06T00:00:00.000Z");
});

test("login rejects wrong password and inactive users without leaking account status", async () => {
  const { repo, service } = makeService();
  await service.register({
    email: "user@example.test",
    password: "commercial-secret",
  });

  await assert.rejects(
    () =>
      service.login({
        email: "user@example.test",
        password: "wrong-secret",
      }),
    authError("invalid_credentials"),
  );

  const storedUser = await repo.getUser("user_1");
  assert.ok(storedUser);
  await repo.saveUser({
    ...storedUser,
    status: "disabled",
  });

  await assert.rejects(
    () =>
      service.login({
        email: "user@example.test",
        password: "commercial-secret",
      }),
    authError("invalid_credentials"),
  );
});

test("getUserForSessionToken rejects expired and revoked sessions", async () => {
  const clock = makeClock("2026-07-07T00:00:00.000Z");
  const { service } = makeService({
    now: clock.now,
    sessionToken: "active-session-token",
    sessionDurationMs: 1_000,
  });
  await service.register({
    email: "user@example.test",
    password: "commercial-secret",
  });
  await service.login({
    email: "user@example.test",
    password: "commercial-secret",
  });

  assert.equal(
    (await service.getUserForSessionToken("active-session-token"))?.id,
    "user_1",
  );

  clock.set("2026-07-07T00:00:01.001Z");
  assert.equal(
    await service.getUserForSessionToken("active-session-token"),
    undefined,
  );

  const revoked = makeService({
    sessionToken: "revoked-session-token",
    sessionDurationMs: 60_000,
  });
  await revoked.service.register({
    email: "revoked@example.test",
    password: "commercial-secret",
  });
  await revoked.service.login({
    email: "revoked@example.test",
    password: "commercial-secret",
  });
  const tokenHash = hashSessionToken("revoked-session-token", SESSION_SECRET);
  const session = await revoked.repo.findSessionByTokenHash(tokenHash);
  assert.ok(session);
  await revoked.repo.saveSession({
    ...session,
    revokedAt: NOW,
  });

  assert.equal(
    await revoked.service.getUserForSessionToken("revoked-session-token"),
    undefined,
  );
});

test("getUserForSessionToken returns effective access-code entitlements", async () => {
  const { repo, service } = makeService({ sessionToken: "entitled-session-token" });
  await service.register({
    email: "user@example.test",
    password: "commercial-secret",
  });
  await service.login({
    email: "user@example.test",
    password: "commercial-secret",
  });
  await repo.saveAccessCodeRedemption({
    id: "redemption_1",
    accessCodeId: "code_1",
    userId: "user_1",
    credits: 10,
    tierGranted: "business",
    featuresGranted: ["custom_model_provider"],
    entitlementStartsAt: "2026-07-06T00:00:00.000Z",
    entitlementExpiresAt: "2026-07-08T00:00:00.000Z",
    redeemedAt: "2026-07-06T00:00:00.000Z",
    metadata: {},
  });

  const user = await service.getUserForSessionToken("entitled-session-token");

  assert.equal(user?.tier, "business");
  assert.deepEqual(user?.features, ["custom_model_provider"]);
  assert.equal((await repo.getUser("user_1"))?.tier, "basic");
});

test("getUserForSessionToken rejects invalid session and clock dates", async () => {
  const invalidSession = makeService({
    now: () => NOW,
    sessionToken: "invalid-expiry-token",
  });
  await invalidSession.service.register({
    email: "invalid-expiry@example.test",
    password: "commercial-secret",
  });
  await invalidSession.service.login({
    email: "invalid-expiry@example.test",
    password: "commercial-secret",
  });
  const tokenHash = hashSessionToken("invalid-expiry-token", SESSION_SECRET);
  const session = await invalidSession.repo.findSessionByTokenHash(tokenHash);
  assert.ok(session);
  await invalidSession.repo.saveSession({
    ...session,
    expiresAt: "not-a-date",
  });

  assert.equal(
    await invalidSession.service.getUserForSessionToken("invalid-expiry-token"),
    undefined,
  );

  const clock = makeClock(NOW);
  const invalidClock = makeService({
    now: clock.now,
    sessionToken: "invalid-clock-token",
  });
  await invalidClock.service.register({
    email: "invalid-clock@example.test",
    password: "commercial-secret",
  });
  await invalidClock.service.login({
    email: "invalid-clock@example.test",
    password: "commercial-secret",
  });
  clock.set("not-a-date");

  assert.equal(
    await invalidClock.service.getUserForSessionToken("invalid-clock-token"),
    undefined,
  );
});

test("logout revokes the matching session and is idempotent for unknown tokens", async () => {
  const { repo, service } = makeService({ sessionToken: "raw-session-token" });
  await service.register({
    email: "user@example.test",
    password: "commercial-secret",
  });
  await service.login({
    email: "user@example.test",
    password: "commercial-secret",
  });

  await service.logout("raw-session-token");

  const session = await repo.findSessionByTokenHash(
    hashSessionToken("raw-session-token", SESSION_SECRET),
  );
  assert.equal(session?.revokedAt, NOW);
  assert.equal(
    await service.getUserForSessionToken("raw-session-token"),
    undefined,
  );

  await assert.doesNotReject(() => service.logout("unknown-token"));
});

test("changePassword revokes existing sessions for the user", async () => {
  const { service } = makeService({ sessionToken: "raw-session-token" });
  await service.register({
    email: "user@example.test",
    password: "old-commercial-secret",
  });
  await service.login({
    email: "user@example.test",
    password: "old-commercial-secret",
  });
  assert.equal(
    (await service.getUserForSessionToken("raw-session-token"))?.id,
    "user_1",
  );

  await service.changePassword({
    userId: "user_1",
    currentPassword: "old-commercial-secret",
    newPassword: "new-commercial-secret",
  });

  assert.equal(
    await service.getUserForSessionToken("raw-session-token"),
    undefined,
  );
});

test("changePassword verifies current password and stores a new hash", async () => {
  const { repo, service } = makeService();
  await service.register({
    email: "user@example.test",
    password: "old-commercial-secret",
  });
  const originalUser = await repo.getUser("user_1");
  assert.ok(originalUser);

  await assert.rejects(
    () =>
      service.changePassword({
        userId: "user_1",
        currentPassword: "wrong-secret",
        newPassword: "new-commercial-secret",
      }),
    authError("invalid_credentials"),
  );

  await service.changePassword({
    userId: "user_1",
    currentPassword: "old-commercial-secret",
    newPassword: "new-commercial-secret",
  });

  const updatedUser = await repo.getUser("user_1");
  assert.ok(updatedUser);
  assert.notEqual(updatedUser.passwordHash, originalUser.passwordHash);
  assert.equal(updatedUser.passwordHash.includes("new-commercial-secret"), false);

  await assert.rejects(
    () =>
      service.login({
        email: "user@example.test",
        password: "old-commercial-secret",
      }),
    authError("invalid_credentials"),
  );
  assert.equal(
    (
      await service.login({
        email: "user@example.test",
        password: "new-commercial-secret",
      })
    ).user.id,
    "user_1",
  );

  await repo.saveUser({
    ...updatedUser,
    status: "disabled",
  });
  await assert.rejects(
    () =>
      service.changePassword({
        userId: "user_1",
        currentPassword: "new-commercial-secret",
        newPassword: "another-commercial-secret",
      }),
    authError("user_disabled"),
  );
});

test("changePassword rejects blank new passwords", async () => {
  const { service } = makeService();
  await service.register({
    email: "user@example.test",
    password: "old-commercial-secret",
  });

  await assert.rejects(
    () =>
      service.changePassword({
        userId: "user_1",
        currentPassword: "old-commercial-secret",
        newPassword: "   ",
      }),
    authError("invalid_input"),
  );
});

function makeService({
  now = () => NOW,
  sessionToken = "raw-session-token",
  sessionDurationMs,
}: {
  now?: () => string;
  sessionToken?: string;
  sessionDurationMs?: number;
} = {}): {
  repo: CommercialRepository;
  service: CommercialAuthService;
} {
  const repo = new InMemoryCommercialRepository();
  const counters = new Map<string, number>();
  const service = new CommercialAuthService({
    repository: repo,
    sessionSecret: SESSION_SECRET,
    now,
    createId: (prefix = "id") => {
      const next = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, next);
      return `${prefix}_${next}`;
    },
    createSessionToken: () => sessionToken,
    sessionDurationMs,
  });

  return { repo, service };
}

function makeClock(initial: string): {
  now: () => string;
  set: (value: string) => void;
} {
  let value = initial;
  return {
    now: () => value,
    set: (next) => {
      value = next;
    },
  };
}

function authError(code: string): {
  (error: unknown): boolean;
} {
  return (error: unknown): boolean =>
    error instanceof CommercialAuthError && error.code === code;
}

class DuplicateEmailRepository extends InMemoryCommercialRepository {
  override async createUserWithCreditAccount(): Promise<void> {
    throw new Error("users_email_normalized_unique");
  }
}
