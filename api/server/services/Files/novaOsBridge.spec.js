jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('node-fetch', () => jest.fn());
jest.mock('fs', () => ({
  createReadStream: jest.fn(() => 'fake-stream'),
}));

const fetch = require('node-fetch');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const ORIG_URL = process.env.NOVA_OS_BRIDGE_URL;
const ORIG_SECRET = process.env.NOVA_OS_JWT_SECRET;

// Module reads env lazily via process.env in each call, so flipping env
// in beforeEach is sufficient — no resetModules needed.
const novaOsBridge = require('./novaOsBridge');

const TEST_SECRET = 'test-shared-secret-12345678';

function oidcReq(overrides = {}) {
  return {
    user: {
      provider: 'openid',
      openidId: 'teacher-uuid-123',
      email: 'teacher@example.com',
    },
    ...overrides,
  };
}

afterEach(() => {
  if (ORIG_URL === undefined) {
    delete process.env.NOVA_OS_BRIDGE_URL;
  } else {
    process.env.NOVA_OS_BRIDGE_URL = ORIG_URL;
  }
  if (ORIG_SECRET === undefined) {
    delete process.env.NOVA_OS_JWT_SECRET;
  } else {
    process.env.NOVA_OS_JWT_SECRET = ORIG_SECRET;
  }
  jest.clearAllMocks();
});

describe('bridgeApplies', () => {
  it('returns false when NOVA_OS_BRIDGE_URL is unset', () => {
    delete process.env.NOVA_OS_BRIDGE_URL;
    process.env.NOVA_OS_JWT_SECRET = TEST_SECRET;
    expect(novaOsBridge.bridgeApplies(oidcReq())).toBe(false);
  });

  it('returns false when NOVA_OS_JWT_SECRET is unset (cannot mint)', () => {
    process.env.NOVA_OS_BRIDGE_URL = 'https://kch.os.meganovaai.com';
    delete process.env.NOVA_OS_JWT_SECRET;
    expect(novaOsBridge.bridgeApplies(oidcReq())).toBe(false);
  });

  it('returns false for local-auth users even when env is set', () => {
    process.env.NOVA_OS_BRIDGE_URL = 'https://kch.os.meganovaai.com';
    process.env.NOVA_OS_JWT_SECRET = TEST_SECRET;
    const req = oidcReq({ user: { provider: 'local', openidId: null } });
    expect(novaOsBridge.bridgeApplies(req)).toBe(false);
  });

  it('returns false when openidId is missing', () => {
    process.env.NOVA_OS_BRIDGE_URL = 'https://kch.os.meganovaai.com';
    process.env.NOVA_OS_JWT_SECRET = TEST_SECRET;
    const req = oidcReq({ user: { provider: 'openid', openidId: null } });
    expect(novaOsBridge.bridgeApplies(req)).toBe(false);
  });

  it('returns true for OIDC user with both env + openidId', () => {
    process.env.NOVA_OS_BRIDGE_URL = 'https://kch.os.meganovaai.com';
    process.env.NOVA_OS_JWT_SECRET = TEST_SECRET;
    expect(novaOsBridge.bridgeApplies(oidcReq())).toBe(true);
  });
});

describe('bridgeUpload', () => {
  beforeEach(() => {
    process.env.NOVA_OS_BRIDGE_URL = 'https://kch.os.meganovaai.com';
    process.env.NOVA_OS_JWT_SECRET = TEST_SECRET;
  });

  it('skips silently when not applicable', async () => {
    const req = oidcReq({ user: { provider: 'local', email: 'x@y.z' } });
    const res = await novaOsBridge.bridgeUpload({
      req,
      filePath: '/tmp/x',
      filename: 'x.csv',
    });
    expect(res.status).toBe('skipped');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('POSTs to /api/documents/upload/ with a freshly-minted user JWT', async () => {
    fetch.mockResolvedValue({ ok: true, status: 200 });
    const res = await novaOsBridge.bridgeUpload({
      req: oidcReq(),
      filePath: '/tmp/grades.csv',
      filename: 'grades.csv',
      contentType: 'text/csv',
    });
    expect(res.status).toBe('ok');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe('https://kch.os.meganovaai.com/api/documents/upload/');
    expect(url).not.toContain('/users/');
    expect(opts.method).toBe('POST');
    // Bearer token should be a freshly-minted JWT signed with our shared secret
    expect(opts.headers.Authorization).toMatch(/^Bearer eyJ/);
    const token = opts.headers.Authorization.replace(/^Bearer /, '');
    const decoded = jwt.verify(token, TEST_SECRET, { algorithms: ['HS256'] });
    expect(decoded.sub).toBe('teacher-uuid-123');
    expect(decoded.email).toBe('teacher@example.com');
    expect(decoded.role).toBe('employee');
  });

  it('strips a trailing slash on NOVA_OS_BRIDGE_URL', async () => {
    process.env.NOVA_OS_BRIDGE_URL = 'https://kch.os.meganovaai.com/';
    fetch.mockResolvedValue({ ok: true, status: 200 });
    await novaOsBridge.bridgeUpload({
      req: oidcReq(),
      filePath: '/tmp/x.csv',
      filename: 'x.csv',
    });
    const [url] = fetch.mock.calls[0];
    expect(url).not.toContain('//api/');
    expect(url).toBe('https://kch.os.meganovaai.com/api/documents/upload/');
  });

  it('returns error status without throwing on HTTP 401 (bad secret)', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('{"error":"invalid token"}'),
    });
    const res = await novaOsBridge.bridgeUpload({
      req: oidcReq(),
      filePath: '/tmp/x.csv',
      filename: 'x.csv',
    });
    expect(res.status).toBe('error');
    expect(res.detail).toBe('HTTP 401');
  });

  it('returns error status without throwing on network failure', async () => {
    fetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await novaOsBridge.bridgeUpload({
      req: oidcReq(),
      filePath: '/tmp/x.csv',
      filename: 'x.csv',
    });
    expect(res.status).toBe('error');
    expect(res.detail).toContain('ECONNREFUSED');
  });

  it('basenames the filename so a malicious "../../etc/passwd" never propagates', async () => {
    fetch.mockResolvedValue({ ok: true, status: 200 });
    await novaOsBridge.bridgeUpload({
      req: oidcReq(),
      filePath: '/tmp/legit.csv',
      filename: '../../etc/passwd',
    });
    expect(fs.createReadStream).toHaveBeenCalledWith('/tmp/legit.csv');
  });
});
