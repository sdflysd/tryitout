import { createHash, randomUUID, randomBytes } from "node:crypto";

import type { CommercialRepository } from "./repository.js";
import { hashPassword, verifyPassword } from "./passwords.js";
import type { CommercialUserRecord } from "./types.js";

export interface PublicCommercialUser {
  id: string;
  email: string;
  tier: CommercialUserRecord["tier"];
  features: CommercialUserRecord["features"];
  isAdmin: boolean;
}

export interface CommercialAuthServiceOptions {
  now?: () => Date;
  sessionTtlMs?: number;
}

export class CommercialAuthServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CommercialAuthServiceError";
  }
}

export class CommercialAuthService {
  private readonly now: () => Date;
  private readonly sessionTtlMs: number;

  constructor(
    private readonly repository: CommercialRepository,
    options: CommercialAuthServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.sessionTtlMs = options.sessionTtlMs ?? 7 * 24 * 60 * 60 * 1000;
  }

  async register(input: { email: string; password: string }): Promise<{ user: PublicCommercialUser }> {
    const email = normalizeEmail(input.email);
    const existing = await this.repository.findUserByEmail(email);
    if (existing) {
      throw new CommercialAuthServiceError("email_already_registered", "Email is already registered.");
    }

    const timestamp = this.now();
    const user: CommercialUserRecord = {
      id: createId("user"),
      email,
      passwordHash: await hashPassword(input.password),
      tier: "basic",
      features: [],
      isAdmin: false,
      disabledAt: undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.repository.runInTransaction(async (transaction) => {
      await transaction.saveUser(user);
      await transaction.saveCreditAccount({
        userId: user.id,
        balance: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    });

    return { user: toPublicUser(user) };
  }

  async login(input: {
    email: string;
    password: string;
  }): Promise<{ user: PublicCommercialUser; sessionToken: string }> {
    const user = await this.repository.findUserByEmail(normalizeEmail(input.email));
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new CommercialAuthServiceError("invalid_credentials", "Invalid email or password.");
    }
    if (user.disabledAt) {
      throw new CommercialAuthServiceError("user_disabled", "User account is disabled.");
    }

    const sessionToken = randomBytes(32).toString("base64url");
    const timestamp = this.now();
    await this.repository.saveSession({
      id: createId("session"),
      userId: user.id,
      tokenHash: hashSessionToken(sessionToken),
      expiresAt: new Date(timestamp.getTime() + this.sessionTtlMs),
      revokedAt: undefined,
      createdAt: timestamp,
    });

    return {
      user: toPublicUser(user),
      sessionToken,
    };
  }

  async getUserForSessionToken(sessionToken: string): Promise<PublicCommercialUser | undefined> {
    const session = await this.repository.findSessionByTokenHash(hashSessionToken(sessionToken));
    if (!session || session.revokedAt || session.expiresAt <= this.now()) {
      return undefined;
    }

    const user = await this.repository.getUser(session.userId);
    if (!user || user.disabledAt) {
      return undefined;
    }

    return toPublicUser(user);
  }

  async logout(sessionToken: string): Promise<void> {
    const session = await this.repository.findSessionByTokenHash(hashSessionToken(sessionToken));
    if (!session || session.revokedAt) {
      return;
    }
    await this.repository.revokeSession(session.id, this.now());
  }

  async changePassword(input: {
    userId: string;
    currentPassword: string;
    nextPassword: string;
  }): Promise<void> {
    const user = await this.repository.getUser(input.userId);
    if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw new CommercialAuthServiceError("invalid_credentials", "Invalid email or password.");
    }
    await this.repository.saveUser({
      ...user,
      passwordHash: await hashPassword(input.nextPassword),
      updatedAt: this.now(),
    });
  }

  hashSessionTokenForTest(sessionToken: string): string {
    return hashSessionToken(sessionToken);
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashSessionToken(sessionToken: string): string {
  return createHash("sha256").update(sessionToken, "utf8").digest("base64url");
}

function createId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

function toPublicUser(user: CommercialUserRecord): PublicCommercialUser {
  return {
    id: user.id,
    email: user.email,
    tier: user.tier,
    features: [...user.features],
    isAdmin: user.isAdmin,
  };
}
