import { Search } from "lucide-react";
import { useState } from "react";
import { pageInfo, type PageId } from "../navigation";
import Modal from "./Modal";

export default function CommandPalette({
  current,
  recent,
  groups,
  onChoose,
  onClose,
}: {
  current: PageId;
  groups: { label: string; pages: PageId[] }[];
  recent: PageId[];
  onChoose: (page: PageId) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const matches = (id: PageId) => {
    const [label, description] = pageInfo[id];
    return (label + description).toLowerCase().includes(query.toLowerCase());
  };
  const choose = (id: PageId) => {
    onChoose(id);
    onClose();
  };
  const list = (ids: PageId[]) => (
    <div className="command-list">
      {ids.filter(matches).map((id) => {
        const [label, description, Icon] = pageInfo[id];
        return (
          <button
            key={id}
            className={id === current ? "active" : ""}
            onClick={() => choose(id)}
          >
            <Icon size={18} />
            <span>
              <b>{label}</b>
              <small>{description}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
  return (
    <Modal title="快速跳转" onClose={onClose} className="command-palette">
      <div
        className="edit-form"
        onKeyDown={(e) => {
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          const buttons = [
              ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
                ".command-list button",
              ),
            ],
            index = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
          if (index < 0) return;
          e.preventDefault();
          buttons[index + (e.key === "ArrowDown" ? 1 : -1)]?.focus();
        }}
      >
        <label className="search">
          <Search size={16} />
          <input
            autoFocus
            aria-label="搜索后台功能"
            placeholder="搜索页面或功能，按 Esc 关闭"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Enter opens the first match; arrow keys move into the list.
              const first = groups.flatMap((g) => g.pages).find(matches);
              if (e.key === "Enter" && query && first) {
                e.preventDefault();
                choose(first);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                e.currentTarget
                  .closest(".modal")
                  ?.querySelector<HTMLButtonElement>(".command-list button")
                  ?.focus();
              }
            }}
          />
        </label>
        {!query && recent.length > 0 && (
          <>
            <p className="nav-label">最近访问</p>
            {list(recent)}
          </>
        )}
        {groups.map((group) => {
          const pages = group.pages.filter(matches);
          return pages.length ? (
            <section key={group.label}>
              <p className="nav-label">{group.label}</p>
              {list(pages)}
            </section>
          ) : null;
        })}
        {!groups.some((group) => group.pages.some(matches)) && (
          <p className="quiet">没有匹配的后台功能</p>
        )}
      </div>
    </Modal>
  );
}
