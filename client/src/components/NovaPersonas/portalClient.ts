import type { FlagReason } from 'librechat-data-provider';

interface FlagArgs {
  portalBase: string;
  sessionId: string;
  turnId: number;
  reasonType: FlagReason;
  note?: string;
  packId?: string;
  canonical?: string;
  variantCode?: string;
  operatorId?: string;
  fetcher?: typeof fetch;
}

interface RatingArgs {
  portalBase: string;
  sessionId: string;
  rating: number;
  note?: string;
  packId: string;
  canonical: string;
  variantCode?: string;
  operatorId?: string;
  fetcher?: typeof fetch;
}

export async function postFlag(args: FlagArgs): Promise<{ status: string }> {
  const { portalBase, sessionId, fetcher = fetch, turnId, reasonType, note, operatorId, packId, canonical, variantCode } = args;
  const body: Record<string, unknown> = { turn_id: turnId, reason_type: reasonType };
  if (note) body.note = note;
  if (operatorId) body.operator_id = operatorId;
  if (packId) body.pack_id = packId;
  if (canonical) body.canonical = canonical;
  if (variantCode !== undefined) body.variant_code = variantCode;
  const resp = await fetcher(
    `${portalBase}/api/sessions/${encodeURIComponent(sessionId)}/flags`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!resp.ok) throw new Error(`flag POST failed: ${resp.status}`);
  return await resp.json();
}

export async function postRating(args: RatingArgs): Promise<{ status: string }> {
  const { portalBase, sessionId, fetcher = fetch, rating, packId, canonical, variantCode, note, operatorId } = args;
  const body: Record<string, unknown> = {
    rating,
    pack_id: packId,
    canonical,
    variant_code: variantCode ?? '',
  };
  if (note) body.note = note;
  if (operatorId) body.operator_id = operatorId;
  const resp = await fetcher(
    `${portalBase}/api/sessions/${encodeURIComponent(sessionId)}/rating`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!resp.ok) throw new Error(`rating POST failed: ${resp.status}`);
  return await resp.json();
}
