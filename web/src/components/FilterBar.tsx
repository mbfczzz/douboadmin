import { Search } from "lucide-react";
interface Props {
  options: readonly (readonly [string, string])[];
  value: string;
  onChange: (value: string) => void;
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  inside?: boolean;
}
export default function FilterBar(p: Props) {
  return (
    <div className={"toolbar" + (p.inside ? " inside" : "")}>
      <div className="tabs">
        {p.options.map(([value, label]) => (
          <button
            key={value}
            className={p.value === value ? "active" : ""}
            onClick={() => p.onChange(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="search">
        <Search size={17} />
        <input
          placeholder={p.placeholder}
          value={p.search}
          onChange={(e) => p.onSearch(e.target.value)}
        />
      </label>
    </div>
  );
}
