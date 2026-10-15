/**
 * Maximum retry delay accepted by Cloudflare Queues (12 hours, in seconds).
 * Passing a larger value to `Message.retry()` would make the call throw.
 */
export const MAX_RETRY_DELAY_SECONDS = 43200;

/**
 * Calculates an exponential backoff delay in seconds for a message retry:
 * `baseDelaySeconds ** attempts`.
 *
 * `attempts` is the Cloudflare `Message.attempts` value — the number of
 * delivery attempts so far (1 on the first delivery).
 *
 * @param attempts - The number of delivery attempts so far.
 * @param baseDelaySeconds - The configured base retry delay.
 */
export function calculateExponentialBackoff(
  attempts: number,
  baseDelaySeconds: number
): number {
  return baseDelaySeconds ** attempts;
}

/**
 * Calculates an exponential backoff delay clamped to Cloudflare's maximum
 * supported value.
 */
export const calculateClampedBackoff = (
  attempts: number,
  baseDelaySeconds: number
): number =>
  Math.min(
    calculateExponentialBackoff(attempts, baseDelaySeconds),
    MAX_RETRY_DELAY_SECONDS
  );
