import React from 'react';
import { render, screen } from '@testing-library/react';
import { SyntheticBanner } from '../SyntheticBanner';

describe('SyntheticBanner', () => {
  it('renders when session_purpose is capture', () => {
    render(<SyntheticBanner metadata={{ session_purpose: 'capture' }} />);
    expect(screen.getByText(/synthetic training session/i)).toBeInTheDocument();
  });

  it('renders when session_purpose is training', () => {
    render(<SyntheticBanner metadata={{ session_purpose: 'training' }} />);
    expect(screen.getByText(/synthetic training session/i)).toBeInTheDocument();
  });

  it('does NOT render for normal customer sessions', () => {
    render(<SyntheticBanner metadata={{}} />);
    expect(screen.queryByText(/synthetic training session/i)).toBeNull();
  });

  it('does NOT render when stealth mode is active', () => {
    render(
      <SyntheticBanner
        metadata={{ session_purpose: 'capture' }}
        stealthMode={true}
      />,
    );
    expect(screen.queryByText(/synthetic training session/i)).toBeNull();
  });
});
