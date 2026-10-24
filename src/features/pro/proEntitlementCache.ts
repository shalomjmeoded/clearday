import { getDb } from '@/db/client';

/**
 * Last entitlement RevenueCat gave us, cached locally so Pro gates read the
 * right answer from the first frame after launch instead of defaulting to
 * free while the network round-trip is still in flight.
 *
 * This is a convenience cache, never the source of truth: RevenueCat always
 * wins once it answers. It lives in the generic `settings` key/value table.
 */
export const PRO_ENTITLEMENT_CACHE_KEY = 'proEntitlementCache';

export type CachedEntitlement = {
  isPro: boolean;
  productId: string | null;
  expiresAt: string | null;
  cachedAt: string;
};

function isExpired(cached: CachedEntitlement, now: Date): boolean {
  // No expiry means a lifetime/promotional grant; nothing to age out.
  if (!cached.expiresAt) return false;

  const expires = new Date(cached.expiresAt).getTime();
  if (Number.isNaN(expires)) return false;

  return expires <= now.getTime();
}

function parseCached(raw: string): CachedEntitlement | null {
  try {
    const parsed = JSON.parse(raw) as Partial<CachedEntitlement>;

    if (typeof parsed?.isPro !== 'boolean') return null;

    return {
      isPro: parsed.isPro,
      productId: typeof parsed.productId === 'string' ? parsed.productId : null,
      expiresAt: typeof parsed.expiresAt === 'string' ? parsed.expiresAt : null,
      cachedAt: typeof parsed.cachedAt === 'string' ? parsed.cachedAt : '',
    };
  } catch {
    return null;
  }
}

/**
 * Returns the cached entitlement, or null when there is none / it is unusable.
 * An expired Pro cache resolves to a free entitlement rather than null so the
 * caller still learns that we have a known-good answer.
 */
export async function readCachedEntitlement(
  now: Date = new Date()
): Promise<CachedEntitlement | null> {
  try {
    const db = await getDb();
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      [PRO_ENTITLEMENT_CACHE_KEY]
    );

    if (!row?.value) return null;

    const cached = parseCached(row.value);
    if (!cached) return null;

    if (cached.isPro && isExpired(cached, now)) {
      // Never let a stale cache keep Pro unlocked past its expiry: fall back
      // to free until RevenueCat confirms a renewal.
      return { ...cached, isPro: false, productId: null };
    }

    return cached;
  } catch (error) {
    console.warn('[Pro] Could not read cached entitlement:', error);
    return null;
  }
}

export async function writeCachedEntitlement(
  entitlement: Omit<CachedEntitlement, 'cachedAt'>
): Promise<void> {
  try {
    const db = await getDb();
    const payload: CachedEntitlement = {
      ...entitlement,
      cachedAt: new Date().toISOString(),
    };

    await db.runAsync(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      [PRO_ENTITLEMENT_CACHE_KEY, JSON.stringify(payload)]
    );
  } catch (error) {
    console.warn('[Pro] Could not cache entitlement:', error);
  }
}
