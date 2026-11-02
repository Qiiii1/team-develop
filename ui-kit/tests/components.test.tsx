import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button, Composer, Modal, Sidebar } from '../packages/ui/src';

describe('UI contracts', () => {
  it('prevents loading buttons from triggering duplicate actions', async () => {
    const click = vi.fn();
    render(<Button loading onClick={click}>保存</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(click).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });
  it('submits trimmed text and ignores whitespace', async () => {
    const send = vi.fn(); const user = userEvent.setup();
    render(<Composer onSend={send} />);
    const input = screen.getByRole('textbox');
    await user.type(input, '   {Enter}'); expect(send).not.toHaveBeenCalled();
    await user.clear(input); await user.type(input, '  你好  {Enter}');
    expect(send).toHaveBeenCalledWith('你好');
    await waitFor(() => expect(input).toHaveValue(''));
  });
  it('keeps draft after failure and allows retry', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    const user = userEvent.setup(); render(<Composer onSend={send} />);
    await user.type(screen.getByRole('textbox'), '保留草稿{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('发送失败');
    expect(screen.getByRole('textbox')).toHaveValue('保留草稿');
    await user.click(screen.getByRole('button', { name: '发送消息' }));
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
    expect(send).toHaveBeenCalledTimes(2);
  });
  it('does not submit while composing Chinese input or on Shift+Enter', () => {
    const send = vi.fn(); render(<Composer onSend={send} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '中文' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(send).not.toHaveBeenCalled();
  });
  it('provides current-page semantics and navigation callbacks', async () => {
    const navigate = vi.fn();
    render(<Sidebar brand="OK啊" items={[{ id: 'ai', label: '个人 AI' },{ id: 'kit', label: 'UI Kit' }]} activeId="ai" onNavigate={navigate} />);
    expect(screen.getByRole('button', { name: '个人 AI' })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(screen.getByRole('button', { name: 'UI Kit' }));
    expect(navigate).toHaveBeenCalledWith('kit');
  });
  it('uses modal semantics, closes on Escape and restores focus', async () => {
    // jsdom lacks native dialog; browser handles its focus trap.
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
    const close = vi.fn(); const trigger = document.createElement('button');
    document.body.append(trigger); trigger.focus();
    const { rerender } = render(<Modal open title="引用资料" onClose={close}><button>资料</button></Modal>);
    const dialog = screen.getByRole('dialog', { name: '引用资料' });
    expect(dialog).toHaveAttribute('open');
    fireEvent(dialog, new Event('cancel', { cancelable: true })); expect(close).toHaveBeenCalledOnce();
    rerender(<Modal open={false} title="引用资料" onClose={close}>资料</Modal>);
    expect(trigger).toHaveFocus(); trigger.remove();
    expect(document.body.style.overflow).toBe('');
  });
});
