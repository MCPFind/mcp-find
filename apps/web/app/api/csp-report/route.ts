export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 10_240; // 10 KB cap

interface CspReportBody {
  // Legacy application/csp-report envelope
  'csp-report'?: {
    'violated-directive'?: string;
    'effective-directive'?: string;
    'blocked-uri'?: string;
    'document-uri'?: string;
    disposition?: string;
  };
  // Modern Reporting API (application/reports+json) — array of report objects
  type?: string;
  body?: {
    effectiveDirective?: string;
    blockedURL?: string;
    documentURL?: string;
    disposition?: string;
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const text = await request.text();

    // Guard against abnormally large payloads
    if (text.length > MAX_BODY_BYTES) {
      console.warn('[csp-report] oversized body ignored', { bytes: text.length });
      return new Response(null, { status: 204 });
    }

    const raw: unknown = JSON.parse(text);

    // The Reporting API sends an array; legacy sends a single object.
    const reports: CspReportBody[] = Array.isArray(raw) ? (raw as CspReportBody[]) : [raw as CspReportBody];

    for (const report of reports) {
      // Legacy format: { "csp-report": { ... } }
      if (report['csp-report']) {
        const r = report['csp-report'];
        console.log('[csp-report]', {
          violatedDirective: r['violated-directive'] ?? r['effective-directive'] ?? null,
          blockedUri: r['blocked-uri'] ?? null,
          documentUri: r['document-uri'] ?? null,
          disposition: r['disposition'] ?? 'enforce',
        });
      } else if (report.type === 'csp-violation' && report.body) {
        // Modern Reporting API format
        const b = report.body;
        console.log('[csp-report]', {
          violatedDirective: b.effectiveDirective ?? null,
          blockedUri: b.blockedURL ?? null,
          documentUri: b.documentURL ?? null,
          disposition: b.disposition ?? null,
        });
      }
    }
  } catch {
    // Parse failure — still return 204; this is fire-and-forget telemetry
    console.warn('[csp-report] failed to parse body');
  }

  return new Response(null, { status: 204 });
}
