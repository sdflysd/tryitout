import assert from "node:assert/strict";
import test from "node:test";

import { CommercialAuthService, CommercialAuthServiceError } from "./auth-service.js";
import { InMemoryCommercialRepository } from "./repository.js";
import { verifyPassword } from "./passwords.js";

const now = new Date("2026-07-06T12:00:00.000Z");

function createService(repository = new InMemoryCommercialRepository()): CommercialAuthService {
  return new CommercialAuthService(repository, {
    now: () => now,
    sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
  });
}

test("register normalizes email, hashes password, and creates credit account", async () => {
  const repository = new InMemoryCommercialRepository();
  const service = createService(repository);

  const result = await service.register({
    email: " Founder@TryItOut.AI ",
    password: "super-secret-password",
  });

  const savedUser = await repository.getUser(result.user.id);
  assert.equal(result.user.email, "founder@tryitout.ai");
  assert.equal(savedUser?.email, "founder@tryitout.ai");
  assert.notEqual(savedUser?.passwordHash, "super-secret-password");
  assert.equal(await verifyPassword("super-secret-password", savedUser?.passwordHash ?? ""), true);
  assert.equal((await repository.getCreditAccount(result.user.id))?.balance, 0);
});

test("duplicate email is rejected", async () => {
  const service = createService();

  await service.register({ email: "founder@tryitout.ai", password: "password-1" });

  await assert.rejects(
    service.register({ email: "FOUNDER@TRYITOUT.AI", password: "password-2" }),
    new CommercialAuthServiceError("email_already_registered", "Email is already registered."),
  );
});

test("login verifies password and creates a session", async () => {
  const repository = new InMemoryCommercialRepository();
  const service = createService(repository);
  const registered = await service.register({ email: "founder@tryitout.ai", password: "password-1" });

  const login = await service.login({ email: " Founder@TryItOut.AI ", password: "password-1" });

  assert.equal(login.user.id, registered.user.id);
  assert.match(login.sessionToken, /^[A-Za-z0-9_-]{32,}$/);

  const session = await repository.findSessionByTokenHash(service.hashSessionTokenForTest(login.sessionToken));
  assert.equal(session?.userId, registered.user.id);
  assert.equal(session?.tokenHash.includes(login.sessionToken), false);
  assert.equal(session?.expiresAt.toISOString(), "2026-07-13T12:00:00.000Z");

  await assert.rejects(
    service.login({ email: "founder@tryitout.ai", password: "wrong-password" }),
    new CommercialAuthServiceError("invalid_credentials", "Invalid email or password."),
  );
});

test("getUserForSessionToken returns user for valid non-expired session", async () => {
  const service = createService();
  const registered = await service.register({ email: "founder@tryitout.ai", password: "password-1" });
  const login = await service.login({ email: "founder@tryitout.ai", password: "password-1" });

  const user = await service.getUserForSessionToken(login.sessionToken);

  assert.equal(user?.id, registered.user.id);
  assert.equal(Object.hasOwn(user ?? {}, "passwordHash"), false);
});

test("logout revokes session", async () => {
  const repository = new InMemoryCommercialRepository();
  const service = createService(repository);
  await service.register({ email: "founder@tryitout.ai", password: "password-1" });
  const login = await service.login({ email: "founder@tryitout.ai", password: "password-1" });

  await service.logout(login.sessionToken);

  const session = await repository.findSessionByTokenHash(service.hashSessionTokenForTest(login.sessionToken));
  assert.equal(session?.revokedAt?.toISOString(), now.toISOString());
  assert.equal(await service.getUserForSessionToken(login.sessionToken), undefined);
});

test("disabled users cannot log in", async () => {
  const repository = new InMemoryCommercialRepository();
  const service = createService(repository);
  const registered = await service.register({ email: "founder@tryitout.ai", password: "password-1" });
  const savedUser = await repository.getUser(registered.user.id);
  assert.ok(savedUser);
  await repository.saveUser({ ...savedUser, disabledAt: now, updatedAt: now });

  await assert.rejects(
    service.login({ email: "founder@tryitout.ai", password: "password-1" }),
    new CommercialAuthServiceError("user_disabled", "User account is disabled."),
  );
});
