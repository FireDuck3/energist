// Повідомлення господарю про точку, яку приховав модератор: причина й кнопка «перевірте знову».
// Спільне для кабінету господаря й сторінки точки.
import { h } from '../ui.js';
import { withIcon } from '../icons.js';
import { notify } from '../notifications.js';
import { dateTime } from '../admin.js';

export function hiddenNotice(spot, pilot) {
  const requested = spot.reviewRequestedAt;
  const error = h('span', { class: 'field-error', role: 'alert', hidden: true });
  const ask = pilot?.requestReview && !requested && h('button', { type: 'button', class: 'btn btn-secondary btn-sm', async onclick(e) {
    const button = e.currentTarget;
    if (button.disabled) return;
    button.disabled = true;
    error.hidden = true;
    try {
      await pilot.requestReview(spot.id);
      notify('Запит надіслано. Модератор перевірить точку й поверне її на карту, якщо все гаразд.');
    } catch {
      error.textContent = 'Не вдалося надіслати запит. Спробуйте ще раз.';
      error.hidden = false;
      button.disabled = false;
    }
  } }, 'Я виправив — перевірте знову');
  return h('div', { class: 'own-spot-hidden', role: 'note' },
    h('b', {}, withIcon('eye-off', 'Точку приховав модератор — гості її не бачать.')),
    spot.hiddenReason && h('span', {}, `Причина: ${spot.hiddenReason}`),
    requested
      ? h('span', { class: 'muted' }, `Запит на повторну перевірку надіслано ${dateTime(requested)}. Модератор перегляне точку.`)
      : h('span', { class: 'muted' }, 'Виправте дані через «Редагувати», а потім попросіть модератора перевірити точку знову.'),
    ask, error);
}
