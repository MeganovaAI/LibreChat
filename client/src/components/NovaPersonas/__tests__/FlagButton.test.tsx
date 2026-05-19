import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FlagButton } from '../FlagButton';

describe('FlagButton', () => {
  it('renders the flag affordance', () => {
    render(<FlagButton sessionId="ses_1" turnId={2} portalBase="http://p" />);
    expect(screen.getByRole('button', { name: /flag/i })).toBeInTheDocument();
  });

  it('opens a popover with 3 reason options on click', () => {
    render(<FlagButton sessionId="ses_1" turnId={2} portalBase="http://p" />);
    fireEvent.click(screen.getByRole('button', { name: /flag/i }));
    expect(screen.getByText(/real client wouldn't say this/i)).toBeInTheDocument();
    expect(screen.getByText(/doesn't fit case category/i)).toBeInTheDocument();
    expect(screen.getByText(/other/i)).toBeInTheDocument();
  });

  it('submits the chosen reason via the injected client', () => {
    const post = jest.fn().mockResolvedValue({ status: 'recorded' });
    render(
      <FlagButton
        sessionId="ses_1"
        turnId={5}
        portalBase="http://p"
        post={post}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /flag/i }));
    fireEvent.click(screen.getByText(/real client wouldn't say this/i));
    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        portalBase: 'http://p',
        sessionId: 'ses_1',
        turnId: 5,
        reasonType: 'realism',
      }),
    );
  });

  it('does NOT render in stealth mode', () => {
    const { container } = render(
      <FlagButton sessionId="ses_1" turnId={1} portalBase="http://p" stealthMode />,
    );
    expect(container.firstChild).toBeNull();
  });
});
