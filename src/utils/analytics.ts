import * as amplitude from '@amplitude/analytics-browser';

/**
 * Analytics utility for tracking user interactions
 * Sends events to both Amplitude and Google Analytics (gtag)
 */

interface EventProperties {
  [key: string]: string | number | boolean | undefined;
}

/**
 * Track a custom event
 */
export const trackEvent = (eventName: string, properties?: EventProperties): void => {
  // Amplitude tracking
  amplitude.logEvent(eventName, properties);

  // Google Analytics tracking (if gtag is available)
  if (typeof window !== 'undefined' && (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag) {
    (window as unknown as { gtag: (...args: unknown[]) => void }).gtag('event', eventName, properties);
  }
};

/**
 * Track button click events
 */
export const trackButtonClick = (buttonName: string, properties?: EventProperties): void => {
  trackEvent('button_click', {
    button_name: buttonName,
    ...properties
  });
};

/**
 * Track external link clicks
 */
export const trackExternalLink = (url: string, linkText?: string): void => {
  trackEvent('external_link_click', {
    url,
    link_text: linkText,
    destination: new URL(url).hostname
  });
};

/**
 * Track navigation events
 */
export const trackNavigation = (from: string, to: string): void => {
  trackEvent('navigation', {
    from,
    to
  });
};

/**
 * Track form submissions
 */
export const trackFormSubmit = (formName: string, properties?: EventProperties): void => {
  trackEvent('form_submit', {
    form_name: formName,
    ...properties
  });
};

/**
 * Track export/download events
 */
export const trackExport = (exportType: string, properties?: EventProperties): void => {
  trackEvent('export', {
    export_type: exportType,
    ...properties
  });
};

/**
 * Track import events
 */
export const trackImport = (importType: string, success: boolean, properties?: EventProperties): void => {
  trackEvent('import', {
    import_type: importType,
    success,
    ...properties
  });
};
