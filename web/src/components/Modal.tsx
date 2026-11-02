import { useRef } from "react";
import { X } from "lucide-react";
import { useOverlay } from "../hooks/useOverlay";
export default function Modal({
  title,
  children,
  onClose,
  className = "",
  subtitle,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
  subtitle?: string;
}) {
  const dialog = useRef<HTMLElement>(null);
  const backdrop = useRef(false);
  useOverlay(dialog, onClose);
  return (
    <div
      className={"scrim " + (className ? className + "-mask" : "")}
      onPointerDown={(e) => {
        backdrop.current = e.target === e.currentTarget;
      }}
      onPointerUp={(e) => {
        backdrop.current &&=
          document.elementFromPoint(e.clientX, e.clientY) === e.currentTarget;
      }}
      onPointerCancel={() => {
        backdrop.current = false;
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (backdrop.current && e.target === e.currentTarget) onClose();
        backdrop.current = false;
      }}
    >
      <section
        ref={dialog}
        tabIndex={-1}
        className={"modal " + className}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <div>
            <h2 title={title}>{title}</h2>
            {subtitle && <p className="modal-subtitle">{subtitle}</p>}
          </div>
          <button className="icon" aria-label="关闭" onClick={onClose}>
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
