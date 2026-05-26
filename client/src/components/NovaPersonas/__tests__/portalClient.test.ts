import { postFlag, postRating } from '../portalClient';

describe('postFlag', () => {
  it('POSTs the documented payload shape', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'recorded' }),
    });
    await postFlag({
      portalBase: 'http://p',
      sessionId: 'ses_1',
      turnId: 3,
      reasonType: 'realism',
      note: 'too anxious',
      operatorId: 'sarah.lawyer',
      fetcher,
    });
    expect(fetcher).toHaveBeenCalledWith(
      'http://p/api/sessions/ses_1/flags',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body).toEqual({
      turn_id: 3,
      reason_type: 'realism',
      note: 'too anxious',
      operator_id: 'sarah.lawyer',
    });
  });
});

describe('postRating', () => {
  it('POSTs rating + optional note + identity', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'recorded' }),
    });
    await postRating({
      portalBase: 'http://p',
      sessionId: 'ses_2',
      rating: 4,
      note: 'natural pacing',
      packId: 'legal-demo',
      canonical: 'p1-1-mei-lin-chen-pgwp-anxious',
      variantCode: '',
      fetcher,
    });
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.rating).toBe(4);
    expect(body.pack_id).toBe('legal-demo');
  });
});
