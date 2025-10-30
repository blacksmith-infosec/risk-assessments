/**
 * JSON validation utilities for import functionality
 * Validates JSON complexity, structure, and content to prevent DoS and injection attacks
 */

interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validate JSON complexity to prevent DoS attacks via deeply nested structures
 */
export const validateJSONComplexity = (
  obj: unknown,
  maxDepth: number = 10,
  maxKeys: number = 1000,
  currentDepth: number = 0,
  keyCount: { count: number } = { count: 0 }
): ValidationResult => {
  // Check depth
  if (currentDepth > maxDepth) {
    return {
      isValid: false,
      error: `JSON structure too deep (max depth: ${maxDepth})`
    };
  }

  // Check if we've exceeded total key count
  if (keyCount.count > maxKeys) {
    return {
      isValid: false,
      error: `JSON structure too complex (max ${maxKeys} keys)`
    };
  }

  // Null and primitives are fine
  if (obj === null || typeof obj !== 'object') {
    return { isValid: true };
  }

  // Check arrays
  if (Array.isArray(obj)) {
    if (obj.length > 1000) {
      return {
        isValid: false,
        error: 'Array too large (max 1000 items)'
      };
    }

    for (const item of obj) {
      const result = validateJSONComplexity(item, maxDepth, maxKeys, currentDepth + 1, keyCount);
      if (!result.isValid) {
        return result;
      }
    }
    return { isValid: true };
  }

  // Check objects
  const keys = Object.keys(obj);
  keyCount.count += keys.length;

  if (keys.length > 100) {
    return {
      isValid: false,
      error: 'Object has too many keys (max 100 per object)'
    };
  }

  for (const key of keys) {
    // Check key length
    if (key.length > 100) {
      return {
        isValid: false,
        error: 'Object key too long (max 100 characters)'
      };
    }

    // Recursively validate nested values
    const value = (obj as Record<string, unknown>)[key];
    const result = validateJSONComplexity(value, maxDepth, maxKeys, currentDepth + 1, keyCount);
    if (!result.isValid) {
      return result;
    }
  }

  return { isValid: true };
};

/**
 * Validate import JSON structure and content
 */
export const validateImportJSON = (jsonString: string): ValidationResult => {
  // Check size first (before parsing)
  const sizeInMB = new Blob([jsonString]).size / (1024 * 1024);
  if (sizeInMB > 5) {
    return {
      isValid: false,
      error: 'JSON file too large (max 5MB)'
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (error) {
    return {
      isValid: false,
      error: 'Invalid JSON format'
    };
  }

  // Validate that it's an object
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      isValid: false,
      error: 'JSON must be an object'
    };
  }

  // Validate complexity
  const complexityResult = validateJSONComplexity(parsed);
  if (!complexityResult.isValid) {
    return complexityResult;
  }

  const obj = parsed as Record<string, unknown>;

  // Validate expected structure
  let hasValidData = false;

  // Validate answers structure if present
  if (obj.answers !== undefined) {
    if (typeof obj.answers !== 'object' || Array.isArray(obj.answers) || obj.answers === null) {
      return {
        isValid: false,
        error: 'Invalid answers format (must be an object)'
      };
    }

    const answers = obj.answers as Record<string, unknown>;
    const answerEntries = Object.entries(answers);

    if (answerEntries.length > 100) {
      return {
        isValid: false,
        error: 'Too many answers (max 100)'
      };
    }

    // Validate each answer
    for (const [key, value] of answerEntries) {
      if (typeof key !== 'string' || typeof value !== 'string') {
        return {
          isValid: false,
          error: 'All answers must be string key-value pairs'
        };
      }

      if (key.length > 100 || value.length > 500) {
        return {
          isValid: false,
          error: 'Answer key or value too long'
        };
      }
    }

    hasValidData = true;
  }

  // Validate domainScanAggregate structure if present
  if (obj.domainScanAggregate !== undefined) {
    if (
      typeof obj.domainScanAggregate !== 'object' ||
      Array.isArray(obj.domainScanAggregate) ||
      obj.domainScanAggregate === null
    ) {
      return {
        isValid: false,
        error: 'Invalid domainScanAggregate format'
      };
    }

    const scan = obj.domainScanAggregate as Record<string, unknown>;

    // Check required fields
    if (typeof scan.domain !== 'string') {
      return {
        isValid: false,
        error: 'domainScanAggregate must have a domain string'
      };
    }

    if (typeof scan.timestamp !== 'string') {
      return {
        isValid: false,
        error: 'domainScanAggregate must have a timestamp string'
      };
    }

    if (!Array.isArray(scan.scanners)) {
      return {
        isValid: false,
        error: 'domainScanAggregate.scanners must be an array'
      };
    }

    if (!Array.isArray(scan.issues)) {
      return {
        isValid: false,
        error: 'domainScanAggregate.issues must be an array'
      };
    }

    // Validate domain format
    if (scan.domain.length > 253) {
      return {
        isValid: false,
        error: 'Domain name too long'
      };
    }

    // Validate timestamp
    const timestamp = new Date(scan.timestamp);
    if (isNaN(timestamp.getTime())) {
      return {
        isValid: false,
        error: 'Invalid timestamp format'
      };
    }

    // Validate scanners array
    if (scan.scanners.length > 50) {
      return {
        isValid: false,
        error: 'Too many scanners (max 50)'
      };
    }

    // Validate issues array
    if (scan.issues.length > 1000) {
      return {
        isValid: false,
        error: 'Too many issues (max 1000)'
      };
    }

    hasValidData = true;
  }

  if (!hasValidData) {
    return {
      isValid: false,
      error: 'JSON must contain either answers or domainScanAggregate'
    };
  }

  return { isValid: true };
};
