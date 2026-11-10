const views = [
  ["users", "小程序用户"],
  ["registrations", "扫码登记"],
] as const;

// The platform's switch between the user list and scan registrations.
export default function ViewTabs({
  view,
  onChange,
}: {
  view: string;
  onChange: (view: string) => void;
}) {
  return (
    <div className="tabs users-views" role="tablist" aria-label="用户视图">
      {views.map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={view === key}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
