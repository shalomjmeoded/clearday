import { getDb } from './client';

/**
 * Serialises multi-statement work on the single SQLite connection.
 *
 * Statements are atomic on their own, but anything spanning several awaits
 * (a transaction, a wipe-and-refill) can be interleaved by other async code
 * on the same connection: a reminder sync kicked off by the app returning to
 * the foreground, a notification action, a store refresh. Writers that must
 * not be interleaved run under runExclusive(); background work that would
 * misread a half-finished state awaits whenDbIdle() first.
 */
let current: Promise<void> | null = null;

export async function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  while (current) {
    await current;
  }
  let release!: () => void;
  current = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    return await fn();
  } finally {
    current = null;
    release();
  }
}

/** Resolves once no exclusive work is running (immediately if none is). */
export async function whenDbIdle(): Promise<void> {
  while (current) {
    await current;
  }
}

/** Test hook. */
export function __isDbBusy(): boolean {
  return current !== null;
}

/**
 * Wraps `fn` in a write transaction on the shared connection: commits when it
 * resolves, rolls back and rethrows when it throws. Does not take the lock;
 * call it from inside runExclusive() when the surrounding work must also be
 * serialised, or use runInTransaction() for the common case.
 */
export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const db = await getDb();
  await db.execAsync('BEGIN IMMEDIATE TRANSACTION');
  try {
    const result = await fn();
    await db.execAsync('COMMIT');
    return result;
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
}

/** A write transaction that also holds the exclusive lock. */
export function runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
  return runExclusive(() => withTransaction(fn));
}
