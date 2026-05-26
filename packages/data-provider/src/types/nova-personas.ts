/**
 * Shared types for the nova-personas chat-surface primitives.
 *
 * The session metadata shape mirrors what the nova-personas portal
 * sidecar attaches at session create time (and what nova-os issue NO-A
 * surfaces through the conversation/messages APIs).
 */

export type SessionPurpose =
  | 'capture'
  | 'training'
  | 'eval'
  | 'variant_validation';

export interface NovaPersonasSessionMetadata {
  session_purpose?: SessionPurpose;
  pack_id?: string;
  persona_id?: string;
  variant_code?: string;
  /** When true, the deployment-level admin opted into stealth mode (#7). */
  stealth_mode?: boolean;
}

export type FlagReason = 'realism' | 'pedagogical_fit' | 'other';

export interface FlagPayload {
  turn_id: number;
  reason_type: FlagReason;
  note?: string;
  pack_id?: string;
  canonical?: string;
  variant_code?: string;
  operator_id?: string;
}

export interface RatingPayload {
  rating: number; // 1-5
  note?: string;
  pack_id: string;
  canonical: string;
  variant_code?: string;
  operator_id?: string;
}
