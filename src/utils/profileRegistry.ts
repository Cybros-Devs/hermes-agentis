import type {
  HermesGatewayStatus,
  HermesProfileMode,
  HermesProfileSource,
  HermesProfileSummary,
} from '../types/hermes';
import { resolveProfileGatewayConfig } from './hermesProtocol';

export interface HermesProfileDefinition {
  id: string;
  label?: string;
  mode: HermesProfileMode;
  baseUrl?: string;
  apiKey?: string;
  source: HermesProfileSource;
  description?: string;
}

export interface HermesProfileRuntime {
  id: string;
  label: string;
  mode: HermesProfileMode;
  baseUrl: string;
  routePrefix: string;
  apiKey: string;
  source: HermesProfileSource;
  isDefault: boolean;
  description?: string;
}

const RESERVED_PROFILE_SLUGS = new Set(['api', 'v1', 'health', 'p', 'sessions', 'runs']);

export function normalizeProfileId(raw?: string | null): string {
  const cleaned = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  if (!cleaned || RESERVED_PROFILE_SLUGS.has(cleaned)) {
    return 'default';
  }
  return cleaned;
}

export function isValidCustomProfileSlug(raw?: string | null): boolean {
  const trimmed = String(raw ?? '').trim().toLowerCase();
  if (!trimmed || trimmed === 'default' || RESERVED_PROFILE_SLUGS.has(trimmed)) return false;
  return /^[a-z0-9][a-z0-9_-]{0,38}[a-z0-9]?$/.test(trimmed);
}

export function normalizeBaseUrl(raw?: string | null): string {
  const clean = String(raw ?? '').trim().replace(/\/+$/, '');
  return clean;
}

export function isValidHttpUrl(raw?: string | null): boolean {
  const clean = normalizeBaseUrl(raw);
  if (!clean) return false;
  try {
    const u = new URL(clean);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Parses `HERMES_PROFILES` supporting either:
 * - JSON array: `[{"id":"coder","mode":"standalone","baseUrl":"http://127.0.0.1:8643"}]`
 * - CSV shorthand: `coder,researcher` or `coder=http://127.0.0.1:8643,researcher=multiplexed`
 */
export function parseHermesProfilesEnv(
  env: Record<string, string | undefined>
): HermesProfileDefinition[] {
  const raw = (env.HERMES_PROFILES || '').trim();
  if (!raw) return [];

  const defs: HermesProfileDefinition[] = [];
  const seen = new Set<string>();

  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item || typeof item !== 'object') continue;
          const rec = item as Record<string, unknown>;
          const id = normalizeProfileId(typeof rec.id === 'string' ? rec.id : typeof rec.name === 'string' ? rec.name : '');
          if (!id || seen.has(id)) continue;
          seen.add(id);
          const hasUrl = typeof rec.baseUrl === 'string' && isValidHttpUrl(rec.baseUrl);
          const mode: HermesProfileMode =
            rec.mode === 'standalone' || hasUrl ? 'standalone' : 'multiplexed';
          defs.push({
            id,
            label: typeof rec.label === 'string' && rec.label.trim() ? rec.label.trim() : undefined,
            mode,
            baseUrl: hasUrl ? normalizeBaseUrl(rec.baseUrl as string) : undefined,
            apiKey: typeof rec.apiKey === 'string' && rec.apiKey.trim() ? rec.apiKey.trim() : undefined,
            source: 'env',
            description:
              typeof rec.description === 'string' && rec.description.trim()
                ? rec.description.trim()
                : undefined,
          });
        }
        return defs;
      }
    } catch {
      // fall through to CSV parser if invalid JSON
    }
  }

  for (const token of raw.split(',')) {
    const part = token.trim();
    if (!part) continue;
    const eqIdx = part.indexOf('=');
    const namePart = eqIdx >= 0 ? part.slice(0, eqIdx).trim() : part;
    const valPart = eqIdx >= 0 ? part.slice(eqIdx + 1).trim() : '';
    const id = normalizeProfileId(namePart);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const hasUrl = isValidHttpUrl(valPart);
    defs.push({
      id,
      mode: hasUrl ? 'standalone' : 'multiplexed',
      baseUrl: hasUrl ? normalizeBaseUrl(valPart) : undefined,
      source: 'env',
    });
  }

  return defs;
}

/**
 * Resolves gateway routing (`baseUrl`, `/p/<profile>` vs `''`, and profile-scoped bearer key)
 * for a specific Hermes Agent profile definition.
 */
export function resolveProfileRuntimeConfig(
  def: HermesProfileDefinition,
  env: Record<string, string | undefined>
): HermesProfileRuntime {
  const primary = resolveProfileGatewayConfig(env);
  const id = normalizeProfileId(def.id || primary.profile);
  const isDefault = id === 'default';
  const mode: HermesProfileMode =
    isDefault
      ? 'standalone'
      : def.mode === 'standalone' && isValidHttpUrl(def.baseUrl)
      ? 'standalone'
      : 'multiplexed';

  const baseUrl =
    mode === 'standalone' && !isDefault && isValidHttpUrl(def.baseUrl)
      ? normalizeBaseUrl(def.baseUrl)
      : primary.baseUrl;

  const routePrefix =
    isDefault || mode === 'standalone' ? '' : `/p/${encodeURIComponent(id)}`;

  const profileSlugEnv = id.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase();
  const explicitKey = def.apiKey?.trim() || '';
  const envProfileKey = env[`HERMES_API_KEY_${profileSlugEnv}`]?.trim() || '';
  const sharedNamedProfileKey = !isDefault ? env.HERMES_PROFILE_API_KEY?.trim() || '' : '';
  const fallbackDefaultKey = (env.HERMES_API_KEY || '').trim();

  const apiKey =
    explicitKey ||
    envProfileKey ||
    sharedNamedProfileKey ||
    fallbackDefaultKey;

  return {
    id,
    label: def.label?.trim() || id,
    mode: isDefault ? 'standalone' : mode,
    baseUrl,
    routePrefix,
    apiKey,
    source: def.source,
    isDefault,
    description: def.description,
  };
}

/**
 * Merges environment, filesystem-discovered (`~/.hermes/profiles/*`), and UI-registered
 * profile definitions in deterministic precedence order (`custom` overrides `discovered`/`env`).
 */
export function buildProfileCatalog(params: {
  env: Record<string, string | undefined>;
  discoveredProfiles?: HermesProfileDefinition[];
  customProfiles?: HermesProfileDefinition[];
}): { defaultProfileId: string; runtimes: HermesProfileRuntime[] } {
  const primary = resolveProfileGatewayConfig(params.env);
  const defaultProfileId = normalizeProfileId(primary.profile);

  const byId = new Map<string, HermesProfileDefinition>();

  // Always seed `default` (or active HERMES_PROFILE) first
  byId.set(defaultProfileId, {
    id: defaultProfileId,
    label: defaultProfileId,
    mode: defaultProfileId === 'default' ? 'standalone' : 'multiplexed',
    baseUrl: primary.baseUrl,
    apiKey: primary.apiKey,
    source: 'env',
    description:
      defaultProfileId === 'default'
        ? 'Primary ~/.hermes workspace'
        : `Primary HERMES_PROFILE=${defaultProfileId}`,
  });

  for (const def of parseHermesProfilesEnv(params.env)) {
    byId.set(def.id, { ...byId.get(def.id), ...def });
  }
  for (const def of params.discoveredProfiles ?? []) {
    const id = normalizeProfileId(def.id);
    if (!id) continue;
    const prev = byId.get(id);
    byId.set(id, {
      ...prev,
      ...def,
      id,
      label: prev?.label || def.label || id,
    });
  }
  for (const def of params.customProfiles ?? []) {
    const id = normalizeProfileId(def.id);
    if (!id) continue;
    const prev = byId.get(id);
    byId.set(id, {
      ...prev,
      ...def,
      id,
      apiKey: def.apiKey?.trim() || prev?.apiKey,
    });
  }

  const runtimes: HermesProfileRuntime[] = [];
  for (const def of byId.values()) {
    runtimes.push(resolveProfileRuntimeConfig(def, params.env));
  }

  runtimes.sort((a, b) => {
    if (a.id === defaultProfileId) return -1;
    if (b.id === defaultProfileId) return 1;
    return a.id.localeCompare(b.id);
  });

  return { defaultProfileId, runtimes };
}

/**
 * Redacts raw API keys completely before sending profile metadata to the browser.
 */
export function toRedactedProfileSummary(
  runtime: HermesProfileRuntime,
  status?: HermesGatewayStatus | null
): HermesProfileSummary {
  return {
    id: runtime.id,
    label: runtime.label,
    mode: runtime.mode,
    baseUrl: runtime.baseUrl,
    routePrefix: runtime.routePrefix,
    source: runtime.source,
    hasApiKey: Boolean(runtime.apiKey),
    isDefault: runtime.isDefault,
    ...(runtime.description ? { description: runtime.description } : {}),
    ...(status
      ? {
          connected: status.connected,
          activeModel: status.activeModel,
          healthStatus: status.healthStatus,
          ...(status.error ? { error: status.error } : {}),
        }
      : {}),
  };
}
