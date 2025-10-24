# Risk Assessments (Static Tool)

This project provides a client-side risk assessment questionnaire and lightweight domain scanning utility intended for MSPs
/ security teams to quickly baseline a prospect or environment. It is fully static (GitHub Pages friendly) and stores data
locally (no backend persistence).

You can access a hosted version at https://riskassessment.blacksmithinfosec.com. Alternatively, you can fork this repo
and setup your own free, personalized scanner by customizing the CSS and images. Instructions for how to set this up are
coming soon.

## Features
- Questionnaire (JSON-driven) with scoring and category breakdown
- Domain scan (DNS records, SPF, DMARC, DKIM heuristic, crt.sh certificate enumeration, limited security headers)
- Automatic recommendation mapping based on answers
- Export: JSON (full state), CSV (recommendations), PDF (rendered report)
- Import: Restore a previous assessment from JSON

## Getting Started
1. Install dependencies:
	 ```bash
	 npm install
	 npm run start
	 ```
2. Open `http://localhost:3000`

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
- DNS over HTTPS: `https://dns.google/resolve`
- DMARC/SPF/DKIM: TXT lookups via DNS
- Certificates: `crt.sh` JSON output
- Security headers: BEST-EFFORT HEAD request (often blocked by CORS); fallback to manual link

Limitations (static environment):
- Cannot reliably read cross-origin full response headers (CORS)
- Cannot perform breach queries against HIBP without API key + backend proxy
- Cannot inspect open ports, banner grabbing, or full SSL chain trust

### Modular Scanners (Extensible)
The UI now displays independent scanner statuses. Each scanner runs sequentially and reports its own issues.

Scanners live in `src/utils/domainScannerFramework.ts` and are typed by `src/types/domainScan.ts`.

Add a new scanner:
1. Open `src/utils/domainScannerFramework.ts`.
2. Define a new constant implementing `DomainScanner`:
	 ```ts
	 const myScanner: DomainScanner = {
		 id: 'myScanner',
		 label: 'My Scanner',
		 description: 'Brief description',
		 run: async (domain) => {
			 // Perform checks
			 const data = {/* ... */};
			 const issues = [];
			 if (/* problem */) issues.push('Detected issue');
			 return { data, summary: 'What was found', issues }; // summary & issues optional
		 }
	 };
	 ```
3. Append it to the `SCANNERS` array.
4. The UI will automatically render its status, summary, and issues.

Optionally compute issues later by providing `deriveIssues(result, domain)` instead of filling `issues` in `run`.

Rerunning scanners: For future enhancements you can expose `runScanner(domain, id)` to re-run one scanner; currently all run via the "Scan Domain" button.

## Export / Import
- JSON export includes answers + last domain scan.
- Import expects JSON with shape: `{ "answers": {"question_id": "value"}, "domainScan": { ... } }`.

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

---
Disclaimer: This tool provides indicative data only. Always perform deeper validation and manual review for production security decisions.
