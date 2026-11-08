// Short, read-only provider number; the full id stays available on hover.
export default function ProviderId({ id }: { id: string }) {
  const shortId = id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
  return (
    <span className="provider-id mono" title={id}>
      {shortId}
    </span>
  );
}
