import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * In-app replacement for window.confirm (which shows the browser's
 * "localhost says" box). Usage:
 *   const [confirm, dialog] = useConfirm();
 *   if (!(await confirm({ title, text, confirmLabel, danger }))) return;
 *   ...render {dialog} somewhere in the page
 */
export function useConfirm() {
  const [request, setRequest] = useState(null);

  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        setRequest({ ...opts, resolve });
      }),
    []
  );

  const close = (answer) => {
    request?.resolve(answer);
    setRequest(null);
  };

  const dialog = request ? <ConfirmDialog {...request} onCancel={() => close(false)} onConfirm={() => close(true)} /> : null;
  return [confirm, dialog];
}

function ConfirmDialog({ title, text, confirmLabel = 'Confirm', danger = false, onCancel, onConfirm }) {
  const confirmRef = useRef(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-text">
        <h2 id="dialog-title">{title}</h2>
        {text && <p id="dialog-text">{text}</p>}
        <div className="dialog__actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" ref={confirmRef} className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-dark'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
