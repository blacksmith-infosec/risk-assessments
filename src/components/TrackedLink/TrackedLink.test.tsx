import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TrackedLink } from './index';
import * as analytics from '../../utils/analytics';

// Mock the analytics module
vi.mock('../../utils/analytics', () => ({
  trackExternalLink: vi.fn()
}));

describe('TrackedLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Rendering', () => {
    it('renders link with href', () => {
      render(
        <TrackedLink href="https://example.com">
          Visit Example
        </TrackedLink>
      );

      const link = screen.getByRole('link', { name: 'Visit Example' });
      expect(link.getAttribute('href')).toBe('https://example.com');
    });

    it('renders with text children', () => {
      render(
        <TrackedLink href="https://example.com">
          Click Here
        </TrackedLink>
      );

      expect(screen.getByText('Click Here')).toBeDefined();
    });

    it('renders with custom className', () => {
      render(
        <TrackedLink href="https://example.com" className="custom-link">
          Link
        </TrackedLink>
      );

      const link = screen.getByRole('link');
      expect(link.className).toBe('custom-link');
    });

    it('renders with target="_blank"', () => {
      render(
        <TrackedLink href="https://example.com" target="_blank">
          External Link
        </TrackedLink>
      );

      const link = screen.getByRole('link');
      expect(link.getAttribute('target')).toBe('_blank');
    });

    it('renders with rel="noopener noreferrer"', () => {
      render(
        <TrackedLink href="https://example.com" rel="noopener noreferrer">
          Secure Link
        </TrackedLink>
      );

      const link = screen.getByRole('link');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('renders with title attribute', () => {
      render(
        <TrackedLink href="https://example.com" title="Go to Example">
          Link
        </TrackedLink>
      );

      const link = screen.getByRole('link');
      expect(link.getAttribute('title')).toBe('Go to Example');
    });
  });

  describe('Click Tracking', () => {
    it('tracks link click with URL', () => {
      render(
        <TrackedLink href="https://example.com">
          Visit Site
        </TrackedLink>
      );

      const link = screen.getByRole('link');
      fireEvent.click(link);

      expect(analytics.trackExternalLink).toHaveBeenCalledTimes(1);
      expect(analytics.trackExternalLink).toHaveBeenCalledWith('https://example.com', 'Visit Site');
    });

    it('tracks link click with string children', () => {
      render(
        <TrackedLink href="https://github.com">
          GitHub
        </TrackedLink>
      );

      const link = screen.getByRole('link');
      fireEvent.click(link);

      expect(analytics.trackExternalLink).toHaveBeenCalledWith('https://github.com', 'GitHub');
    });

    it('tracks link click with JSX children (linkText undefined)', () => {
      render(
        <TrackedLink href="https://example.com">
          <span>Click</span> <span>Here</span>
        </TrackedLink>
      );

      const link = screen.getByRole('link');
      fireEvent.click(link);

      expect(analytics.trackExternalLink).toHaveBeenCalledWith('https://example.com', undefined);
    });

    it('tracks click for relative URLs', () => {
      render(
        <TrackedLink href="/about">
          About Us
        </TrackedLink>
      );

      const link = screen.getByRole('link');
      fireEvent.click(link);

      expect(analytics.trackExternalLink).toHaveBeenCalledWith('/about', 'About Us');
    });

    it('tracks click for mailto links', () => {
      render(
        <TrackedLink href="mailto:test@example.com">
          Email Us
        </TrackedLink>
      );

      const link = screen.getByRole('link');
      fireEvent.click(link);

      expect(analytics.trackExternalLink).toHaveBeenCalledWith('mailto:test@example.com', 'Email Us');
    });
  });

  describe('Click Handler', () => {
    it('calls onClick handler when provided', () => {
      const handleClick = vi.fn();

      render(
        <TrackedLink href="https://example.com" onClick={handleClick}>
          Click Me
        </TrackedLink>
      );

      const link = screen.getByRole('link');
      fireEvent.click(link);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('calls onClick handler with event object', () => {
      const handleClick = vi.fn();

      render(
        <TrackedLink href="https://example.com" onClick={handleClick}>
          Click Me
        </TrackedLink>
      );

      const link = screen.getByRole('link');
      fireEvent.click(link);

      expect(handleClick).toHaveBeenCalledWith(expect.objectContaining({
        type: 'click'
      }));
    });

    it('tracks click before calling onClick handler', () => {
      const callOrder: string[] = [];

      const handleClick = vi.fn(() => {
        callOrder.push('onClick');
      });

      vi.mocked(analytics.trackExternalLink).mockImplementation(() => {
        callOrder.push('track');
      });

      render(
        <TrackedLink href="https://example.com" onClick={handleClick}>
          Click Me
        </TrackedLink>
      );

      const link = screen.getByRole('link');
      fireEvent.click(link);

      expect(callOrder).toEqual(['track', 'onClick']);
    });

    it('works without onClick handler', () => {
      render(
        <TrackedLink href="https://example.com">
          Click Me
        </TrackedLink>
      );

      const link = screen.getByRole('link');
      fireEvent.click(link);

      expect(analytics.trackExternalLink).toHaveBeenCalledTimes(1);
    });
  });

  describe('Multiple Clicks', () => {
    it('tracks multiple clicks', () => {
      render(
        <TrackedLink href="https://example.com">
          Click Me
        </TrackedLink>
      );

      const link = screen.getByRole('link');
      fireEvent.click(link);
      fireEvent.click(link);
      fireEvent.click(link);

      expect(analytics.trackExternalLink).toHaveBeenCalledTimes(3);
    });

    it('calls onClick handler multiple times', () => {
      const handleClick = vi.fn();

      render(
        <TrackedLink href="https://example.com" onClick={handleClick}>
          Click Me
        </TrackedLink>
      );

      const link = screen.getByRole('link');
      fireEvent.click(link);
      fireEvent.click(link);

      expect(handleClick).toHaveBeenCalledTimes(2);
    });
  });

  describe('Complex Children', () => {
    it('renders with JSX children', () => {
      render(
        <TrackedLink href="https://example.com">
          <span>Icon</span>
          <span>Text</span>
        </TrackedLink>
      );

      expect(screen.getByText('Icon')).toBeDefined();
      expect(screen.getByText('Text')).toBeDefined();
    });

    it('renders with emoji and text', () => {
      render(
        <TrackedLink href="https://github.com">
          📊 View Report →
        </TrackedLink>
      );

      expect(screen.getByText('📊 View Report →')).toBeDefined();
    });

    it('tracks click with complex children', () => {
      render(
        <TrackedLink href="https://example.com">
          <span className="icon">🔗</span>
          <span>External</span>
        </TrackedLink>
      );

      const link = screen.getByRole('link');
      fireEvent.click(link);

      expect(analytics.trackExternalLink).toHaveBeenCalledWith('https://example.com', undefined);
    });
  });

  describe('External Link Patterns', () => {
    it('tracks GitHub issue link', () => {
      render(
        <TrackedLink
          href="https://github.com/blacksmithinfosec/risk-assessments/issues"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </TrackedLink>
      );

      const link = screen.getByRole('link');
      fireEvent.click(link);

      expect(analytics.trackExternalLink).toHaveBeenCalledWith(
        'https://github.com/blacksmithinfosec/risk-assessments/issues',
        'GitHub'
      );
    });

    it('tracks company website link with UTM params', () => {
      render(
        <TrackedLink
          href="https://blacksmithinfosec.com/?utm_source=risk-assessment-tool"
          target="_blank"
          rel="noopener noreferrer"
        >
          Blacksmith InfoSec
        </TrackedLink>
      );

      const link = screen.getByRole('link');
      fireEvent.click(link);

      expect(analytics.trackExternalLink).toHaveBeenCalledWith(
        'https://blacksmithinfosec.com/?utm_source=risk-assessment-tool',
        'Blacksmith InfoSec'
      );
    });

    it('tracks security headers external report link', () => {
      render(
        <TrackedLink
          href="https://securityheaders.com/?q=test.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          Full header analysis ↗
        </TrackedLink>
      );

      const link = screen.getByRole('link');
      fireEvent.click(link);

      expect(analytics.trackExternalLink).toHaveBeenCalledWith(
        'https://securityheaders.com/?q=test.com',
        'Full header analysis ↗'
      );
    });
  });

  describe('Edge Cases', () => {
    it('handles empty href', () => {
      render(
        <TrackedLink href="">
          Empty Link
        </TrackedLink>
      );

      // Empty href is not considered accessible, so use getByText
      const link = screen.getByText('Empty Link');
      fireEvent.click(link);

      expect(analytics.trackExternalLink).toHaveBeenCalledWith('', 'Empty Link');
    });

    it('handles hash links', () => {
      render(
        <TrackedLink href="#section">
          Jump to Section
        </TrackedLink>
      );

      const link = screen.getByRole('link');
      fireEvent.click(link);

      expect(analytics.trackExternalLink).toHaveBeenCalledWith('#section', 'Jump to Section');
    });

    it('passes through all anchor HTML attributes', () => {
      render(
        <TrackedLink
          href="https://example.com"
          id="custom-id"
          data-testid="custom-test-id"
          aria-label="Custom label"
        >
          Link
        </TrackedLink>
      );

      const link = screen.getByRole('link');
      expect(link.getAttribute('id')).toBe('custom-id');
      expect(link.getAttribute('data-testid')).toBe('custom-test-id');
      expect(link.getAttribute('aria-label')).toBe('Custom label');
    });

    it('handles number children (edge case)', () => {
      render(
        <TrackedLink href="https://example.com">
          {42}
        </TrackedLink>
      );

      const link = screen.getByRole('link');
      fireEvent.click(link);

      // Number children are not strings, so linkText should be undefined
      expect(analytics.trackExternalLink).toHaveBeenCalledWith('https://example.com', undefined);
    });

    it('ignores trackingProperties parameter', () => {
      // trackingProperties is accepted but not used (for future extensibility)
      render(
        <TrackedLink
          href="https://example.com"
          trackingProperties={{ category: 'external', section: 'footer' }}
        >
          Link
        </TrackedLink>
      );

      const link = screen.getByRole('link');
      fireEvent.click(link);

      // Should only call with href and linkText, not additional properties
      expect(analytics.trackExternalLink).toHaveBeenCalledWith('https://example.com', 'Link');
    });
  });

  describe('Accessibility', () => {
    it('supports keyboard navigation', () => {
      render(
        <TrackedLink href="https://example.com">
          Accessible Link
        </TrackedLink>
      );

      const link = screen.getByRole('link');
      link.focus();

      expect(document.activeElement).toBe(link);
    });

    it('renders with proper role', () => {
      render(
        <TrackedLink href="https://example.com">
          Link
        </TrackedLink>
      );

      const link = screen.getByRole('link');
      expect(link).toBeDefined();
    });
  });
});
