# Risk Assessments (Static Tool)

This project provides a client-side risk assessment questionnaire and lightweight domain scanning utility intended for MSPs
/ security teams to quickly baseline a prospect or environment. It is fully static (GitHub Pages friendly) and stores data
locally (no backend persistence).

You can access a hosted version at <https://assess.blacksmithinfosec.com>. Alternatively, you can fork this repo
and setup your own free, personalized scanner by customizing the CSS and images. Instructions for how to set this up are
coming soon.

## Features

* Questionnaire (JSON-driven) with scoring and category breakdown
* Domain scan (DNS records, SPF, DMARC, DKIM heuristic, crt.sh certificate enumeration, limited security headers)
* Automatic recommendation mapping based on answers
* Export: JSON (full state), CSV (recommendations), PDF (rendered report)
* Import: Restore a previous assessment from JSON

## Getting Started

> \[!IMPORTANT]
> If you are planning to host the application you should use a reverse proxy or load balancer as the docker image only provides self-signed certificates and the built in node webserver is not suited for production hosting needs.

### Local

1. Install dependencies:

   ```bash
   npm install
   npm run start
   ```

Open `http://localhost:3000`

### Docker

1. Build the image.

   ```bash
   docker build -t risk-assessments:latest .
   ```

2. Start a container using the image.

   ```bash
   docker run risk-assessments:latest -d -p 3000:443
   ```

### Docker Compose

1. Build and start the application.

   ```bash
   docker compose up --build -d
   ```

Now that you've built the application / image / container locally you're ready to open it by visiting: `https://localhost:3000` in your browser.

> \[!NOTE]
> The docker containers are configured to serve over HTTPS by default and to direct all traffic to HTTPS. They will generate a self-signed certificate to facilitate this.

## Questionnaire Data

Questions are defined in `src/data/questions.json` with schema:

```jsonc
{
    "questions": [
        {
            "id": "unique_id",
            "text": "Readable question?",
            "category": "identity",
            "options": [
                { "label": "Good", "value": "good", "points": 10, "risk": "" },
                { "label": "Average", "value": "avg", "points": 5, "risk": "Without better identity management, average things happen" },
                { "label": "Poor", "value": "poor", "points": 0, "risk": "Without better identity management, bad things happen" }
            ]
        }
    ]
}
```

Add 20 total questions. Keep `id` stable to preserve stored answers.

## Domain Scanning

Client-side functions in `src/utils/domainChecks.ts` use public unauthenticated endpoints:

* DNS over HTTPS: `https://dns.google/resolve`
* DMARC/SPF/DKIM: TXT lookups via DNS
* Certificates: `crt.sh` JSON output
* Security headers: BEST-EFFORT HEAD request (often blocked by CORS); fallback to manual link

**Note on CORS Proxy:** The security headers scanner uses a third-party CORS proxy (corsproxy.io) to access publicly available data from securityheaders.com. This is safe because:

* All data being proxied is publicly accessible
* No sensitive or private information is transmitted
* The data is read-only security header analysis
* If you prefer, you can self-host a CORS proxy or disable this scanner

Limitations (static environment):

* Cannot reliably read cross-origin full response headers (CORS)
* Cannot perform breach queries against HIBP without API key + backend proxy
* Cannot inspect open ports, banner grabbing, or full SSL chain trust

### Modular Scanners (Extensible)

The UI now displays independent scanner statuses. Each scanner runs in parallel and reports its own issues.

The scanner framework is modular with each scanner in its own file. See the **[Scanner Documentation](src/utils/scanners/README.md)** for detailed information on:

* How the scanner architecture works
* How to add a new scanner
* Available scanners and their configurations
* Testing strategies
* Best practices

Quick overview:

* Scanners live in `src/utils/scanners/` (one file per scanner)
* Main exports from `src/utils/scanners/index.ts`
* Types defined in `src/types/domainScan.ts`
* Each scanner is independent with its own tests

The modular structure allows multiple developers to work on different scanners simultaneously without merge conflicts.

## Export / Import

* JSON export includes answers + last domain scan.
* Import expects JSON with shape: `{ "answers": {"question_id": "value"}, "domainScan": { ... } }`.

## Security Considerations

### Data Storage

Assessment data is stored in browser localStorage. While this is convenient for a client-side only application, users should be aware:

* Data persists in the browser until manually cleared
* Browser extensions and malware with localStorage access can read the data
* Data is specific to the browser/device (not synced across devices)

For sensitive assessments, users should:

1. Clear browser data after completing assessments
2. Use the export feature to save data securely offline
3. Avoid using on shared computers

### Input Validation

Domain inputs are validated using the URL constructor (`src/utils/domainValidation.ts`) to prevent:

* Localhost and private IP scanning
* DNS rebinding attacks
* Invalid domain formats
* XSS injection attempts

JSON imports are thoroughly validated (`src/utils/importValidation.ts`) to prevent:

* Deeply nested structures (DoS attacks)
* Excessively large files
* Invalid data structures
* Type confusion attacks

### Content Security Policy

The application includes CSP headers to mitigate XSS attacks. The policy allows:

* Scripts from self and Google Analytics
* Connections to public DNS APIs (dns.google, crt.sh, corsproxy.io)
* Inline styles for dynamic theming

### Rate Limiting & Caching

Domain scans are rate-limited (`src/utils/scannerCache.ts`) to prevent abuse:

* Maximum 5 scans per minute
* Results are cached for 30 minutes
* Prevents excessive API usage
* Improves performance for repeated scans

### Security Headers

The Vite dev server and preview mode include security headers:

* `X-Content-Type-Options: nosniff` - Prevents MIME sniffing
* `X-Frame-Options: DENY` - Prevents clickjacking
* `X-XSS-Protection: 1; mode=block` - Enables XSS protection
* `Referrer-Policy: strict-origin-when-cross-origin` - Controls referer information
* `Permissions-Policy` - Restricts browser features

## Testing

Unit tests (Vitest) focus on scoring logic (`src/utils/scoring.test.ts`). Run with:

```bash
npm test
```

Add further tests for recommendation mapping and domain parsing as needed.

## Accessibility & Printing

Report view uses print-aware CSS (hides nav and buttons). Improve ARIA semantics as the UI evolves.

## License

Apache-2.0

***

Disclaimer: This tool provides indicative data only. Always perform deeper validation and manual review for production security decisions.
