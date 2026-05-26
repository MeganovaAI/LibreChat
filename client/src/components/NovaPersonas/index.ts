/**
 * NovaPersonas chat-surface primitives — feature-flagged at the env level.
 * Vanilla LibreChat deployments leave NOVA_PERSONAS_ENABLED unset and see
 * the three components compiled out via the gating hook.
 */

export { SyntheticBanner } from './SyntheticBanner';
export { FlagButton } from './FlagButton';
export { RatingWidget } from './RatingWidget';
export { readSessionMetadata } from './sessionMetadata';
export { postFlag, postRating } from './portalClient';

/**
 * Read the deployment-level feature flag. When false, mount-point
 * patches in ChatView / Message render null.
 *
 * Set via NOVA_PERSONAS_ENABLED=true in the LibreChat container env.
 */
export function useNovaPersonasEnabled(): boolean {
  return import.meta.env.VITE_NOVA_PERSONAS_ENABLED === 'true';
}

export function getPortalBase(): string {
  return (import.meta.env.VITE_NOVA_PERSONAS_PORTAL_BASE as string) ?? '';
}
