import React, { useState } from 'react';

interface PostArgs {
  portalBase: string;
  sessionId: string;
  rating: number;
  note?: string;
  pack_id: string;
  canonical: string;
  variant_code?: string;
  operator_id?: string;
}

interface Props {
  open: boolean;
  sessionId: string;
  portalBase: string;
  packId: string;
  canonical: string;
  variantCode?: string;
  operatorId?: string;
  onClose?: () => void;
  stealthMode?: boolean;
  post?: (args: PostArgs) => Promise<{ status: string }>;
}

async function defaultPost(args: PostArgs): Promise<{ status: string }> {
  const { portalBase, sessionId, rating, note, pack_id, canonical, variant_code, operator_id } = args;
  const body: Record<string, unknown> = { rating, pack_id, canonical, variant_code: variant_code ?? '' };
  if (note) body.note = note;
  if (operator_id) body.operator_id = operator_id;
  const resp = await fetch(
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

/**
 * End-of-session realism rating modal. Non-blocking — Skip records no
 * rating (NOT auto-low). Hidden in stealth mode (replaced by coach-LLM
 * auto-rating per issue #7).
 */
export function RatingWidget({
  open,
  sessionId,
  portalBase,
  packId,
  canonical,
  variantCode = '',
  operatorId,
  onClose = () => {},
  stealthMode = false,
  post = defaultPost,
}: Props): JSX.Element | null {
  if (!open || stealthMode) return null;

  const [rating, setRating] = useState(0);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function submit(): Promise<void> {
    if (rating === 0) return;
    await post({
      portalBase,
      sessionId,
      rating,
      note,
      pack_id: packId,
      canonical,
      variant_code: variantCode,
      operator_id: operatorId,
    });
    setSubmitted(true);
    setTimeout(onClose, 800);
  }

  if (submitted) {
    return (
      <div
        role="dialog"
        className="fixed left-1/2 top-1/2 z-[100] w-80 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 text-center text-green-600 shadow-xl"
      >
        Thanks — your rating shapes this persona's future variants.
      </div>
    );
  }

  return (
    <div
      role="dialog"
      className="fixed left-1/2 top-1/2 z-[100] w-96 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl"
    >
      <h3 className="text-base font-semibold">How realistic was this client?</h3>
      <div className="my-3 flex gap-1 text-3xl" role="radiogroup">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer">
            <input
              type="radio"
              name="rating"
              value={n}
              checked={rating === n}
              onChange={() => setRating(n)}
            />
            <span aria-hidden="true">{n <= rating ? '★' : '☆'}</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-gray-500">1 = staged / 5 = indistinguishable from real</p>
      <textarea
        placeholder="Optional: one thing that stood out"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="mt-3 min-h-[60px] w-full rounded border border-gray-300 p-2 text-sm"
      />
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onClose}>Skip</button>
        <button type="button" onClick={submit} disabled={rating === 0}>Submit</button>
      </div>
    </div>
  );
}
