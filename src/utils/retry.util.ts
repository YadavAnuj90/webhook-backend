export const RETRY_DELAYS_MS = [
  1 * 60 * 1000,
  5 * 60 * 1000,
  30 * 60 * 1000,
  2 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
];

export const MAX_RETRY_ATTEMPTS = RETRY_DELAYS_MS.length;

export function getRetryDelay(attempt: number): number | null {
  return attempt >= MAX_RETRY_ATTEMPTS ? null : RETRY_DELAYS_MS[attempt];
}

export function getNextRetryAt(attempt: number): Date | null {
  const delay = getRetryDelay(attempt);
  return delay === null ? null : new Date(Date.now() + delay);
}
