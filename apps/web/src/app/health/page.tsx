import Link from 'next/link';

interface HealthResponse {
  status: string;
  timestamp: string;
}

interface ReadyResponse {
  status: string;
  database: string;
  timestamp: string;
}

async function getSystemHealth(): Promise<{
  liveness: HealthResponse | null;
  readiness: ReadyResponse | null;
  error: string | null;
}> {
  const apiInternalUrl = process.env.API_INTERNAL_URL || 'http://localhost:4000';
  try {
    const [liveRes, readyRes] = await Promise.all([
      fetch(`${apiInternalUrl}/api/health`, { cache: 'no-store' }),
      fetch(`${apiInternalUrl}/api/health/ready`, { cache: 'no-store' }),
    ]);

    const liveness = liveRes.ok ? ((await liveRes.json()) as HealthResponse) : null;
    const readiness = readyRes.ok ? ((await readyRes.json()) as ReadyResponse) : null;

    let error: string | null = null;
    if (!liveRes.ok) {
      error = `API Liveness probe failed with HTTP ${liveRes.status}`;
    } else if (!readyRes.ok) {
      error = `API Readiness probe failed with HTTP ${readyRes.status}`;
    }

    return { liveness, readiness, error };
  } catch (err: unknown) {
    return {
      liveness: null,
      readiness: null,
      error: err instanceof Error ? err.message : 'Failed to reach API service via internal proxy',
    };
  }
}

export default async function HealthPage() {
  const { liveness, readiness, error } = await getSystemHealth();
  const isHealthy = liveness?.status === 'ok' && readiness?.status === 'ready';

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <h1 className="font-display text-2xl font-bold text-text">System Health Status</h1>
          <span
            className={`inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-medium ${
              isHealthy ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
            }`}
          >
            {isHealthy ? 'Operational' : 'Degraded'}
          </span>
        </div>

        <div className="mt-6 space-y-4 text-sm">
          <div className="flex justify-between py-2 border-b border-border/50">
            <span className="text-text-muted">Next.js Web Service:</span>
            <span className="font-medium text-success">Healthy</span>
          </div>

          <div className="flex justify-between py-2 border-b border-border/50">
            <span className="text-text-muted">NestJS API (Proxy):</span>
            <span
              className={`font-medium ${liveness?.status === 'ok' ? 'text-success' : 'text-danger'}`}
            >
              {liveness?.status === 'ok' ? 'Connected (via proxy)' : 'Connection Failed'}
            </span>
          </div>

          <div className="flex justify-between py-2 border-b border-border/50">
            <span className="text-text-muted">PostgreSQL Database:</span>
            <span
              className={`font-medium ${
                readiness?.database === 'connected' ? 'text-success' : 'text-danger'
              }`}
            >
              {readiness?.database === 'connected' ? 'Connected (Ready)' : 'Disconnected'}
            </span>
          </div>

          {liveness && (
            <div className="flex justify-between py-2 border-b border-border/50">
              <span className="text-text-muted">Reported Timestamp:</span>
              <span className="font-mono text-xs text-text">{liveness.timestamp}</span>
            </div>
          )}

          {error && (
            <div className="rounded-md bg-danger/10 p-3 text-xs text-danger">
              Proxy / Service Notice: {error}
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
