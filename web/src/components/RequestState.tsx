export function LoadingState({ label = "正在加载" }: { label?: string }) {
  return (
    <div className="loading-state" role="status" aria-label={label}>
      <span />
      <span />
      <span />
    </div>
  );
}

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
      <div className="error with-action" role="alert">
        <span>{error}</span>
        <button onClick={retry}>重试</button>
      </div>
    );
  return loading ? <LoadingState /> : null;
}
