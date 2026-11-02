export default function RequestState({
  loading,
  error,
  retry,
}: {
  loading?: boolean;
  error?: string;
  retry: () => void;
}) {
  if (error)
    return (
      <div className="error" role="alert">
        {error} <button onClick={retry}>重试</button>
      </div>
    );
  return loading ? (
    <p className="quiet" role="status">
      正在加载…
    </p>
  ) : null;
}
