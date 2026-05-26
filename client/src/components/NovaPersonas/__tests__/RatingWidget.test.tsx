import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { RatingWidget } from '../RatingWidget';

describe('RatingWidget', () => {
  it('renders 5 stars + skip + submit when open', () => {
    render(
      <RatingWidget
        open
        sessionId="ses_1"
        portalBase="http://p"
        packId="legal-demo"
        canonical="p1"
      />,
    );
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    expect(screen.getByRole('button', { name: /skip/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
  });

  it('submits the rating + note', async () => {
    const post = jest.fn().mockResolvedValue({ status: 'recorded' });
    render(
      <RatingWidget
        open
        sessionId="ses_2"
        portalBase="http://p"
        packId="legal-demo"
        canonical="p1"
        post={post}
      />,
    );
    fireEvent.click(screen.getAllByRole('radio')[3]); // 4 stars
    fireEvent.change(screen.getByPlaceholderText(/one thing that stood out/i), {
      target: { value: 'tax-gap surfaced naturally' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await screen.findByText(/thanks/i);
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'ses_2',
        rating: 4,
        note: 'tax-gap surfaced naturally',
        pack_id: 'legal-demo',
      }),
    );
  });

  it('skip closes without posting', () => {
    const post = jest.fn();
    const onClose = jest.fn();
    render(
      <RatingWidget
        open
        sessionId="ses_3"
        portalBase="http://p"
        packId="x"
        canonical="y"
        post={post}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    expect(post).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('does NOT render when not open', () => {
    const { container } = render(
      <RatingWidget
        open={false}
        sessionId="x"
        portalBase="http://p"
        packId="y"
        canonical="z"
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
