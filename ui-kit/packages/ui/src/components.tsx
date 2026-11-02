import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const cx = (...items: (string | false | undefined)[]) => items.filter(Boolean).join(' ');
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md'; loading?: boolean };
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'secondary', size = 'md', loading, disabled, className, children, type = 'button', ...props }, ref) {
  return <button {...props} ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={cx('ok-button', 'ok-button--' + variant, 'ok-button--' + size, className)}>{loading ? '处理中…' : children}</button>;
});
export function IconButton({ label, ...props }: ButtonProps & { label: string }) {
  return <Button {...props} aria-label={label} title={label} className={cx('ok-icon-button', props.className)} />;
}
export function Badge({ children, className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span {...props} className={cx('ok-badge', className)}>{children}</span>;
}
export function Avatar({ src, name, size = 'md' }: { src?: string; name: string; size?: 'sm' | 'md' }) {
  return <span className={'ok-avatar ok-avatar--' + size}>{src ? <img src={src} alt={name} /> : <span role="img" aria-label={name}>{name.slice(0, 1)}</span>}</span>;
}
export function Card({ title, action, children, className, ...props }: Omit<HTMLAttributes<HTMLElement>, 'title'> & { title?: ReactNode; action?: ReactNode }) {
  return <section {...props} className={cx('ok-card', className)}>{(title || action) && <div className="ok-card-head"><h2>{title}</h2>{action}</div>}{children}</section>;
}
export function Checkbox({ label, description, className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string; description?: string }) {
  return <label className={cx('ok-checkbox-row', className)}><input {...props} type="checkbox" /><span><span className="ok-checkbox-label">{label}</span>{description && <small>{description}</small>}</span></label>;
}
export type NavigationItem = { id: string; label: string; icon?: ReactNode; href?: string };
export function Sidebar({ brand, items, activeId, onNavigate, footer }: { brand: ReactNode; items: NavigationItem[]; activeId: string; onNavigate?: (id: string) => void; footer?: ReactNode }) {
  return <aside className="ok-sidebar"><div className="ok-brand">{brand}</div><nav aria-label="主导航" className="ok-navigation">{items.map(item => item.href ? <a key={item.id} href={item.href} aria-current={activeId === item.id ? 'page' : undefined} onClick={() => onNavigate?.(item.id)}>{item.icon}<span>{item.label}</span></a> : <button key={item.id} type="button" aria-current={activeId === item.id ? 'page' : undefined} onClick={() => onNavigate?.(item.id)}>{item.icon}<span>{item.label}</span></button>)}</nav><div className="ok-sidebar-footer">{footer}</div></aside>;
}
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <header className="ok-page-header"><div><h1>{title}</h1>{description && <p>{description}</p>}</div><div className="ok-header-actions">{actions}</div></header>;
}
export function AppShell({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  return <div className="ok-app">{sidebar}<main className="ok-main">{children}</main></div>;
}
export function ContextPanel({ title = '项目内容', children, onClose }: { title?: string; children: ReactNode; onClose?: () => void }) {
  return <aside className="ok-context" aria-label={title}><div className="ok-context-heading"><b>{title}</b>{onClose && <IconButton label="收起项目内容" variant="ghost" onClick={onClose}>⇥</IconButton>}</div>{children}</aside>;
}
export function ChatMessage({ role, avatar, meta, children, actions }: { role: 'user' | 'assistant'; avatar?: ReactNode; meta?: string; children: ReactNode; actions?: ReactNode }) {
  return <article className={'ok-message ok-message--' + role}>{role === 'assistant' && avatar}<div className="ok-message-body">{role === 'assistant' && meta && <div className="ok-message-meta">{meta}</div>}<div className={role === 'user' ? 'ok-user-bubble' : 'ok-reply'}>{children}</div>{role === 'user' && meta && <div className="ok-message-meta">{meta}</div>}{actions && <div className="ok-message-actions">{actions}</div>}</div></article>;
}
export function Composer({ onSend, placeholder = '写下你的想法或要求…', disabled = false, tools }: { onSend: (value: string) => void | Promise<void>; placeholder?: string; disabled?: boolean; tools?: ReactNode }) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const submit = async () => {
    const message = value.trim();
    if (!message || disabled || lock.current) return;
    lock.current = true; setSending(true); setError('');
    try { await onSend(message); setValue(''); }
    catch { setError('发送失败，请重试。'); }
    finally { lock.current = false; setSending(false); }
  };
  return <form className="ok-composer" onSubmit={event => { event.preventDefault(); void submit(); }}>
    <textarea aria-label="消息内容" value={value} disabled={disabled || sending} placeholder={placeholder} onChange={event => setValue(event.target.value)} onKeyDown={event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); void submit(); }
    }} />
    <div className="ok-composer-bottom"><div className="ok-composer-tools">{tools}</div><Button type="submit" variant="primary" disabled={disabled || !value.trim()} loading={sending} aria-label="发送消息">↑</Button></div>
    {error && <p className="ok-error" role="alert">{error}</p>}
  </form>;
}
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="ok-empty"><h2>{title}</h2>{description && <p>{description}</p>}{action}</div>;
}
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    if (!open || !dialog.current) return;
    const node = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    node.showModal();
    return () => { node.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, [open]);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(<dialog ref={dialog} className="ok-modal" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); closeRef.current(); }} onClick={event => {
    if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeRef.current(); }
  }}><div className="ok-modal-head"><h2 id={titleId}>{title}</h2><IconButton label="关闭弹窗" variant="ghost" onClick={onClose}>×</IconButton></div>{children}</dialog>, document.body);
}
export function Toast({ message }: { message: string }) {
  return <div className={cx('ok-toast', !message && 'ok-toast--empty')} role="status" aria-live="polite">{message}</div>;
}
