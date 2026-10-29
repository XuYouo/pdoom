import { useEffect, useRef, type ReactNode } from 'react';

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
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  return <dialog ref={ref} className={`terminal-dialog ${className}`.trim()} aria-label={title} onCancel={event => {
    // React owns dismissal; do not leave a mounted-but-closed native dialog behind.
    event.preventDefault();
    if (dismissible) onClose();
  }}>
    <header className="flex items-center justify-between gap-5 border-b border-white/10 pb-5 mb-6"><h2 className="text-xl font-semibold">{title}</h2>{dismissible && showCloseButton && <button type="button" className="icon-button" onClick={onClose} aria-label="关闭弹窗">×</button>}</header>
    {children}
  </dialog>;
}
