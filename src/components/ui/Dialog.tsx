import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { keepDialogFocus } from './dialogFocus';

export interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  dismissible?: boolean;
  className?: string;
  showCloseButton?: boolean;
}

export function Dialog({ title, onClose, children, dismissible = true, className = '', showCloseButton = true }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    // Close while still connected: native dialog can restore the opener before
    // React removes the node. Passive-effect cleanup runs after its removal.
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  return <dialog ref={ref} className={`terminal-dialog ${className}`.trim()} aria-label={title} onKeyDown={keepDialogFocus} onCancel={event => {
    // React owns dismissal; do not leave a mounted-but-closed native dialog behind.
    event.preventDefault();
    event.stopPropagation(); // Escape dismisses only this modal, including nested confirmations.
    if (dismissible) onClose();
  }}>
    <header className="flex items-center justify-between gap-5 border-b border-white/10 pb-5 mb-6"><h2 className="text-xl font-semibold">{title}</h2>{dismissible && showCloseButton && <button type="button" className="icon-button" onClick={onClose} aria-label="关闭弹窗">×</button>}</header>
    {children}
  </dialog>;
}
