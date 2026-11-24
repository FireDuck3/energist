// Контакти господаря у вікні точки на карті й на сторінці точки.
// Телефон і email не приходять разом з карткою: увійшлий користувач відкриває їх кнопкою, а сервер
// (reveal_host_contacts) віддає лише те, що господар обрав у каналах зв'язку, і рахує денний ліміт.
// Гість з підтвердженим бронюванням і сам господар отримують контакти вже в картці.
import { h } from '../ui.js';
import { CONTACT_REVEALS_PER_DAY } from '../host-profile.js';

function links({ phone, email }) {
  return [phone && h('a', { href: `tel:${phone}` }, phone), email && h('a', { href: `mailto:${email}` }, email)]
    .filter(Boolean).flatMap((c, i) => (i ? [' · ', c] : [c]));
}

// card — результат toHostCard. reveal() → { phone, email, limited }; onRevealed — щоб закешувати відкрите.
export function hostContacts(card, { own = false, signedIn = false, reveal, requireAuth, onRevealed } = {}) {
  if (!card) return null;
  const label = own ? 'Ваші контакти для гостей: ' : 'Контакти: ';
  if (card.phone || card.email) return h('div', { class: 'host-contacts' }, h('b', {}, label), ...links(card));
  if (own) {
    return card.hasContacts ? null : h('div', { class: 'hint' },
      'Гості не бачать ваших телефону й email: оберіть у кабінеті «Дзвінок», месенджер або «Email».');
  }
  if (!card.hasContacts) return null;
  if (!signedIn) {
    return h('div', { class: 'popup-signin' }, 'Увійдіть, щоб побачити телефон і email ',
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => requireAuth?.('Увійдіть, щоб побачити контакти господаря') }, 'Увійти'));
  }

  const box = h('div', { class: 'host-contacts' });
  const show = (...nodes) => box.replaceChildren(...nodes);
  const button = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: async () => {
    if (!reveal) return;
    button.disabled = true;
    try {
      const res = await reveal();
      if (res?.limited) {
        show(h('span', { class: 'muted' },
          `Ви вже відкрили контакти ${CONTACT_REVEALS_PER_DAY} господарів на добу. Спробуйте завтра або напишіть господарю в чаті після бронювання.`));
      } else if (res?.phone || res?.email) {
        const contacts = { phone: res.phone ?? null, email: res.email ?? null };
        show(h('b', {}, label), ...links(contacts));
        onRevealed?.(contacts);
      } else {
        show(h('span', { class: 'muted' }, 'Господар більше не ділиться телефоном чи email — напишіть у чаті після бронювання.'));
      }
    } catch {
      button.disabled = false;
      show(button, ' ', h('span', { class: 'muted' }, 'Не вдалося завантажити контакти. Спробуйте ще раз'));
    }
  } }, 'Показати контакти');
  show(button);
  return box;
}
