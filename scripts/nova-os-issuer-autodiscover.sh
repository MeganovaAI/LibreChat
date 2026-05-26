#!/bin/sh
# nova-os-issuer-autodiscover.sh — derive OPENID_ISSUER from Nova OS at boot
#
# Background (nova-os#521):
# OIDC spec requires the issuer string returned by /.well-known/openid-configuration
# to byte-match the issuer the client (LibreChat) expects via OPENID_ISSUER. When
# Nova OS and LibreChat read these values from independent sources (NOVA_OS_PUBLIC_URL
# vs OPENID_ISSUER env vars), the moment they drift the OIDC strategy fails to
# register and /oauth/openid errors out. Partners have hit this every time their
# deployment URL doesn't match the marketplace bundle's default.
#
# Fix: before LibreChat starts, this script fetches Nova OS's discovery doc,
# extracts the issuer field, and exports it as OPENID_ISSUER. Nova OS becomes
# the single source of truth; operators set ONE env var (NOVA_OS_PUBLIC_URL on
# the nova-os side) and LibreChat picks it up automatically.
#
# Inputs:
#   NOVA_OS_HOST  — base URL of Nova OS reachable from inside this container
#                   (e.g. https://host.docker.internal:8443 for local Docker,
#                   https://nova.partner.com for partner deployments). MUST be
#                   set; this script fails closed if absent.
#
# Outputs:
#   OPENID_ISSUER — exported on success, matching the issuer Nova OS advertises.
#
# Failure modes (all fail-loud with non-zero exit):
#   - NOVA_OS_HOST unset
#   - Nova OS unreachable / discovery doc fetch fails
#   - Discovery doc missing the `issuer` field

set -eu

# Allow operator override: if OPENID_ISSUER is already set in the env and
# NOVA_OS_OIDC_AUTODISCOVER=0, skip the probe. Useful for partners running
# a static identity-provider URL behind their own reverse proxy.
if [ "${NOVA_OS_OIDC_AUTODISCOVER:-1}" = "0" ]; then
  echo "[nova-os-issuer-autodiscover] autodiscover disabled via NOVA_OS_OIDC_AUTODISCOVER=0; using OPENID_ISSUER=${OPENID_ISSUER:-<unset>}" >&2
  exec "$@"
fi

if [ -z "${NOVA_OS_HOST:-}" ]; then
  echo "[nova-os-issuer-autodiscover] FATAL: NOVA_OS_HOST is unset. Set it to the Nova OS base URL reachable from this container (e.g. https://host.docker.internal:8443 for local Docker dev, https://nova.example.com for partner deployments)." >&2
  exit 1
fi

URL="${NOVA_OS_HOST%/}/.well-known/openid-configuration"
echo "[nova-os-issuer-autodiscover] probing $URL" >&2

# Node-based fetch — every LibreChat image ships node, no need to add curl
# or jq. Disable TLS verification because partner deployments commonly use
# self-signed certs at this layer (matches the existing
# NODE_TLS_REJECT_UNAUTHORIZED=0 default in nova-librechat).
ISSUER=$(node --no-warnings -e "
const url = '$URL';
fetch(url)
  .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .then(d => {
    if (!d.issuer) { console.error('no issuer field in discovery doc'); process.exit(2); }
    process.stdout.write(d.issuer);
  })
  .catch(e => { console.error('fetch failed:', e.message); process.exit(3); });
" 2>&1) || {
  echo "[nova-os-issuer-autodiscover] FATAL: could not derive issuer from $URL — $ISSUER" >&2
  exit 1
}

if [ -z "$ISSUER" ]; then
  echo "[nova-os-issuer-autodiscover] FATAL: Nova OS returned empty issuer" >&2
  exit 1
fi

echo "[nova-os-issuer-autodiscover] derived OPENID_ISSUER=$ISSUER" >&2
export OPENID_ISSUER="$ISSUER"

# Also derive AUTHORIZATION_URL etc. when they're not already set, so the
# legacy LibreChat config that hard-codes /oauth/openid keeps working too.
if [ -z "${OPENID_AUTHORIZATION_URL:-}" ]; then
  export OPENID_AUTHORIZATION_URL="${ISSUER%/}/oauth/authorize"
fi

exec "$@"
