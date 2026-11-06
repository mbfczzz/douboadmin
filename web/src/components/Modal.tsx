import { useRef, type CSSProperties } from "react";
import { X } from "lucide-react";
import { useOverlay } from "../hooks/useOverlay";
export default function Modal({
  title,
  children,
  onClose,
  className = "",
  subtitle,
  style,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
  subtitle?: React.ReactNode;
  style?: CSSProperties;
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
        style={style}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <div>
            <h2 title={title}>{title}</h2>
            {subtitle && <div className="modal-subtitle quiet">{subtitle}</div>}
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
