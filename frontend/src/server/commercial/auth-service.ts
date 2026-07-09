import { randomUUID } from "node:crypto";

import {
  hashPassword as defaultHashPassword,
  verifyPassword as defaultVerifyPassword,
} from "./passwords.js";
import type { CommercialRepository } from "./repository.js";
import {
  createSessionToken as defaultCreateSessionToken,
  hashSessionToken as defaultHashSessionToken,
} from "./tokens.js";
import type { CommercialSessionRecord, CommercialUserRecord } from "./types.js";

const DEFAULT_SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export type CommercialAuthErrorCode =
  | "email_already_registered"
  | "invalid_input"
  | "invalid_credentials"
  | "user_disabled"
  | "user_not_found";

export class CommercialAuthError extends Error {
  readonly code: CommercialAuthErrorCode;

  constructor(code: CommercialAuthErrorCode, message: string) {
    super(message);
    this.name = "CommercialAuthError";
    this.code = code;
  }
}

export type CommercialAuthUser = Omit<CommercialUserRecord, "passwordHash">;

export interface RegisterInput {
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
  userAgent?: string;
  ipHash?: string;
}

export interface ChangePasswordInput {
  userId: string;
  currentPassword: string;
  newPassword: string;
}

export interface CommercialAuthServiceOptions {
  repository: CommercialRepository;
  sessionSecret: string;
  now?: () => Date | string;
  createId?: (prefix?: string) => string;
  sessionDurationMs?: number;
  createSessionToken?: () => string;
  hashPassword?: (password: string) => Promise<string>;
  verifyPassword?: (password: string, passwordHash: string) => Promise<boolean>;
  hashSessionToken?: (token: string, sessionSecret: string) => string;
}

export class CommercialAuthService {
  private readonly repository: CommercialRepository;
  private readonly sessionSecret: string;
  private readonly now: () => Date | string;
  private readonly createId: (prefix?: string) => string;
  private readonly sessionDurationMs: number;
  private readonly createSessionToken: () => string;
  private readonly hashPassword: (password: string) => Promise<string>;
  private readonly verifyPassword: (
    password: string,
    passwordHash: string,
  ) => Promise<boolean>;
  private readonly hashSessionToken: (
    token: string,
    sessionSecret: string,
  ) => string;

  constructor(options: CommercialAuthServiceOptions) {
    this.repository = options.repository;
    this.sessionSecret = options.sessionSecret;
    this.now = options.now ?? (() => new Date());
    this.createId =
      options.createId ?? ((prefix = "id") => `${prefix}_${randomUUID()}`);
    this.sessionDurationMs =
      options.sessionDurationMs ?? DEFAULT_SESSION_DURATION_MS;
    this.createSessionToken =
      options.createSessionToken ?? defaultCreateSessionToken;
    this.hashPassword = options.hashPassword ?? defaultHashPassword;
    this.verifyPassword = options.verifyPassword ?? defaultVerifyPassword;
    this.hashSessionToken = options.hashSessionToken ?? defaultHashSessionToken;
  }

  async register(
    input: RegisterInput,
  ): Promise<{ user: CommercialAuthUser }> {
    const email = input.email.trim();
    validateEmail(email);
    validatePassword(input.password);

    const emailNormalized = normalizeEmail(input.email);
    const existingUser = await this.repository.findUserByEmail(emailNormalized);
    if (existingUser) {
      throw new CommercialAuthError(
        "email_already_registered",
        "Email is already registered",
      );
    }

    const now = this.currentDate();
    const nowIso = now.toISOString();
    const user: CommercialUserRecord = {
      id: this.createId("user"),
      email,
      emailNormalized,
      passwordHash: await this.hashPassword(input.password),
      role: "user",
      tier: "basic",
      status: "active",
      features: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    try {
      await this.repository.createUserWithCreditAccount(user, {
        userId: user.id,
        balance: 0,
        frozenCredits: 0,
        totalRedeemed: 0,
        totalCaptured: 0,
        updatedAt: nowIso,
      });
    } catch (error) {
      if (isEmailUniquenessError(error)) {
        throw new CommercialAuthError(
          "email_already_registered",
          "Email is already registered",
        );
      }

      throw error;
    }

    return { user: toAuthUser(user) };
  }

  async login(
    input: LoginInput,
  ): Promise<{ user: CommercialAuthUser; sessionToken: string }> {
    const email = input.email.trim();
    validateEmail(email, "invalid_credentials");
    validatePassword(input.password, "invalid_credentials");

    const user = await this.repository.findUserByEmail(input.email);
    if (!user) {
      throw new CommercialAuthError(
        "invalid_credentials",
        "Invalid email or password",
      );
    }

    const passwordMatches = await this.verifyPassword(
      input.password,
      user.passwordHash,
    );
    if (!passwordMatches || user.status !== "active") {
      throw new CommercialAuthError(
        "invalid_credentials",
        "Invalid email or password",
      );
    }

    const now = this.currentDate();
    const nowIso = now.toISOString();
    const sessionToken = this.createSessionToken();
    const session: CommercialSessionRecord = {
      id: this.createId("session"),
      userId: user.id,
      tokenHash: this.hashSessionToken(sessionToken, this.sessionSecret),
      userAgent: input.userAgent,
      ipHash: input.ipHash,
      expiresAt: new Date(now.getTime() + this.sessionDurationMs).toISOString(),
      createdAt: nowIso,
    };
    const updatedUser: CommercialUserRecord = {
      ...user,
      lastLoginAt: nowIso,
      updatedAt: nowIso,
    };

    await this.repository.saveUser(updatedUser);
    await this.repository.saveSession(session);

    return {
      user: toAuthUser(updatedUser),
      sessionToken,
    };
  }

  async getUserForSessionToken(
    sessionToken: string,
  ): Promise<CommercialAuthUser | undefined> {
    const session = await this.repository.findSessionByTokenHash(
      this.hashSessionToken(sessionToken, this.sessionSecret),
    );
    if (!session || session.revokedAt) {
      return undefined;
    }

    const now = this.safeCurrentDate();
    const expiresAtMs = Date.parse(session.expiresAt);
    if (!now || !Number.isFinite(expiresAtMs) || expiresAtMs <= now.getTime()) {
      return undefined;
    }

    const user = await this.repository.getEffectiveUser(session.userId, now);
    if (!user || user.status !== "active") {
      return undefined;
    }

    return toAuthUser(user);
  }

  async logout(sessionToken: string): Promise<void> {
    const session = await this.repository.findSessionByTokenHash(
      this.hashSessionToken(sessionToken, this.sessionSecret),
    );
    if (!session || session.revokedAt) {
      return;
    }

    await this.repository.saveSession({
      ...session,
      revokedAt: this.currentDate().toISOString(),
    });
  }

  async changePassword(
    input: ChangePasswordInput,
  ): Promise<{ user: CommercialAuthUser }> {
    validatePassword(input.currentPassword, "invalid_credentials");
    validatePassword(input.newPassword);

    const user = await this.repository.getUser(input.userId);
    if (!user) {
      throw new CommercialAuthError("user_not_found", "User not found");
    }
    if (user.status !== "active") {
      throw new CommercialAuthError("user_disabled", "User is disabled");
    }

    const passwordMatches = await this.verifyPassword(
      input.currentPassword,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new CommercialAuthError(
        "invalid_credentials",
        "Invalid current password",
      );
    }

    const updatedUser: CommercialUserRecord = {
      ...user,
      passwordHash: await this.hashPassword(input.newPassword),
      updatedAt: this.currentDate().toISOString(),
    };

    await this.repository.saveUser(updatedUser);
    await this.repository.revokeUserSessions(user.id, updatedUser.updatedAt);

    return { user: toAuthUser(updatedUser) };
  }

  private currentDate(): Date {
    const value = this.now();
    return value instanceof Date ? value : new Date(value);
  }

  private safeCurrentDate(): Date | undefined {
    const date = this.currentDate();
    return Number.isFinite(date.getTime()) ? date : undefined;
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateEmail(
  email: string,
  code: CommercialAuthErrorCode = "invalid_input",
): void {
  if (!email || !email.includes("@")) {
    throw new CommercialAuthError(code, "Invalid email");
  }
}

function validatePassword(
  password: string,
  code: CommercialAuthErrorCode = "invalid_input",
): void {
  if (!password.trim()) {
    throw new CommercialAuthError(code, "Password is required");
  }
}

function toAuthUser(user: CommercialUserRecord): CommercialAuthUser {
  const { passwordHash: _passwordHash, ...authUser } = user;
  return authUser;
}

function isEmailUniquenessError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("users.emailNormalized") ||
      error.message.includes("emailNormalized") ||
      error.message.includes("email_normalized"))
  );
}
