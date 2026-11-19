// Вікно скарги: на приватну точку, публічну станцію або співрозмовника по бронюванню.
import { h, openModal } from '../ui.js';
import { REPORT_REASONS, MAX_DETAILS, validateReport, reportErrorText } from '../trust.js';

const HEADINGS = {
  spot: 'Повідомити про проблему з точкою',
  station: 'Повідомити про проблему зі станцією',
  user: 'Поскаржитися на співрозмовника',
};

// target: { targetType: 'spot'|'station'|'user', targetId, bookingId?, title }
export function openReport(target, session) {
  const open = () => showForm(target, session);
  if (session?.requireAuth) session.requireAuth(open, 'Увійдіть, щоб надіслати повідомлення');
  else open();
}

function showForm({ targetType, targetId, bookingId, title }, session) {
  const sel = { reason: null, details: '' };
  const error = h('p', { class: 'field-error form-error', role: 'alert', hidden: true });
  const reasonError = h('span', { class: 'field-error', hidden: true });
  const detailsError = h('span', { class: 'field-error', hidden: true });
  const counter = h('span', { class: 'hint' }, `0 / ${MAX_DETAILS}`);
  const chips = h('div', { class: 'chips report-reasons' });
  const drawChips = () => chips.replaceChildren(...REPORT_REASONS[targetType].map((r) =>
    h('button', { type: 'button', class: `chip${sel.reason === r.id ? ' active' : ''}`, 'aria-pressed': String(sel.reason === r.id),
      onclick: () => { sel.reason = r.id; reasonError.hidden = true; drawChips(); } }, r.label)));
  drawChips();
  const textarea = h('textarea', { class: 'input', rows: 4, maxlength: MAX_DETAILS, 'aria-label': 'Опис проблеми',
    placeholder: 'Що саме не так? Наприклад: розетки немає за цією адресою.',
    oninput: (e) => { sel.details = e.target.value; counter.textContent = `${sel.details.length} / ${MAX_DETAILS}`; } });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Надіслати');

  const form = h('form', { class: 'wizard report-form', novalidate: true, async onsubmit(e) {
    e.preventDefault();
    error.hidden = true;
    const { ok, errors } = validateReport(sel, targetType);
    reasonError.textContent = errors.reason ?? ''; reasonError.hidden = !errors.reason;
    detailsError.textContent = errors.details ?? ''; detailsError.hidden = !errors.details;
    if (!ok || submit.disabled) return;
    submit.disabled = true;
    try {
      await session.service.submitReport({ targetType, targetId, reason: sel.reason, details: sel.details.trim(), bookingId });
      modal.setContent(h('div', { class: 'wizard' },
        h('h2', {}, 'Дякуємо!'),
        h('p', {}, 'Ми перевіримо повідомлення. Ваше ім\'я не показується тому, на кого надійшла скарга.'),
        h('div', { class: 'wizard-actions' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: () => modal.close() }, 'Готово'))));
    } catch (err) {
      error.textContent = reportErrorText(err?.code, err?.message);
      error.hidden = false;
    } finally { submit.disabled = false; }
  } },
    h('p', { class: 'eyebrow' }, title),
    h('h2', {}, HEADINGS[targetType]),
    h('div', { class: 'form-field' }, h('span', { class: 'field-label' }, 'Причина'), chips, reasonError),
    h('label', { class: 'form-field' }, h('span', { class: 'field-label' }, 'Опис (необов\'язково, для «Інше» — обов\'язково)'), textarea, counter, detailsError),
    error,
    h('div', { class: 'wizard-actions' },
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => modal.close() }, 'Скасувати'),
      submit));
  const modal = openModal(form, {});
  return modal;
}
