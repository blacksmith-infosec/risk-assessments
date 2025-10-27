import React from 'react';
import { trackExternalLink } from '../../utils/analytics';

interface TrackedLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  /** URL to navigate to */
  href: string;
  /** Additional properties to send with the tracking event */
  trackingProperties?: Record<string, string | number | boolean>;
  children: React.ReactNode;
}

/**
 * Link component that automatically tracks external link clicks
 * Use this for links that navigate away from the app (target="_blank")
 */
export const TrackedLink: React.FC<TrackedLinkProps> = ({
  href,
  trackingProperties: _trackingProperties,
  onClick,
  children,
  ...anchorProps
}) => {
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    // Extract link text for tracking
    const linkText = typeof children === 'string' ? children : undefined;

    // Track the click
    trackExternalLink(href, linkText);

    // Call the original onClick handler if provided
    if (onClick) {
      onClick(event);
    }
  };

  return (
    <a {...anchorProps} href={href} onClick={handleClick}>
      {children}
    </a>
  );
};

export default TrackedLink;
