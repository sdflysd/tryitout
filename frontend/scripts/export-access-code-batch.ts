import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  AccessCodeStatus,
  CommercialFeature,
  UserTier,
} from "../src/contracts/commercial.js";
import type { JsonObject } from "../src/server/commercial/types.js";

export interface AccessCodeBatchCreationPayload extends JsonObject {
  batch: JsonObject & {
    id: string;
    createdByUserId?: string;
    name: string;
    source?: string;
    codeCount: number;
    credits: number;
    tier?: UserTier;
    features: CommercialFeature[];
    expiresAt?: string;
    disabledAt?: string;
    notes?: string;
    metadata?: JsonObject;
    createdAt: string;
  };
  codes: Array<
    JsonObject & {
      id: string;
      rawCode?: string;
      codeMask: string;
      status: AccessCodeStatus;
      credits: number;
      tier?: UserTier;
      features: CommercialFeature[];
      expiresAt?: string;
      createdAt: string;
    }
  >;
}

export interface AccessCodeBatchExport {
  exportedAt: string;
  batch: {
    id: string;
    createdByUserId?: string;
    name: string;
    source?: string;
    codeCount: number;
    credits: number;
    tier?: UserTier;
    features: CommercialFeature[];
    expiresAt?: string;
    disabledAt?: string;
    notes?: string;
    metadata: JsonObject;
    createdAt: string;
  };
  codes: Array<{
    id: string;
    rawCode: string;
    codeMask: string;
    status: AccessCodeStatus;
    credits: number;
    tier?: UserTier;
    features: CommercialFeature[];
    expiresAt?: string;
    createdAt: string;
  }>;
}

export function buildAccessCodeBatchExport(
  payload: AccessCodeBatchCreationPayload,
  options: { exportedAt?: string } = {},
): AccessCodeBatchExport {
  validateCreationPayload(payload);
  const batch = stripSensitiveObject(payload.batch);
  const exportPayload: AccessCodeBatchExport = {
    exportedAt: normalizeExportedAt(options.exportedAt),
    batch: {
      id: payload.batch.id,
      ...(payload.batch.createdByUserId !== undefined
        ? { createdByUserId: payload.batch.createdByUserId }
        : {}),
      name: payload.batch.name,
      ...(payload.batch.source !== undefined ? { source: payload.batch.source } : {}),
      codeCount: payload.batch.codeCount,
      credits: payload.batch.credits,
      ...(payload.batch.tier !== undefined ? { tier: payload.batch.tier } : {}),
      features: [...payload.batch.features],
      ...(payload.batch.expiresAt !== undefined ? { expiresAt: payload.batch.expiresAt } : {}),
      ...(payload.batch.disabledAt !== undefined ? { disabledAt: payload.batch.disabledAt } : {}),
      ...(payload.batch.notes !== undefined ? { notes: payload.batch.notes } : {}),
      metadata: isJsonObject(batch.metadata) ? batch.metadata : {},
      createdAt: payload.batch.createdAt,
    },
    codes: payload.codes.map((code) => ({
      id: code.id,
      rawCode: code.rawCode!,
      codeMask: code.codeMask,
      status: code.status,
      credits: code.credits,
      ...(code.tier !== undefined ? { tier: code.tier } : {}),
      features: [...code.features],
      ...(code.expiresAt !== undefined ? { expiresAt: code.expiresAt } : {}),
      createdAt: code.createdAt,
    })),
  };

  assertNoForbiddenKeys(exportPayload);
  return exportPayload;
}

export function serializeAccessCodeBatchExport(
  payload: AccessCodeBatchExport,
): string {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export async function runExportAccessCodeBatchCli(
  argv: string[] = process.argv.slice(2),
): Promise<AccessCodeBatchExport> {
  const inputPath = argv[0];
  const outputPath = argv[1];
  if (inputPath === undefined || outputPath === undefined) {
    throw new Error(
      "Usage: npm run export:access-codes -- <creation-payload.json> <safe-export.json>",
    );
  }

  const input = JSON.parse(await readFile(inputPath, "utf8")) as AccessCodeBatchCreationPayload;
  const exported = buildAccessCodeBatchExport(input);
  await writeFile(outputPath, serializeAccessCodeBatchExport(exported), {
    encoding: "utf8",
    flag: "wx",
  });
  return exported;
}

function validateCreationPayload(payload: AccessCodeBatchCreationPayload): void {
  if (!isJsonObject(payload) || !isJsonObject(payload.batch) || !Array.isArray(payload.codes)) {
    throw new Error("Access-code creation payload must include batch and codes");
  }
  if (payload.codes.length !== payload.batch.codeCount) {
    throw new Error("Access-code export code count must match the batch");
  }
  for (const code of payload.codes) {
    if (typeof code.rawCode !== "string" || code.rawCode.trim() === "") {
      throw new Error(
        "Access-code export requires creation-time raw code payload; database records only contain masked/hash data",
      );
    }
  }
}

function stripSensitiveObject(value: JsonObject): JsonObject {
  const output: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      continue;
    }
    output[key] = stripSensitiveValue(item);
  }
  return output;
}

function stripSensitiveValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripSensitiveValue);
  }
  if (isJsonObject(value)) {
    return stripSensitiveObject(value);
  }
  return value;
}

function assertNoForbiddenKeys(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertNoForbiddenKeys(item);
    }
    return;
  }
  if (!isJsonObject(value)) {
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      throw new Error(`Sensitive field cannot be exported: ${key}`);
    }
    assertNoForbiddenKeys(item);
  }
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    normalized === "passwordhash" ||
    normalized === "codehash" ||
    normalized === "tokenhash" ||
    normalized === "encryptedapikey" ||
    normalized === "apikey" ||
    normalized === "secret" ||
    normalized.endsWith("secret")
  );
}

function normalizeExportedAt(value: string | undefined): string {
  const date = value === undefined ? new Date() : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Export timestamp is invalid");
  }
  return date.toISOString();
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isDirectRun =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  runExportAccessCodeBatchCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`export:access-codes failed: ${message}\n`);
    process.exitCode = 1;
  });
}
