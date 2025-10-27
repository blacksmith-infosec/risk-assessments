import React from 'react';
import { trackButtonClick } from '../../utils/analytics';

interface TrackedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Analytics event name for this button */
  trackingName: string;
  /** Additional properties to send with the tracking event */
  trackingProperties?: Record<string, string | number | boolean>;
  children: React.ReactNode;
}

/**
 * Button component that automatically tracks clicks to analytics
 * Use this instead of <button> for all user-facing buttons
 */
export const TrackedButton: React.FC<TrackedButtonProps> = ({
  trackingName,
  trackingProperties,
  onClick,
  children,
  ...buttonProps
}) => {
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    // Track the click
    trackButtonClick(trackingName, trackingProperties);

    // Call the original onClick handler if provided
    if (onClick) {
      onClick(event);
    }
  };

  return (
    <button {...buttonProps} onClick={handleClick}>
      {children}
    </button>
  );
};

export default TrackedButton;
