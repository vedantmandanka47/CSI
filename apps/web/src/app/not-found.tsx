import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <h1 className="font-display text-4xl font-bold tracking-tight text-text sm:text-6xl">
        404 — Page Not Found
      </h1>
      <p className="mt-4 max-w-md text-text-muted">
        The requested resource could not be found or may have been moved.
      </p>
      <div className="mt-8">
        <Link
          href="/"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:opacity-90"
        >
          Return to home
        </Link>
      </div>
    </main>
  );
}
