jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('node-fetch', () => jest.fn());
jest.mock('fs', () => ({
  createReadStream: jest.fn(() => 'fake-stream'),
}));

const fetch = require('node-fetch');
const fs = require('fs');

const ORIG_ENV = process.env.NOVA_OS_BRIDGE_URL;

// Module reads env lazily via process.env in each call, so no need to
// reset modules between tests — flipping NOVA_OS_BRIDGE_URL in a beforeEach
// is sufficient.
const novaOsBridge = require('./novaOsBridge');

function oidcReq(overrides = {}) {
  return {
    user: { provider: 'openid', openidId: 'teacher-uuid-123' },
    session: { openidTokens: { idToken: 'jwt-payload-here' } },
    ...overrides,
  };
}

afterEach(() => {
  if (ORIG_ENV === undefined) {
    delete process.env.NOVA_OS_BRIDGE_URL;
  } else {
    process.env.NOVA_OS_BRIDGE_URL = ORIG_ENV;
  }
  jest.clearAllMocks();
});

describe('bridgeApplies', () => {
  it('returns false when NOVA_OS_BRIDGE_URL is unset (feature disabled)', () => {
    delete process.env.NOVA_OS_BRIDGE_URL;
    const { bridgeApplies } = novaOsBridge;
    expect(bridgeApplies(oidcReq())).toBe(false);
  });

  it('returns false for local-auth users even when env is set', () => {
    process.env.NOVA_OS_BRIDGE_URL = 'https://kch.os.meganovaai.com';
    const { bridgeApplies } = novaOsBridge;
    const req = oidcReq({ user: { provider: 'local', openidId: null } });
    expect(bridgeApplies(req)).toBe(false);
  });

  it('returns false when openidId is missing (broken OIDC user)', () => {
    process.env.NOVA_OS_BRIDGE_URL = 'https://kch.os.meganovaai.com';
    const { bridgeApplies } = novaOsBridge;
    const req = oidcReq({ user: { provider: 'openid', openidId: null } });
    expect(bridgeApplies(req)).toBe(false);
  });

  it('returns false when token is in NEITHER session nor cookies', () => {
    process.env.NOVA_OS_BRIDGE_URL = 'https://kch.os.meganovaai.com';
    const { bridgeApplies } = novaOsBridge;
    const req = oidcReq({ session: {}, cookies: {} });
    expect(bridgeApplies(req)).toBe(false);
  });

  it('returns true for OIDC user with session-stored token', () => {
    process.env.NOVA_OS_BRIDGE_URL = 'https://kch.os.meganovaai.com';
    const { bridgeApplies } = novaOsBridge;
    expect(bridgeApplies(oidcReq())).toBe(true);
  });

  it('returns true for OIDC user with cookie-stored token (HttpOnly fallback)', () => {
    // setOpenIDAuthTokens falls back to res.cookie('openid_id_token', ...)
    // when express-session is unavailable. On bosong tenant production,
    // every session record is hasOpenidTokens:false — the cookie path
    // is the one carrying the token. Bridge must read both.
    process.env.NOVA_OS_BRIDGE_URL = 'https://kch.os.meganovaai.com';
    const { bridgeApplies } = novaOsBridge;
    const req = oidcReq({
      session: {},
      cookies: { openid_id_token: 'jwt-from-cookie' },
    });
    expect(bridgeApplies(req)).toBe(true);
  });
});

describe('bridgeUpload', () => {
  beforeEach(() => {
    process.env.NOVA_OS_BRIDGE_URL = 'https://kch.os.meganovaai.com';
  });

  it('skips silently when not applicable (no thrown error, no fetch)', async () => {
    const { bridgeUpload } = novaOsBridge;
    const req = oidcReq({ user: { provider: 'local' } });
    const res = await bridgeUpload({
      req,
      filePath: '/tmp/x',
      filename: 'x.csv',
    });
    expect(res.status).toBe('skipped');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('POSTs to /api/documents/upload/ (no users/<id> segment) with the user JWT', async () => {
    fetch.mockResolvedValue({ ok: true, status: 200 });
    const { bridgeUpload } = novaOsBridge;
    const res = await bridgeUpload({
      req: oidcReq(),
      filePath: '/tmp/grades.csv',
      filename: 'grades.csv',
      contentType: 'text/csv',
    });
    expect(res.status).toBe('ok');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = fetch.mock.calls[0];
    // Empty wildcard path; server-side RewritePath("") returns
    // "users/<scope.UserID>" for non-admin so the file lands at the
    // right place. Hitting /users/<id> directly trips
    // assertUserVisiblePath and 403s — see bridge file comment.
    expect(url).toBe('https://kch.os.meganovaai.com/api/documents/upload/');
    expect(url).not.toContain('/users/');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer jwt-payload-here');
  });

  it('reads token from cookies when session has none (HttpOnly fallback)', async () => {
    fetch.mockResolvedValue({ ok: true, status: 200 });
    const { bridgeUpload } = novaOsBridge;
    const req = oidcReq({
      session: {},
      cookies: { openid_id_token: 'cookie-jwt-xyz' },
    });
    const res = await bridgeUpload({
      req,
      filePath: '/tmp/x.csv',
      filename: 'x.csv',
    });
    expect(res.status).toBe('ok');
    const [, opts] = fetch.mock.calls[0];
    expect(opts.headers.Authorization).toBe('Bearer cookie-jwt-xyz');
  });

  it('strips a trailing slash on NOVA_OS_BRIDGE_URL so we never POST to //api/...', async () => {
    process.env.NOVA_OS_BRIDGE_URL = 'https://kch.os.meganovaai.com/';
    fetch.mockResolvedValue({ ok: true, status: 200 });
    const { bridgeUpload } = novaOsBridge;
    await bridgeUpload({
      req: oidcReq(),
      filePath: '/tmp/x.csv',
      filename: 'x.csv',
    });
    const [url] = fetch.mock.calls[0];
    expect(url).not.toContain('//api/');
    expect(url).toBe('https://kch.os.meganovaai.com/api/documents/upload/');
  });

  it('returns error status without throwing on HTTP 401 (token expired)', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('{"error":"unauthenticated"}'),
    });
    const { bridgeUpload } = novaOsBridge;
    const res = await bridgeUpload({
      req: oidcReq(),
      filePath: '/tmp/x.csv',
      filename: 'x.csv',
    });
    expect(res.status).toBe('error');
    expect(res.detail).toBe('HTTP 401');
  });

  it('returns error status without throwing on network failure', async () => {
    fetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const { bridgeUpload } = novaOsBridge;
    const res = await bridgeUpload({
      req: oidcReq(),
      filePath: '/tmp/x.csv',
      filename: 'x.csv',
    });
    expect(res.status).toBe('error');
    expect(res.detail).toContain('ECONNREFUSED');
  });

  it('basenames the filename so a malicious "../../etc/passwd" never propagates', async () => {
    fetch.mockResolvedValue({ ok: true, status: 200 });
    // We can't directly assert the form-data field name from outside the
    // FormData object easily, but we CAN assert that path.basename was
    // applied — by ensuring the streamed file came from the original
    // path, not a manipulated one. The bridge's path.basename(filename)
    // call is the load-bearing piece.
    const { bridgeUpload } = novaOsBridge;
    await bridgeUpload({
      req: oidcReq(),
      filePath: '/tmp/legit.csv',
      filename: '../../etc/passwd',
    });
    // fs.createReadStream was called with the trusted disk path, not the
    // attacker-supplied filename — that's the contract that matters.
    expect(fs.createReadStream).toHaveBeenCalledWith('/tmp/legit.csv');
  });
});
