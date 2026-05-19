import { readSessionMetadata } from '../sessionMetadata';
import type { NovaPersonasSessionMetadata } from 'librechat-data-provider';

describe('readSessionMetadata', () => {
  it('reads metadata directly from the session object when present', async () => {
    const session = {
      id: 'ses_1',
      metadata: { session_purpose: 'capture' } as NovaPersonasSessionMetadata,
    };
    const md = await readSessionMetadata(session, { portalBase: 'http://p' });
    expect(md.session_purpose).toBe('capture');
  });

  it('falls back to portal probe when metadata is absent (NO-A not deployed)', async () => {
    const session = { id: 'ses_2' };
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ session_purpose: 'training' }),
    });
    const md = await readSessionMetadata(session, {
      portalBase: 'http://p',
      fetcher,
    });
    expect(md.session_purpose).toBe('training');
    expect(fetcher).toHaveBeenCalledWith(
      'http://p/api/sessions/ses_2/metadata',
      expect.any(Object),
    );
  });

  it('returns empty object when fallback probe 404s', async () => {
    const session = { id: 'ses_3' };
    const fetcher = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    const md = await readSessionMetadata(session, {
      portalBase: 'http://p',
      fetcher,
    });
    expect(md).toEqual({});
  });
});
