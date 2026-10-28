import Link from 'next/link';

interface HealthResponse {
  status: string;
  timestamp: string;
}

async function getApiHealth(): Promise<{ data: HealthResponse | null; error: string | null }> {
  const apiInternalUrl = process.env.API_INTERNAL_URL || 'http://localhost:4000';
  try {
    const res = await fetch(`${apiInternalUrl}/api/health`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      return { data: null, error: `API returned status ${res.status}` };
    }
    const data = (await res.json()) as HealthResponse;
    return { data, error: null };
  } catch (err: unknown) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Failed to reach API service',
    };
  }
}

export default async function HealthPage() {
  const { data, error } = await getApiHealth();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <h1 className="font-display text-2xl font-bold text-text">System Health Status</h1>
          <span
            className={`inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-medium ${
              data?.status === 'ok' ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
            }`}
          >
            {data?.status === 'ok' ? 'Operational' : 'Unavailable'}
          </span>
        </div>

        <div className="mt-6 space-y-4 text-sm">
          <div className="flex justify-between py-2 border-b border-border/50">
            <span className="text-text-muted">Next.js Web Service:</span>
            <span className="font-medium text-success">Healthy</span>
          </div>

          <div className="flex justify-between py-2 border-b border-border/50">
            <span className="text-text-muted">NestJS API (Internal Proxy):</span>
            <span
              className={`font-medium ${data?.status === 'ok' ? 'text-success' : 'text-danger'}`}
            >
              {data?.status === 'ok' ? 'Connected (via proxy)' : 'Connection Failed'}
            </span>
          </div>

          {data && (
            <div className="flex justify-between py-2 border-b border-border/50">
              <span className="text-text-muted">Reported Timestamp:</span>
              <span className="font-mono text-xs text-text">{data.timestamp}</span>
            </div>
          )}

          {error && (
            <div className="rounded-md bg-danger/10 p-3 text-xs text-danger">
              Proxy Error: {error}
            </div>
          )}
        </div>

        <div className="mt-6 pt-4 text-center">
          <Link href="/" className="text-xs text-primary underline hover:text-primary/80">
            ← Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
