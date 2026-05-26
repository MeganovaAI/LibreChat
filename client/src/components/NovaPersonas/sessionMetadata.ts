import type { NovaPersonasSessionMetadata } from 'librechat-data-provider';

interface SessionLike {
  id: string;
  metadata?: NovaPersonasSessionMetadata;
}

interface Options {
  portalBase: string;
  fetcher?: typeof fetch;
}

/**
 * Read nova-personas session metadata for conditional render decisions.
 *
 * Primary path: LibreChat's session object already carries `metadata`
 * (after nova-os ships issue NO-A — session-metadata pass-through).
 *
 * Fallback: probe the portal sidecar at /api/sessions/:id/metadata —
 * adds one round-trip per chat open but works without NO-A.
 */
export async function readSessionMetadata(
  session: SessionLike,
  opts: Options,
): Promise<NovaPersonasSessionMetadata> {
  if (session.metadata && Object.keys(session.metadata).length > 0) {
    return session.metadata;
  }
  const fetcher = opts.fetcher ?? fetch;
  const url = `${opts.portalBase}/api/sessions/${encodeURIComponent(session.id)}/metadata`;
  const resp = await fetcher(url, { credentials: 'include' });
  if (!resp.ok) return {};
  return (await resp.json()) as NovaPersonasSessionMetadata;
}
