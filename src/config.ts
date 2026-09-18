import { DEFAULT_CONFIG, type Enforcement, type PluginConfig } from "./types.js";

function asEnforcement(value: unknown): Enforcement {
  if (value === "off" || value === "remind" || value === "gate") {
    return value;
  }
  return DEFAULT_CONFIG.enforcement;
}

export function parsePluginConfig(raw: unknown): PluginConfig {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const maxReviseAttempts =
    typeof obj.maxReviseAttempts === "number" && Number.isInteger(obj.maxReviseAttempts)
      ? Math.min(3, Math.max(1, obj.maxReviseAttempts))
      : DEFAULT_CONFIG.maxReviseAttempts;
  const storagePath =
    typeof obj.storagePath === "string" && obj.storagePath.trim()
      ? obj.storagePath.trim()
      : DEFAULT_CONFIG.storagePath;
  return {
    enforcement: asEnforcement(obj.enforcement),
    maxReviseAttempts,
    storagePath,
  };
}
