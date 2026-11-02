import { useEffect, useRef, useState } from "react";
import { useOverlay } from "./useOverlay";

export function useDrawer() {
  const [open, setOpen] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  useOverlay(closeButton, () => setOpen(false), open);
  useEffect(() => {
    if (!open) return;
    const resize = () => {
      if (innerWidth > 640) setOpen(false);
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [open]);
  return { open, setOpen, closeButton };
}
