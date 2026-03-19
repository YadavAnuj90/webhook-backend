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

// FEATURE 16: Retry Budget per Endpoint
export function getNextRetryAtForStrategy(
  attempt: number,
  strategy: string,
  fixedDelaySecs: number,
): Date {
  let delaySecs: number;
  if (strategy === 'linear') {
    delaySecs = attempt * 60;
  } else if (strategy === 'fixed') {
    delaySecs = fixedDelaySecs;
  } else {
    // exponential: capped at 1hr
    delaySecs = Math.min(Math.pow(2, attempt) * 30, 3600);
  }
  return new Date(Date.now() + delaySecs * 1000);
}
