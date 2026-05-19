import React, { useState } from 'react';
import type { FlagReason, NovaPersonasSessionMetadata } from 'librechat-data-provider';
import { postFlag as defaultPostFlag } from './portalClient';

const REASONS: { value: FlagReason; label: string }[] = [
  { value: 'realism',         label: "Real client wouldn't say this" },
  { value: 'pedagogical_fit', label: "Doesn't fit case category" },
  { value: 'other',           label: 'Other' },
];

interface Props {
  sessionId: string;
  turnId: number;
  portalBase: string;
  metadata?: NovaPersonasSessionMetadata;
  operatorId?: string;
  stealthMode?: boolean;
  post?: typeof defaultPostFlag;
}

/**
 * Per-turn flag affordance. Click → popover with 3 reasons + optional
 * free-text → submit POSTs to portal /api/sessions/:id/flags.
 *
 * Visually subtle (icon-only by default; hover reveals "Flag" label).
 */
export function FlagButton({
  sessionId,
  turnId,
  portalBase,
  metadata = {},
  operatorId,
  stealthMode = false,
  post = defaultPostFlag,
}: Props): JSX.Element | null {
  if (stealthMode) return null;

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<FlagReason>('realism');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    try {
      await post({
        portalBase,
        sessionId,
        turnId,
        reasonType: reason,
        note,
        operatorId,
        packId: metadata.pack_id,
        canonical: metadata.persona_id,
        variantCode: metadata.variant_code,
      });
      setOpen(false);
      setNote('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        aria-label="Flag this turn"
        title="Flag"
        onClick={() => setOpen((o) => !o)}
        className="opacity-60 hover:opacity-100 text-sm bg-transparent border-none cursor-pointer"
      >
        Flag
      </button>
      {open && (
        <form
          onSubmit={submit}
          className="absolute top-7 right-0 z-50 w-72 rounded-md border border-gray-300 bg-white p-3 text-xs shadow-md"
        >
          {REASONS.map((r) => (
            <label key={r.value} className="block mb-1.5">
              <input
                type="radio"
                name="reason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
              />
              <span className="ml-2">{r.label}</span>
            </label>
          ))}
          <textarea
            placeholder="Optional note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-2 w-full min-h-[48px] rounded border border-gray-300 p-1.5 text-xs"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" disabled={busy}>Submit</button>
          </div>
        </form>
      )}
    </div>
  );
}
