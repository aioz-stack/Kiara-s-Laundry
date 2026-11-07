export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="animate-pulse space-y-4">
      <div className="h-8 w-48 rounded-md bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((key) => (
          <div key={key} className="h-24 rounded-lg bg-muted" />
        ))}
      </div>
      <div className="h-72 rounded-lg bg-muted" />
    </div>
  );
}
