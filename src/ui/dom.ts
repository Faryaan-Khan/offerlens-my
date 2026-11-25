import { Modal, Toast } from '@tabler/core';
import { esc } from '../lib/format';

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T | null =>
  root.querySelector<T>(sel);
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T[] =>
  Array.from(root.querySelectorAll<T>(sel));

export const numVal = (el: HTMLInputElement | null, fallback = 0): number => {
  const n = el ? parseFloat(el.value) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

export function toast(message: string, kind: 'success' | 'danger' | 'info' = 'success'): void {
  const host = document.getElementById('toasts');
  if (!host) return;
  const icon = kind === 'success' ? 'check' : kind === 'danger' ? 'alert-triangle' : 'info-circle';
  const el = document.createElement('div');
  el.className = 'toast align-items-center border-0';
  el.setAttribute('role', 'status');
  el.innerHTML = `<div class="d-flex"><div class="toast-body"><i aria-hidden="true" class="ti ti-${icon} text-${kind} me-2"></i>${esc(message)}</div>
    <button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div>`;
  host.appendChild(el);
  const t = new Toast(el, { delay: 3000 });
  el.addEventListener('hidden.bs.toast', () => el.parentNode?.removeChild(el));
  t.show();
}

/**
 * Show a Tabler modal built from `body` HTML. `onSubmit` receives the form;
 * return false to keep the modal open (e.g. validation failed).
 */
export function openModal(opts: {
  title: string;
  body: string;
  submitLabel?: string;
  danger?: { label: string; onClick: () => void };
  onSubmit: (form: HTMLFormElement) => boolean | void;
  size?: 'sm' | 'lg';
}): void {
  const wrap = document.createElement('div');
  wrap.className = 'modal modal-blur fade';
  wrap.tabIndex = -1;
  wrap.setAttribute('role', 'dialog');
  const titleId = `m-${Math.random().toString(36).slice(2)}`;
  wrap.setAttribute('aria-labelledby', titleId);
  wrap.innerHTML = `
    <div class="modal-dialog modal-dialog-centered ${opts.size ? `modal-${opts.size}` : ''}" role="document">
      <form class="modal-content" novalidate>
        <div class="modal-header">
          <h2 class="modal-title" id="${titleId}">${esc(opts.title)}</h2>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">${opts.body}</div>
        <div class="modal-footer">
          ${opts.danger ? `<button type="button" class="btn btn-outline-danger me-auto" data-action="danger"><i aria-hidden="true" class="ti ti-trash me-1"></i>${esc(opts.danger.label)}</button>` : ''}
          <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">Cancel</button>
          <button type="submit" class="btn btn-primary" data-action="submit">${esc(opts.submitLabel ?? 'Save')}</button>
        </div>
      </form>
    </div>`;
  const opener = document.activeElement as HTMLElement | null;
  let afterHide: (() => void) | undefined;
  document.body.appendChild(wrap);
  const modal = new Modal(wrap);
  const form = wrap.querySelector('form')!;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      return;
    }
    if (opts.onSubmit(form) !== false) modal.hide();
  });
  wrap.querySelector('[data-action="danger"]')?.addEventListener('click', () => {
    // Open any follow-up (e.g. a confirm dialog) only once this modal has fully closed.
    afterHide = opts.danger?.onClick;
    modal.hide();
  });
  wrap.addEventListener('shown.bs.modal', () =>
    (form.querySelector('.modal-body input, .modal-body select, .modal-body textarea') as HTMLElement | null)?.focus(),
  );
  wrap.addEventListener('hidden.bs.modal', () => {
    modal.dispose();
    wrap.parentNode?.removeChild(wrap);
    if (afterHide) return afterHide();
    // Return focus to the control that opened the dialog, or to the main region if it was re-rendered.
    if (opener && opener.isConnected) opener.focus();
    else document.getElementById('main')?.focus({ preventScroll: true });
  });
  modal.show();
}

/** Confirm dialog built on the same modal (never window.confirm). */
export function confirmAction(title: string, message: string, label: string, onYes: () => void): void {
  openModal({ title, body: `<p class="mb-0">${esc(message)}</p>`, submitLabel: label, size: 'sm', onSubmit: () => onYes() });
}

export function download(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.parentNode?.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
