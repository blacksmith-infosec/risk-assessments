import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as amplitude from '@amplitude/analytics-browser';
import {
  trackEvent,
  trackButtonClick,
  trackExternalLink,
  trackNavigation,
  trackFormSubmit,
  trackExport,
  trackImport
} from './analytics';

// Mock amplitude
vi.mock('@amplitude/analytics-browser', () => ({
  logEvent: vi.fn()
}));

describe('analytics', () => {
  // Store original window.gtag
  let originalGtag: unknown;

  beforeEach(() => {
    vi.clearAllMocks();
    // Setup mock gtag
    originalGtag = (window as { gtag?: unknown }).gtag;
    (window as unknown as { gtag: unknown }).gtag = vi.fn();
  });

  afterEach(() => {
    // Restore original gtag
    if (originalGtag === undefined) {
      delete (window as { gtag?: unknown }).gtag;
    } else {
      (window as unknown as { gtag: unknown }).gtag = originalGtag;
    }
  });

  describe('trackEvent', () => {
    it('sends event to Amplitude', () => {
      trackEvent('test_event');

      expect(amplitude.logEvent).toHaveBeenCalledTimes(1);
      expect(amplitude.logEvent).toHaveBeenCalledWith('test_event', undefined);
    });

    it('sends event to Amplitude with properties', () => {
      const properties = { key: 'value', count: 42 };
      trackEvent('test_event', properties);

      expect(amplitude.logEvent).toHaveBeenCalledWith('test_event', properties);
    });

    it('sends event to Google Analytics when gtag is available', () => {
      const mockGtag = vi.fn();
      (window as unknown as { gtag: unknown }).gtag = mockGtag;

      trackEvent('test_event');

      expect(mockGtag).toHaveBeenCalledTimes(1);
      expect(mockGtag).toHaveBeenCalledWith('event', 'test_event', undefined);
    });

    it('sends event to Google Analytics with properties', () => {
      const mockGtag = vi.fn();
      (window as unknown as { gtag: unknown }).gtag = mockGtag;
      const properties = { key: 'value', count: 42 };

      trackEvent('test_event', properties);

      expect(mockGtag).toHaveBeenCalledWith('event', 'test_event', properties);
    });

    it('does not crash when gtag is not available', () => {
      delete (window as { gtag?: unknown }).gtag;

      expect(() => trackEvent('test_event')).not.toThrow();
      expect(amplitude.logEvent).toHaveBeenCalledTimes(1);
    });

    it('tracks event with string property', () => {
      trackEvent('test_event', { status: 'active' });

      expect(amplitude.logEvent).toHaveBeenCalledWith('test_event', { status: 'active' });
    });

    it('tracks event with number property', () => {
      trackEvent('test_event', { count: 100 });

      expect(amplitude.logEvent).toHaveBeenCalledWith('test_event', { count: 100 });
    });

    it('tracks event with boolean property', () => {
      trackEvent('test_event', { success: true });

      expect(amplitude.logEvent).toHaveBeenCalledWith('test_event', { success: true });
    });

    it('tracks event with undefined property', () => {
      trackEvent('test_event', { optional: undefined });

      expect(amplitude.logEvent).toHaveBeenCalledWith('test_event', { optional: undefined });
    });

    it('tracks event with mixed property types', () => {
      const properties = {
        name: 'test',
        count: 42,
        enabled: true,
        optional: undefined
      };
      trackEvent('test_event', properties);

      expect(amplitude.logEvent).toHaveBeenCalledWith('test_event', properties);
    });
  });

  describe('trackButtonClick', () => {
    it('tracks button click with button name', () => {
      trackButtonClick('submit_button');

      expect(amplitude.logEvent).toHaveBeenCalledWith('button_click', {
        button_name: 'submit_button'
      });
    });

    it('tracks button click with additional properties', () => {
      trackButtonClick('submit_button', { page: 'home', section: 'header' });

      expect(amplitude.logEvent).toHaveBeenCalledWith('button_click', {
        button_name: 'submit_button',
        page: 'home',
        section: 'header'
      });
    });

    it('sends to Google Analytics', () => {
      const mockGtag = vi.fn();
      (window as unknown as { gtag: unknown }).gtag = mockGtag;

      trackButtonClick('test_button');

      expect(mockGtag).toHaveBeenCalledWith('event', 'button_click', {
        button_name: 'test_button'
      });
    });

    it('tracks button click without additional properties', () => {
      trackButtonClick('cancel_button');

      expect(amplitude.logEvent).toHaveBeenCalledWith('button_click', {
        button_name: 'cancel_button'
      });
    });

    it('merges button_name with additional properties', () => {
      trackButtonClick('export_word', { format: 'docx', size: 'large' });

      expect(amplitude.logEvent).toHaveBeenCalledWith('button_click', {
        button_name: 'export_word',
        format: 'docx',
        size: 'large'
      });
    });
  });

  describe('trackExternalLink', () => {
    it('tracks external link with URL', () => {
      trackExternalLink('https://example.com');

      expect(amplitude.logEvent).toHaveBeenCalledWith('external_link_click', {
        url: 'https://example.com',
        link_text: undefined,
        destination: 'example.com'
      });
    });

    it('tracks external link with URL and link text', () => {
      trackExternalLink('https://github.com/user/repo', 'GitHub Repository');

      expect(amplitude.logEvent).toHaveBeenCalledWith('external_link_click', {
        url: 'https://github.com/user/repo',
        link_text: 'GitHub Repository',
        destination: 'github.com'
      });
    });

    it('extracts hostname from URL', () => {
      trackExternalLink('https://subdomain.example.com/path/to/page?query=value');

      expect(amplitude.logEvent).toHaveBeenCalledWith('external_link_click', {
        url: 'https://subdomain.example.com/path/to/page?query=value',
        link_text: undefined,
        destination: 'subdomain.example.com'
      });
    });

    it('sends to Google Analytics', () => {
      const mockGtag = vi.fn();
      (window as unknown as { gtag: unknown }).gtag = mockGtag;

      trackExternalLink('https://example.com', 'Example Site');

      expect(mockGtag).toHaveBeenCalledWith('event', 'external_link_click', {
        url: 'https://example.com',
        link_text: 'Example Site',
        destination: 'example.com'
      });
    });

    it('handles URLs with ports', () => {
      trackExternalLink('https://localhost:3000/app');

      expect(amplitude.logEvent).toHaveBeenCalledWith('external_link_click', {
        url: 'https://localhost:3000/app',
        link_text: undefined,
        destination: 'localhost'
      });
    });
  });

  describe('trackNavigation', () => {
    it('tracks navigation between pages', () => {
      trackNavigation('/home', '/questionnaire');

      expect(amplitude.logEvent).toHaveBeenCalledWith('navigation', {
        from: '/home',
        to: '/questionnaire'
      });
    });

    it('sends to Google Analytics', () => {
      const mockGtag = vi.fn();
      (window as unknown as { gtag: unknown }).gtag = mockGtag;

      trackNavigation('/report', '/domain');

      expect(mockGtag).toHaveBeenCalledWith('event', 'navigation', {
        from: '/report',
        to: '/domain'
      });
    });

    it('tracks navigation with route names', () => {
      trackNavigation('home', 'settings');

      expect(amplitude.logEvent).toHaveBeenCalledWith('navigation', {
        from: 'home',
        to: 'settings'
      });
    });
  });

  describe('trackFormSubmit', () => {
    it('tracks form submission with form name', () => {
      trackFormSubmit('contact_form');

      expect(amplitude.logEvent).toHaveBeenCalledWith('form_submit', {
        form_name: 'contact_form'
      });
    });

    it('tracks form submission with additional properties', () => {
      trackFormSubmit('domain_scan', { domain: 'example.com' });

      expect(amplitude.logEvent).toHaveBeenCalledWith('form_submit', {
        form_name: 'domain_scan',
        domain: 'example.com'
      });
    });

    it('sends to Google Analytics', () => {
      const mockGtag = vi.fn();
      (window as unknown as { gtag: unknown }).gtag = mockGtag;

      trackFormSubmit('login_form', { method: 'password' });

      expect(mockGtag).toHaveBeenCalledWith('event', 'form_submit', {
        form_name: 'login_form',
        method: 'password'
      });
    });

    it('tracks form submission with validation errors', () => {
      trackFormSubmit('signup_form', { errors: 2, valid: false });

      expect(amplitude.logEvent).toHaveBeenCalledWith('form_submit', {
        form_name: 'signup_form',
        errors: 2,
        valid: false
      });
    });
  });

  describe('trackExport', () => {
    it('tracks export with type', () => {
      trackExport('json');

      expect(amplitude.logEvent).toHaveBeenCalledWith('export', {
        export_type: 'json'
      });
    });

    it('tracks export with additional properties', () => {
      trackExport('word', { size: 'large', pages: 10 });

      expect(amplitude.logEvent).toHaveBeenCalledWith('export', {
        export_type: 'word',
        size: 'large',
        pages: 10
      });
    });

    it('sends to Google Analytics', () => {
      const mockGtag = vi.fn();
      (window as unknown as { gtag: unknown }).gtag = mockGtag;

      trackExport('pdf', { format: 'a4' });

      expect(mockGtag).toHaveBeenCalledWith('event', 'export', {
        export_type: 'pdf',
        format: 'a4'
      });
    });

    it('tracks different export types', () => {
      trackExport('csv');
      trackExport('xml');
      trackExport('docx');

      expect(amplitude.logEvent).toHaveBeenCalledTimes(3);
      expect(amplitude.logEvent).toHaveBeenNthCalledWith(1, 'export', { export_type: 'csv' });
      expect(amplitude.logEvent).toHaveBeenNthCalledWith(2, 'export', { export_type: 'xml' });
      expect(amplitude.logEvent).toHaveBeenNthCalledWith(3, 'export', { export_type: 'docx' });
    });
  });

  describe('trackImport', () => {
    it('tracks successful import', () => {
      trackImport('json', true);

      expect(amplitude.logEvent).toHaveBeenCalledWith('import', {
        import_type: 'json',
        success: true
      });
    });

    it('tracks failed import', () => {
      trackImport('json', false);

      expect(amplitude.logEvent).toHaveBeenCalledWith('import', {
        import_type: 'json',
        success: false
      });
    });

    it('tracks import with additional properties', () => {
      trackImport('csv', true, { rows: 100, columns: 5 });

      expect(amplitude.logEvent).toHaveBeenCalledWith('import', {
        import_type: 'csv',
        success: true,
        rows: 100,
        columns: 5
      });
    });

    it('sends to Google Analytics', () => {
      const mockGtag = vi.fn();
      (window as unknown as { gtag: unknown }).gtag = mockGtag;

      trackImport('xml', true, { size: 'large' });

      expect(mockGtag).toHaveBeenCalledWith('event', 'import', {
        import_type: 'xml',
        success: true,
        size: 'large'
      });
    });

    it('tracks import failure with error details', () => {
      trackImport('json', false, { error: 'invalid_format', line: 42 });

      expect(amplitude.logEvent).toHaveBeenCalledWith('import', {
        import_type: 'json',
        success: false,
        error: 'invalid_format',
        line: 42
      });
    });
  });

  describe('Integration scenarios', () => {
    it('tracks multiple events in sequence', () => {
      trackButtonClick('start_button');
      trackFormSubmit('input_form');
      trackExport('json');

      expect(amplitude.logEvent).toHaveBeenCalledTimes(3);
    });

    it('handles both Amplitude and Google Analytics for all events', () => {
      const mockGtag = vi.fn();
      (window as unknown as { gtag: unknown }).gtag = mockGtag;

      trackButtonClick('test_button');
      trackExternalLink('https://example.com');
      trackNavigation('/a', '/b');
      trackFormSubmit('test_form');
      trackExport('json');
      trackImport('csv', true);

      // Each function calls trackEvent which calls both amplitude and gtag
      expect(amplitude.logEvent).toHaveBeenCalledTimes(6);
      expect(mockGtag).toHaveBeenCalledTimes(6);
    });

    it('continues tracking after gtag becomes unavailable', () => {
      const mockGtag = vi.fn();
      (window as unknown as { gtag: unknown }).gtag = mockGtag;

      trackEvent('event1');

      delete (window as { gtag?: unknown }).gtag;

      trackEvent('event2');

      expect(amplitude.logEvent).toHaveBeenCalledTimes(2);
      expect(mockGtag).toHaveBeenCalledTimes(1);
    });
  });
});
