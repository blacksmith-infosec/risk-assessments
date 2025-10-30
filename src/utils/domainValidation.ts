/**
 * Validates domain names using URL constructor for robust validation
 * This approach is safer than regex and handles edge cases better
 */

export interface DomainValidationResult {
  isValid: boolean;
  normalizedDomain?: string;
  error?: string;
}

/**
 * Validates and normalizes a domain name
 * Uses URL constructor for robust validation
 *
 * @param input - The domain string to validate (with or without protocol)
 * @returns Validation result with normalized domain or error
 */
export const validateDomain = (input: string): DomainValidationResult => {
  if (!input || typeof input !== 'string') {
    return {
      isValid: false,
      error: 'Domain is required'
    };
  }

  // Trim and clean input
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return {
      isValid: false,
      error: 'Domain cannot be empty'
    };
  }

  // Check for obviously malicious patterns
  if (trimmed.includes('<') || trimmed.includes('>') || trimmed.includes('"')) {
    return {
      isValid: false,
      error: 'Invalid characters in domain'
    };
  }

  try {
    // Try to parse as URL - if it has a protocol, use that
    let urlToParse = trimmed;

    // If input doesn't start with a protocol, add one for parsing
    if (!trimmed.match(/^https?:\/\//i)) {
      urlToParse = `https://${trimmed}`;
    }

    const url = new URL(urlToParse);

    // Extract hostname
    let hostname = url.hostname.toLowerCase();

    // Remove trailing dot if present (valid in DNS but normalize it)
    if (hostname.endsWith('.')) {
      hostname = hostname.slice(0, -1);
    }

    // Basic validation checks
    if (hostname.length === 0) {
      return {
        isValid: false,
        error: 'Invalid domain format'
      };
    }

    // Check maximum domain length (253 characters per RFC)
    if (hostname.length > 253) {
      return {
        isValid: false,
        error: 'Domain name too long (max 253 characters)'
      };
    }

    // Check for localhost or private IPs (security concern)
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
      return {
        isValid: false,
        error: 'Localhost and loopback addresses are not allowed'
      };
    }

    // Check for private IP ranges (basic check)
    const privateIPPatterns = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^169\.254\./ // Link-local
    ];

    if (privateIPPatterns.some((pattern) => pattern.test(hostname))) {
      return {
        isValid: false,
        error: 'Private IP addresses are not allowed'
      };
    }

    // Check for valid domain structure (must have at least one dot for TLD)
    // Allow single-label domains for testing purposes, but warn
    if (!hostname.includes('.')) {
      // Single label domains are technically valid but uncommon
      // We'll allow them but could add a warning in the future
    }

    // Validate each label (part between dots)
    const labels = hostname.split('.');
    for (const label of labels) {
      if (label.length === 0) {
        return {
          isValid: false,
          error: 'Domain has empty label'
        };
      }

      if (label.length > 63) {
        return {
          isValid: false,
          error: 'Domain label too long (max 63 characters per label)'
        };
      }

      // Check for valid characters (alphanumeric and hyphens)
      // Can't start or end with hyphen
      if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(label)) {
        return {
          isValid: false,
          error: 'Domain contains invalid characters or format'
        };
      }
    }

    // All checks passed
    return {
      isValid: true,
      normalizedDomain: hostname
    };

  } catch (error) {
    // URL constructor threw an error - invalid format
    return {
      isValid: false,
      error: 'Invalid domain format'
    };
  }
};
