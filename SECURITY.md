# Security Policy

## Overview

Security is at the core of this Risk Assessment Tool. We take security seriously and appreciate the security research community's efforts in responsibly disclosing vulnerabilities.

## Data Privacy

- **No Backend**: This is a fully client-side application
- **No Data Collection**: No personal data is collected or transmitted
- **Local Storage Only**: All assessment data stays in your browser
- **Optional Export**: Users can export data for backup purposes

## Reporting a Vulnerability

We value security researchers who help keep our users safe. If you discover a security vulnerability, please follow these guidelines:

### Responsible Disclosure Process

1. **Do NOT** open a public GitHub issue for security vulnerabilities
2. **Do NOT** disclose the vulnerability publicly until it has been addressed
3. **Do** email us at: **security@blacksmithinfosec.com**

### What to Include in Your Report

Please include the following information:

- **Description**: Clear description of the vulnerability
- **Impact**: What could an attacker accomplish?
- **Steps to Reproduce**: Detailed steps to reproduce the issue
- **Proof of Concept**: Code or screenshots demonstrating the vulnerability
- **Affected Versions**: Which versions are affected?
- **Suggested Fix**: If you have ideas for remediation
- **Your Details**: Name/handle and contact info for credit (optional)

### Example Report Template

```
Subject: [SECURITY] XSS vulnerability in domain scanner results

Description:
Cross-site scripting vulnerability in the domain scanner result display allows
execution of arbitrary JavaScript.

Impact:
An attacker could craft a malicious domain response that executes JavaScript
in the victim's browser, potentially stealing localStorage data.

Steps to Reproduce:
1. Set up a malicious DNS server responding with: <script>alert(1)</script>
2. Enter the malicious domain in the scanner
3. Run the scan
4. Observe JavaScript execution when results are displayed

Proof of Concept:
[Attached screenshot or code sample]

Affected Versions:
Latest version (commit abc123)

Suggested Fix:
Sanitize all domain scan results before displaying in the UI using DOMPurify
or React's built-in XSS protection.

Reporter:
Jane Doe (@janedoe)
contact@example.com
```

## What to Expect

### Our Commitment

When you report a vulnerability:

1. **Acknowledgment**: We'll acknowledge receipt within **48 hours**
2. **Communication**: We'll keep you updated on our progress
3. **Timeline**: We aim to address critical issues within **7 days**
4. **Credit**: We'll credit you in the fix (unless you prefer to remain anonymous)
5. **Disclosure**: We'll coordinate public disclosure timing with you

### Response Timeline

- **Critical vulnerabilities**: 48-72 hours
- **High severity**: 7 days
- **Medium severity**: 14 days
- **Low severity**: 30 days

### Severity Guidelines

We use the following severity levels:

**Critical**:
- Remote code execution
- Authentication bypass
- Data exfiltration from localStorage

**High**:
- Cross-site scripting (XSS)
- CSRF allowing state changes
- Privilege escalation

**Medium**:
- Information disclosure
- Denial of service
- Missing security headers

**Low**:
- Best practice violations
- Low-impact information leaks

## Security Best Practices for Users

### For End Users

1. **Keep Updated**: Always use the latest version from GitHub Pages
2. **Verify URL**: Ensure you're on `https://assess.blacksmithinfosec.com`
3. **Clear Data**: Use the Reset button to clear sensitive data when done
4. **Export Carefully**: Be cautious when exporting data - it may contain sensitive information
5. **Browser Security**: Keep your browser up to date
6. **Private Browsing**: Consider using private/incognito mode for sensitive assessments

### For Developers/Contributors

1. **Validate Inputs**: Always validate and sanitize user inputs
2. **Review Dependencies**: Check for known vulnerabilities in npm packages
3. **Follow Guidelines**: Adhere to our [CONTRIBUTING.md](./CONTRIBUTING.md)
4. **Test Security**: Include security tests for new features
5. **Avoid Secrets**: Never commit API keys, tokens, or credentials
6. **Code Review**: All PRs require review before merging

## Known Limitations

### By Design

- **CORS Limitations**: Some scans use CORS proxies to access external APIs
- **Client-Side Only**: All processing happens in the browser - no server-side validation
- **Rate Limits**: External API rate limits may affect scan functionality
- **Browser Compatibility**: Requires modern browser with localStorage support

### Out of Scope

The following are **not** considered security vulnerabilities:

- Denial of service via local resource exhaustion (it's client-side)
- Issues requiring physical access to the user's device
- Social engineering attacks
- Vulnerabilities in third-party APIs we consume (report to them directly)
- Rate limit bypass (we provide rate limiting as a courtesy, not security)
- Browser-specific bugs (report to browser vendors)

## Security Updates

Security updates will be:

1. **Patched immediately** in the `main` branch
2. **Deployed to GitHub Pages** as soon as the fix is merged to `main`
3. **Documented in release notes** with CVE (if applicable)
4. **Announced** via GitHub Security Advisories

## Security Scanning

We regularly perform:

- **Dependency scanning**: Automated via Dependabot
- **Static analysis**: ESLint with security rules
- **Code review**: All changes reviewed before merge
- **Testing**: Comprehensive test suite including security tests

## Contact

- **Security Issues**: security@blacksmithinfosec.com
- **General Questions**: https://github.com/blacksmith-infosec/risk-assessments/issues
- **Website**: https://blacksmithinfosec.com

## Bug Bounty

We currently do not offer a bug bounty program, but we deeply appreciate security research contributions and will:

- Publicly credit researchers (with permission)
- Provide detailed acknowledgment in release notes
- Consider featuring exceptional findings in our blog

## Hall of Fame

We thank the following security researchers for responsibly disclosing vulnerabilities:

<!-- Contributors will be listed here -->

_No vulnerabilities reported yet - be the first!_

---

Last Updated: October 31, 2025

**Thank you for helping keep our users safe!** 🛡️

Built with ❤️ by [Blacksmith InfoSec](https://blacksmithinfosec.com)
