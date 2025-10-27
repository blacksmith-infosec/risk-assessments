import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TrackedButton } from './index';
import * as analytics from '../../utils/analytics';

// Mock the analytics module
vi.mock('../../utils/analytics', () => ({
  trackButtonClick: vi.fn()
}));

describe('TrackedButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Rendering', () => {
    it('renders button with children', () => {
      render(<TrackedButton trackingName="test_button">Click Me</TrackedButton>);

      expect(screen.getByRole('button', { name: 'Click Me' })).toBeDefined();
    });

    it('renders with custom className', () => {
      render(
        <TrackedButton trackingName="test_button" className="custom-class">
          Button
        </TrackedButton>
      );

      const button = screen.getByRole('button');
      expect(button.className).toBe('custom-class');
    });

    it('renders with disabled attribute', () => {
      render(
        <TrackedButton trackingName="test_button" disabled>
          Disabled
        </TrackedButton>
      );

      const button = screen.getByRole('button');
      expect(button.hasAttribute('disabled')).toBe(true);
    });

    it('renders with type attribute', () => {
      render(
        <TrackedButton trackingName="test_button" type="submit">
          Submit
        </TrackedButton>
      );

      const button = screen.getByRole('button');
      expect(button.getAttribute('type')).toBe('submit');
    });

    it('renders with aria-label', () => {
      render(
        <TrackedButton trackingName="test_button" aria-label="Close dialog">
          X
        </TrackedButton>
      );

      expect(screen.getByRole('button', { name: 'Close dialog' })).toBeDefined();
    });
  });

  describe('Click Tracking', () => {
    it('tracks button click with tracking name', () => {
      render(<TrackedButton trackingName="test_button">Click Me</TrackedButton>);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(analytics.trackButtonClick).toHaveBeenCalledTimes(1);
      expect(analytics.trackButtonClick).toHaveBeenCalledWith('test_button', undefined);
    });

    it('tracks button click with tracking properties', () => {
      const trackingProps = { page: 'home', section: 'header' };

      render(
        <TrackedButton trackingName="nav_button" trackingProperties={trackingProps}>
          Navigate
        </TrackedButton>
      );

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(analytics.trackButtonClick).toHaveBeenCalledWith('nav_button', trackingProps);
    });

    it('tracks button click with numeric properties', () => {
      const trackingProps = { count: 42, enabled: true };

      render(
        <TrackedButton trackingName="counter_button" trackingProperties={trackingProps}>
          Count
        </TrackedButton>
      );

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(analytics.trackButtonClick).toHaveBeenCalledWith('counter_button', trackingProps);
    });
  });

  describe('Click Handler', () => {
    it('calls onClick handler when provided', () => {
      const handleClick = vi.fn();

      render(
        <TrackedButton trackingName="test_button" onClick={handleClick}>
          Click Me
        </TrackedButton>
      );

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('calls onClick handler with event object', () => {
      const handleClick = vi.fn();

      render(
        <TrackedButton trackingName="test_button" onClick={handleClick}>
          Click Me
        </TrackedButton>
      );

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(handleClick).toHaveBeenCalledWith(expect.objectContaining({
        type: 'click'
      }));
    });

    it('tracks click before calling onClick handler', () => {
      const callOrder: string[] = [];

      const handleClick = vi.fn(() => {
        callOrder.push('onClick');
      });

      vi.mocked(analytics.trackButtonClick).mockImplementation(() => {
        callOrder.push('track');
      });

      render(
        <TrackedButton trackingName="test_button" onClick={handleClick}>
          Click Me
        </TrackedButton>
      );

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(callOrder).toEqual(['track', 'onClick']);
    });

    it('works without onClick handler', () => {
      render(<TrackedButton trackingName="test_button">Click Me</TrackedButton>);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(analytics.trackButtonClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('Multiple Clicks', () => {
    it('tracks multiple clicks', () => {
      render(<TrackedButton trackingName="test_button">Click Me</TrackedButton>);

      const button = screen.getByRole('button');
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);

      expect(analytics.trackButtonClick).toHaveBeenCalledTimes(3);
    });

    it('calls onClick handler multiple times', () => {
      const handleClick = vi.fn();

      render(
        <TrackedButton trackingName="test_button" onClick={handleClick}>
          Click Me
        </TrackedButton>
      );

      const button = screen.getByRole('button');
      fireEvent.click(button);
      fireEvent.click(button);

      expect(handleClick).toHaveBeenCalledTimes(2);
    });
  });

  describe('Disabled State', () => {
    it('does not track clicks when disabled', () => {
      render(
        <TrackedButton trackingName="test_button" disabled>
          Click Me
        </TrackedButton>
      );

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(analytics.trackButtonClick).not.toHaveBeenCalled();
    });

    it('does not call onClick when disabled', () => {
      const handleClick = vi.fn();

      render(
        <TrackedButton trackingName="test_button" onClick={handleClick} disabled>
          Click Me
        </TrackedButton>
      );

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('Complex Children', () => {
    it('renders with JSX children', () => {
      render(
        <TrackedButton trackingName="test_button">
          <span>Icon</span>
          <span>Text</span>
        </TrackedButton>
      );

      expect(screen.getByText('Icon')).toBeDefined();
      expect(screen.getByText('Text')).toBeDefined();
    });

    it('tracks click with complex children', () => {
      render(
        <TrackedButton trackingName="complex_button">
          <span>🔄</span> Reset
        </TrackedButton>
      );

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(analytics.trackButtonClick).toHaveBeenCalledWith('complex_button', undefined);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty string tracking name', () => {
      render(<TrackedButton trackingName="">Click Me</TrackedButton>);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(analytics.trackButtonClick).toHaveBeenCalledWith('', undefined);
    });

    it('handles empty tracking properties', () => {
      render(
        <TrackedButton trackingName="test_button" trackingProperties={{}}>
          Click Me
        </TrackedButton>
      );

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(analytics.trackButtonClick).toHaveBeenCalledWith('test_button', {});
    });

    it('passes through all button HTML attributes', () => {
      render(
        <TrackedButton
          trackingName="test_button"
          id="custom-id"
          data-testid="custom-test-id"
          title="Custom title"
        >
          Button
        </TrackedButton>
      );

      const button = screen.getByRole('button');
      expect(button.getAttribute('id')).toBe('custom-id');
      expect(button.getAttribute('data-testid')).toBe('custom-test-id');
      expect(button.getAttribute('title')).toBe('Custom title');
    });
  });
});
