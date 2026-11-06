import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-lg font-semibold">Page not found</h1>
      <p className="text-sm text-fg-muted">This admin page does not exist.</p>
      <Link href="/" className="text-sm font-medium text-brand hover:underline">
        Back to overview
      </Link>
    </main>
  );
}
