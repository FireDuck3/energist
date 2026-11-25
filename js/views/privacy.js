// Сторінка «Політика конфіденційності» (#/privacy): відкрита без входу. Текст — js/privacy-policy.js.
import { h } from '../ui.js';
import { SECTIONS, EDITION, STATUS, OPERATOR, isPublishable, sectionBlocks } from '../privacy-policy.js';

// '2026-11-25' → '25 листопада 2026 р.'
const editionLabel = (iso) => new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  .format(new Date(`${iso}T00:00:00Z`));

const inline = (part) => (Array.isArray(part)
  ? part.map(inline)
  : typeof part === 'string' ? part : h('a', { href: part.href }, part.text));

function block(b) {
  if (b.h3) return h('h3', {}, b.h3);
  if (b.list) return h('ul', {}, b.list.map((item) => h('li', {}, inline(item))));
  return h('p', {}, inline(b));
}

// Примітка під формами входу й реєстрації: інформує, але не вимагає «згоди з усім».
// Нова вкладка — щоб не загубити заповнену форму чи відкрите вікно входу.
export function privacyNote() {
  return h('p', { class: 'privacy-note' }, 'Як WattWay обробляє ваші дані — у ',
    h('a', { href: '#/privacy', target: '_blank', rel: 'noopener' }, 'Політиці конфіденційності'), '.');
}

export function render(_params, root) {
  const draft = !isPublishable({ status: STATUS, operator: OPERATOR });
  // Хеш-роутер: якорі #id змінили б маршрут, тож зміст переводить фокус і прокручує сам.
  const go = (e) => {
    e.preventDefault();
    const target = root.querySelector(`#${e.currentTarget.dataset.target}`);
    target?.scrollIntoView?.({ block: 'start' });
    target?.focus({ preventScroll: true });
  };
  const toc = h('nav', { class: 'policy-toc card', 'aria-label': 'Зміст' },
    h('h2', { class: 'policy-toc-title' }, 'Зміст'),
    h('ol', {}, SECTIONS.map((s) =>
      h('li', {}, h('a', { href: '#/privacy', dataset: { target: `privacy-${s.id}` }, onclick: go }, s.title)))));

  root.append(h('div', { class: 'container policy-page' },
    h('article', { class: 'policy', 'aria-labelledby': 'privacy-title' },
      h('header', { class: 'policy-head' },
        h('h1', { id: 'privacy-title' }, 'Політика конфіденційності'),
        h('p', { class: 'policy-edition muted' }, draft ? 'Чернетка редакції від ' : 'Редакція від ',
          h('time', { datetime: EDITION }, editionLabel(EDITION)))),
      draft && h('div', { class: 'policy-draft', role: 'note' },
        h('b', {}, 'Чернетка. '),
        'Ця редакція ще не набрала чинності: бракує реквізитів володільця даних і контакту для звернень. Опис того, як сайт обробляє дані, відповідає поточній версії WattWay.'),
      toc,
      SECTIONS.map((s) => h('section', { class: 'policy-section', 'aria-labelledby': `privacy-${s.id}` },
        h('h2', { id: `privacy-${s.id}`, tabindex: '-1' }, s.title),
        sectionBlocks(s).map(block))))));
}
