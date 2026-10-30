import React from 'react';
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
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8 space-y-8">
      {/* Header */}
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary border border-primary/20">
          Infrastructure Observability
        </div>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="font-display text-3xl font-bold tracking-tight text-text">
            System Diagnostics &amp; Status
          </h1>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border ${
              isHealthy
                ? 'bg-success/15 text-success border-success/30'
                : 'bg-danger/15 text-danger border-danger/30'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-success animate-pulse' : 'bg-danger'}`} />
            {isHealthy ? 'All Systems Operational' : 'Degraded Connectivity'}
          </span>
        </div>
        <p className="text-xs sm:text-sm text-text-muted leading-relaxed">
          Real-time service discovery and reverse proxy connectivity status for CSI GCET platform services.
        </p>
      </div>

      {/* Service Status Cards */}
      <div className="rounded-xl border border-border bg-surface p-6 sm:p-8 shadow-sm space-y-5">
        <h2 className="font-display font-semibold text-text text-base border-b border-border pb-3">
          Component Health Probes
        </h2>

        <div className="space-y-3 text-xs sm:text-sm">
          <div className="flex items-center justify-between py-2 border-b border-border/50">
            <div>
              <span className="font-medium text-text block">Next.js Edge Web Service</span>
              <span className="text-xs text-text-muted">Port 3000 &bull; Same-origin proxy host</span>
            </div>
            <span className="rounded bg-success/10 px-2 py-0.5 text-xs font-semibold text-success border border-success/20">
              Active &bull; Operational
            </span>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-border/50">
            <div>
              <span className="font-medium text-text block">NestJS Core API Service</span>
              <span className="text-xs text-text-muted">Port 4000 &bull; Express HTTP Engine</span>
            </div>
            <span
              className={`rounded px-2 py-0.5 text-xs font-semibold border ${
                liveness?.status === 'ok'
                  ? 'bg-success/10 text-success border-success/20'
                  : 'bg-danger/10 text-danger border-danger/20'
              }`}
            >
              {liveness?.status === 'ok' ? 'Connected (via proxy)' : 'Unreachable'}
            </span>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-border/50">
            <div>
              <span className="font-medium text-text block">PostgreSQL Primary Database</span>
              <span className="text-xs text-text-muted">Relational store with exclusion constraints</span>
            </div>
            <span
              className={`rounded px-2 py-0.5 text-xs font-semibold border ${
                readiness?.database === 'connected'
                  ? 'bg-success/10 text-success border-success/20'
                  : 'bg-danger/10 text-danger border-danger/20'
              }`}
            >
              {readiness?.database === 'connected' ? 'Connected (Ready)' : 'Disconnected'}
            </span>
          </div>

          {liveness && (
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <span className="text-text-muted">Probe Timestamp:</span>
              <span className="font-mono text-xs text-text">{liveness.timestamp}</span>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-danger/10 border border-danger/20 p-3 text-xs text-danger leading-relaxed">
              Diagnostic Notice: {error}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <Link href="/" className="text-xs font-semibold text-primary hover:underline">
          Return to Branch Homepage
        </Link>
      </div>
    </div>
  );
}
