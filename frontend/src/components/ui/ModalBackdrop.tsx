import type { ReactNode } from "react";

interface ModalBackdropProps {
  onClose:  () => void;
  children: ReactNode;
}

export default function ModalBackdrop({ onClose, children }: ModalBackdropProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {children}
    </div>
  );
}
