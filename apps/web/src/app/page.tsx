import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <div className="max-w-xl rounded-lg border border-border bg-surface p-8 shadow-sm">
        <h1 className="font-display text-4xl font-bold tracking-tight text-text sm:text-5xl">
          CSI GCET SB
        </h1>
        <p className="mt-2 text-sm font-medium text-primary">
          Computer Society of India — GCET Student Branch
        </p>
        <p className="mt-4 text-text-muted">
          Official digital platform for student branch operations, membership management, event
          participation, verified attendance, and credentials.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            href="/health"
            className="rounded-md bg-surface-raised px-4 py-2 text-sm font-medium text-text hover:bg-border/30"
          >
            Check System Health
          </Link>
        </div>
      </div>
    </main>
  );
}

