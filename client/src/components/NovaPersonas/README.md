# NovaPersonas — chat-surface primitives for the nova-personas framework

Three components feature-flagged via `VITE_NOVA_PERSONAS_ENABLED=true`:

- **SyntheticBanner** — sticky banner shown when `session.metadata.session_purpose ∈ {capture, training}`
- **FlagButton** — per-turn flag affordance, POSTs to portal `/api/sessions/:id/flags`
- **RatingWidget** — end-of-session 1-5 star modal, POSTs to portal `/api/sessions/:id/rating`

Shipped as part of the [`MeganovaAI/LibreChat`](https://github.com/MeganovaAI/LibreChat) fork so deployments under Meganova-managed nova-os stacks get them without forking again.

## Feature flag

```bash
# In LibreChat container env
VITE_NOVA_PERSONAS_ENABLED=true
VITE_NOVA_PERSONAS_PORTAL_BASE=http://nova-personas-portal:9200
```

When the flag is `false` or unset, all three components render `null` and the chat surface is identical to vanilla LibreChat.

## Mount points

| Component | File | Trigger |
|---|---|---|
| `<SyntheticBanner>` | `Chat/ChatView.tsx` | Top of message list when metadata says synthetic |
| `<FlagButton>` | `Chat/Messages/HoverButtons.tsx` | Each assistant turn (via HoverButtons) |
| `<RatingWidget>` | `Chat/ChatView.tsx` | Conversation close / unmount |

## NO-A dependency + fallback

Components read `session.metadata.session_purpose` to decide whether to render. Until nova-os ships issue NO-A (session-metadata pass-through), `sessionMetadata.ts` falls back to a per-chat-open probe of `${portalBase}/api/sessions/:id/metadata` — adds one round-trip; otherwise functional.

## Tests

```bash
npx jest client/src/components/NovaPersonas/__tests__/
```

17 tests cover all 3 components + portalClient + sessionMetadata. Coverage gate: ≥80% per the nova-personas master spec § 4.5.

## Upstream-rebase safety

Mount-point patches in `Chat/ChatView.tsx` + `Chat/Messages/HoverButtons.tsx` are minimal and guarded by `useNovaPersonasEnabled()`. When rebasing the fork against `danny-avila/LibreChat`, conflicts here are expected on major LibreChat UI re-organizations — the per-patch surface is small enough to re-apply by hand.

## Cross-references

- nova-personas master spec: `MeganovaAI/nova-personas docs/superpowers/specs/2026-05-19-nova-personas-master-design.md` § 2.4 (Plane C — revised 2026-05-19)
- Portal API contract: `MeganovaAI/nova-personas docs/expert-portal-ui.md` + `docs/ui-requirements.md`
- Proposed nova-os issue (NO-A): `MeganovaAI/nova-personas docs/superpowers/specs/proposed-nova-os-issues/NO-A-session-metadata-passthrough.md`
