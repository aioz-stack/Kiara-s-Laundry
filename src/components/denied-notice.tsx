export function DeniedNotice({ denied }: { denied?: string }) {
  if (!denied) return null;
  return (
    <p role="alert" className="mb-4 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
      Your account does not have access to that page.
    </p>
  );
}
