// lib/worker.ts
//
// Calling the FastAPI worker -- only for the things the app can't do itself
// (ffmpeg, and anything needing the Gemini key). Everything else goes to
// Supabase directly.

/** Where the worker lives. Set EXPO_PUBLIC_WORKER_URL in .env. */
export const WORKER_URL = (
  process.env.EXPO_PUBLIC_WORKER_URL ?? 'http://localhost:8000'
).replace(/\/+$/, '');

/**
 * POST to the worker and return its JSON, turning every failure into a
 * sentence a user can act on. `what` names the action ("write your brief").
 *
 * The worker's own codes, from docs/api-contract.md:
 *   429  the Gemini key's quota is spent (may carry Retry-After)
 *   504  Gemini timed out
 *   409  the request can't be served yet (e.g. the clip has no analysis)
 */
export async function postToWorker<T>(path: string, body: unknown, what: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${WORKER_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(
      `Couldn't reach the server to ${what}. Check your connection and try again. ` +
        `(If this keeps happening, EXPO_PUBLIC_WORKER_URL in .env may be wrong.)`
    );
  }

  if (response.ok) return (await response.json()) as T;

  const detail = await response
    .json()
    .then((j: { detail?: unknown }) => (typeof j?.detail === 'string' ? j.detail : ''))
    .catch(() => '');

  if (response.status === 429) {
    const retry = Number(response.headers.get('Retry-After'));
    const when =
      retry > 0 ? ` Try again in about ${Math.max(1, Math.round(retry / 60))} min.` : ' Try again later.';
    throw new Error(`Today's AI limit has been used up, so we couldn't ${what}.${when}`);
  }
  if (response.status === 504) {
    throw new Error(`The AI took too long to ${what}. Try again in a moment.`);
  }
  throw new Error(`Couldn't ${what} (${response.status}). ${detail.slice(0, 200)}`.trim());
}
