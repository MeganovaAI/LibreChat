const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const fetch = require('node-fetch');
const { logger } = require('@librechat/data-schemas');

/**
 * Nova OS upload bridge.
 *
 * When a teacher uploads a file via LibreChat's clip menu, this bridge
 * also POSTs the binary to nova-os so the file lives in BOTH stores:
 *
 *   - LibreChat (existing): OCR'd text is injected as chat-message
 *     context. Disposable per-conversation.
 *
 *   - nova-os (this bridge): persisted at users/<teacher>/<filename>,
 *     auto-indexed into user_<teacher> knowledge collection. Reachable
 *     from any future chat with the same agent (semantic retrieval +
 *     document_search). Visible to admin (principal) for cross-teacher
 *     aggregation.
 *
 * Identity: bridge fires only for OIDC users (provider === 'openid').
 * The user's nova-os JWT (from the OIDC tokenset stored in
 * req.session.openidTokens.idToken — see AuthService.setOpenIDAuthTokens)
 * is forwarded as the Bearer token, so server-side authz scopes
 * correctly to that teacher. No service-account impersonation.
 *
 * Local-auth users (provider === 'local') are skipped — they have no
 * mapping to a nova-os identity. For the school deployment that wants
 * the bridge always-on, set ALLOW_REGISTRATION=false on the LibreChat
 * env so every user must come through Nova OS SSO.
 *
 * Failure mode: best-effort. Network errors, 4xx/5xx responses, missing
 * env, missing tokens — all logged at WARN and swallowed. The user's
 * primary chat upload is never blocked by a bridge failure.
 */

/**
 * @returns {boolean} true if the bridge is configured + the user is
 *   eligible. False (silent) otherwise. Use this to decide whether to
 *   bother reading the file off disk before posting.
 *
 * Env is read at call time (not module load) so a tenant operator can
 * flip NOVA_OS_BRIDGE_URL without restarting LibreChat — same shape as
 * other LibreChat env knobs that the runtime consults lazily.
 */
function bridgeApplies(req) {
  if (!process.env.NOVA_OS_BRIDGE_URL) {
    return false;
  }
  if (!req?.user) {
    return false;
  }
  if (req.user.provider !== 'openid') {
    return false;
  }
  if (!req.user.openidId) {
    return false;
  }
  const token = req?.session?.openidTokens?.idToken;
  if (!token) {
    return false;
  }
  return true;
}

/**
 * Fire-and-forget POST to nova-os. Returns a Promise but the caller
 * should NOT await it — let it complete after the response is sent so
 * the user's chat-upload latency is unchanged.
 *
 * @param {object} args
 * @param {object} args.req - Express request (req.user, req.session)
 * @param {string} args.filePath - absolute path on disk (multer's req.file.path)
 * @param {string} args.filename - original filename for the multipart field
 * @param {string} [args.contentType] - MIME type; default application/octet-stream
 * @returns {Promise<{status: 'ok'|'skipped'|'error', detail?: string}>}
 */
async function bridgeUpload({ req, filePath, filename, contentType }) {
  if (!bridgeApplies(req)) {
    return { status: 'skipped', detail: 'bridge not applicable for this user/config' };
  }

  const userId = req.user.openidId;
  const token = req.session.openidTokens.idToken;
  // The collection ID convention is "user_<uuid>" — must match what
  // nova-os's authz scope (scope.OwnCollectionID) computes for the same
  // user. Forcing it here via the form field means the upload lands in
  // the right knowledge collection regardless of how the path resolves.
  const collection = `user_${userId}`;
  // URL: /api/documents/upload/ (trailing slash → empty wildcard).
  // CRITICAL: do NOT send "users/<id>" in the URL path. Nova-os's
  // assertUserVisiblePath rejects any non-admin caller that posts to
  // a path beginning with the internal "users/" namespace (it's the
  // server's reserved tag, not a client-addressable directory). Sending
  // empty path triggers RewritePath("") which for non-admin returns
  // "users/<scope.UserID>" automatically — so the file lands at
  // users/<teacher_id>/<filename> via server-side rewriting, exactly
  // like the dashboard's Documents page upload after the Phase 1A fix.
  // Bug bosong-2026-05-14: prior shape posted to /api/documents/upload/users/<id>
  // and got 403 "access denied" from assertUserVisiblePath.
  const safeName = path.basename(filename || 'file');
  const baseUrl = process.env.NOVA_OS_BRIDGE_URL;
  const target = `${baseUrl.replace(/\/+$/, '')}/api/documents/upload/`;

  let stream;
  try {
    stream = fs.createReadStream(filePath);
  } catch (err) {
    logger.warn(`[novaOsBridge] cannot open ${filePath}: ${err.message}`);
    return { status: 'error', detail: `open file: ${err.message}` };
  }

  const form = new FormData();
  form.append('file', stream, {
    filename: safeName,
    contentType: contentType || 'application/octet-stream',
  });
  form.append('collection', collection);

  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        ...form.getHeaders(),
      },
      body: form,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.warn(
        `[novaOsBridge] ${target} → HTTP ${res.status}: ${body.slice(0, 200)}`,
      );
      return { status: 'error', detail: `HTTP ${res.status}` };
    }
    logger.info(
      `[novaOsBridge] uploaded ${safeName} for user ${userId} → ${target} (HTTP ${res.status})`,
    );
    return { status: 'ok' };
  } catch (err) {
    logger.warn(`[novaOsBridge] POST failed for ${safeName}: ${err.message}`);
    return { status: 'error', detail: err.message };
  }
}

module.exports = {
  bridgeApplies,
  bridgeUpload,
};
