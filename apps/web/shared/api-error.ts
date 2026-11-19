/**
 * Surface the server's actual reason from a failed `$fetch` call instead of a
 * generic "try again" toast. The API returns errors as `{ error: { message } }`;
 * anything else falls back to the caller's safe default.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const message = (error as { data?: { error?: { message?: unknown } } } | null)?.data?.error
    ?.message;
  return typeof message === 'string' && message.trim() !== '' ? message : fallback;
}
