// Адмінпанель (#/admin, #/admin/<вкладка>): огляд, скарги, точки, користувачі, бронювання, журнал.
// Інтерфейс лише показує кнопки адміністраторам; кожну дію перевіряє сервер (require_admin у функціях admin_*).
import { h, openModal, plural } from '../ui.js';
import { icon } from '../icons.js';
import { signInPrompt } from './auth-modal.js';
import {
  ADMIN_TABS, adminTab, TARGET_LABEL, REPORT_STATUS, BOOKING_STATUS, BOOKING_PROBLEM, USER_STATUS, ACTION_LABEL,
  SPOT_FILTERS, reasonLabel, fullName, spotState, filterSpots, overviewTiles, dateTime, slotLabel, mapsLink,
  validateNote, adminErrorText,
} from '../admin.js';

const badge = ([label, cls]) => h('span', { class: `badge ${cls}` }, label);
const short = (id) => String(id ?? '').slice(0, 8);

// Вікно з причиною чи коментарем. Повертає текст або null, якщо закрили; promise.close() закриває вікно ззовні.
export function askNote({ title, text, label = 'Коментар', placeholder = '', value = '', required = false, confirm = 'Підтвердити', danger = false }) {
  let modal = null;
  const promise = new Promise((resolve) => {
    let done = false;
    const finish = (result) => { if (!done) { done = true; resolve(result); } };
    const error = h('span', { class: 'field-error', role: 'alert', hidden: true });
    const area = h('textarea', { class: 'input', rows: 3, maxlength: 500, placeholder, 'aria-label': label });
    area.value = value;
    const form = h('form', { class: 'wizard admin-note-form', novalidate: true, onsubmit(e) {
      e.preventDefault();
      const problem = validateNote(area.value, { required });
      error.textContent = problem ?? '';
      error.hidden = !problem;
      if (problem) return;
      finish(area.value.trim());
      modal.close();
    } },
    h('h2', {}, title),
    text && h('p', { class: 'muted' }, text),
    h('label', { class: 'form-field' }, h('span', { class: 'field-label' }, required ? `${label} *` : `${label} (необов'язково)`), area, error),
    h('div', { class: 'wizard-actions' },
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => modal.close() }, 'Скасувати'),
      h('button', { type: 'submit', class: `btn ${danger ? 'btn-danger' : 'btn-primary'}` }, confirm)));
    modal = openModal(form, { onClose: () => finish(null) });
    area.focus();
  });
  promise.close = () => modal?.close();
  return promise;
}

function gate(iconName, title, text, link) {
  return h('div', { class: 'container gate' }, h('div', { class: 'gate-card card' },
    h('span', { class: 'gate-icon' }, icon(iconName, { size: 40 })), h('h1', {}, title), h('p', { class: 'muted' }, text),
    link && h('a', { class: 'btn btn-primary', href: link[0] }, link[1])));
}

export function render(params, root, _store, session) {
  const tab = adminTab(params.tab);
  let shownFor = null;
  let alive = true;
  // Відкрите вікно з причиною закриваємо, коли йдемо зі сторінки: інакше дію можна підтвердити вже «наосліп».
  let openNote = null;
  const ask = (options) => {
    const note = askNote(options);
    openNote = note;
    note.then(() => { if (openNote === note) openNote = null; });
    return note;
  };

  function update() {
    const { status, user } = session.getState();
    if (status === 'loading') {
      shownFor = null;
      root.replaceChildren(h('div', { class: 'container gate muted' }, 'Завантаження…'));
      return;
    }
    if (status === 'demo') {
      shownFor = null;
      root.replaceChildren(gate('flask', 'Демо-режим', 'Адмінпанель працює лише з реальною базою. Вийдіть з демо й увійдіть акаунтом адміністратора.', ['#/map', 'До карти']));
      return;
    }
    if (status !== 'signedIn') {
      shownFor = null;
      root.replaceChildren(signInPrompt({
        title: 'Адмінпанель доступна після входу',
        text: 'Увійдіть акаунтом адміністратора WattWay.',
        reason: 'Увійдіть, щоб відкрити адмінпанель',
      }, session));
      return;
    }
    if (!user?.isAdmin) {
      shownFor = null;
      root.replaceChildren(gate('ban', 'Немає доступу', 'Ця сторінка лише для адміністраторів WattWay.', ['#/map', 'До карти']));
      return;
    }
    if (shownFor === user.uid) return; // повторна подія сесії — панель уже на екрані
    shownFor = user.uid;
    mountPanel(user, session.service.admin);
  }

  function mountPanel(me, api) {
    const flash = h('p', { class: 'admin-flash', role: 'status', hidden: true });
    const body = h('div', { class: 'admin-body' });
    const counts = {};
    const tabs = h('nav', { class: 'admin-tabs', 'aria-label': 'Розділи адмінпанелі' });
    const drawTabs = () => tabs.replaceChildren(...ADMIN_TABS.map(([id, label]) =>
      h('a', { class: `admin-tab${id === tab ? ' active' : ''}`, href: `#/admin/${id}`, 'aria-current': id === tab ? 'page' : null },
        label, counts[id] > 0 && h('span', { class: 'unread-badge' }, String(counts[id])))));
    drawTabs();

    const say = (text, kind = 'ok') => {
      flash.textContent = text;
      flash.className = `admin-flash admin-flash-${kind}`;
      flash.hidden = false;
    };
    // Дія адміністратора: кнопка вимикається до відповіді сервера, потім список перечитується.
    async function act(button, action, success) {
      if (button?.disabled) return;
      if (button) button.disabled = true;
      flash.hidden = true;
      try {
        await action();
        say(success);
        await load();
        refreshCounts();
      } catch (err) {
        say(adminErrorText(err), 'error');
      } finally {
        if (button) button.disabled = false;
      }
    }

    const state = { reportsAll: false, spotFilter: 'all', spotQuery: '', userQuery: '', bookingsAll: false };

    function refreshCounts() {
      api.overview().then((o) => {
        if (!alive) return;
        counts.reports = Number(o?.open_reports ?? 0);
        counts.bookings = Number(o?.problem_bookings ?? 0);
        counts.spots = Number(o?.review_requests ?? 0);
        drawTabs();
      }, () => {});
    }

    // Кожне завантаження має номер: відповідь на старіший запит (повільна мережа, швидке перемикання
    // фільтрів) не перемалює список поверх новішої.
    let loadSeq = 0;
    async function load() {
      const seq = ++loadSeq;
      if (!body.childElementCount) body.replaceChildren(h('p', { class: 'muted admin-loading' }, 'Завантаження…'));
      try {
        const view = await TABS[tab]();
        if (alive && seq === loadSeq) body.replaceChildren(view);
      } catch (err) {
        if (!alive || seq !== loadSeq) return;
        body.replaceChildren(h('div', { class: 'card admin-error' },
          h('p', { class: 'form-error' }, adminErrorText(err)),
          h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => { body.replaceChildren(); load(); } }, 'Спробувати ще раз')));
      }
    }

    // ---- Огляд ----
    async function overview() {
      const [o, runs] = await Promise.all([api.overview(), api.listSyncRuns().catch(() => null)]);
      return h('div', { class: 'admin-overview' },
        h('div', { class: 'stats admin-tiles' }, overviewTiles(o).map(([key, label, value, note, target, attention]) =>
          h('a', { class: `stat card stat-link${attention ? ' stat-attention' : ''}`, href: `#/admin/${target}`, dataset: { tile: key } },
            h('span', { class: 'stat-label' }, label),
            h('b', { class: 'stat-value' }, String(value)),
            h('span', { class: 'stat-note' }, note)))),
        h('section', { class: 'card panel admin-section' },
          h('h2', { class: 'panel-title' }, 'Синхронізація публічних станцій'),
          h('p', { class: 'muted' }, 'Щоденне оновлення станцій з Open Charge Map та OpenStreetMap. Помилки — червоним.'),
          !runs ? h('p', { class: 'muted' }, 'Не вдалося прочитати журнал синхронізації.')
            : !runs.length ? h('p', { class: 'muted' }, 'Синхронізація ще не запускалась.')
              : h('ul', { class: 'admin-list admin-runs' }, runs.map((r) => h('li', { class: `admin-run${r.error ? ' admin-run-error' : ''}` },
                h('b', {}, dateTime(r.started_at)), ' · ', r.source, ' · ',
                r.error ? h('span', { class: 'admin-run-text' }, `Помилка: ${r.error}`)
                  : h('span', { class: 'muted' }, r.finished_at
                    ? `отримано ${r.fetched}, нових ${r.inserted}, оновлено ${r.updated}, пропущено ${r.skipped}`
                    : 'не завершилась'))))),
        h('section', { class: 'card panel admin-section' },
          h('h2', { class: 'panel-title' }, 'Як додати адміністратора'),
          h('p', { class: 'muted' }, 'Права видаються лише в Supabase → SQL Editor. З сайту їх змінити не можна:'),
          h('pre', { class: 'admin-sql' }, "insert into public.admins(user_id)\nselect id from public.users where email = 'адреса@приклад.com';")));
    }

    // ---- Скарги ----
    async function reports() {
      const rows = await api.listReports(state.reportsAll);
      const head = h('div', { class: 'admin-toolbar' },
        h('div', { class: 'chips' }, [[false, 'Відкриті'], [true, 'Усі']].map(([all, label]) =>
          h('button', { type: 'button', class: `chip${state.reportsAll === all ? ' active' : ''}`, 'aria-pressed': String(state.reportsAll === all),
            onclick: () => { state.reportsAll = all; load(); } }, label))),
        h('span', { class: 'muted' }, `${rows.length} ${plural(rows.length, ['скарга', 'скарги', 'скарг'])}`));
      if (!rows.length) return h('div', {}, head, h('p', { class: 'card panel muted' }, state.reportsAll ? 'Скарг ще не було.' : 'Відкритих скарг немає.'));
      return h('div', {}, head, h('ul', { class: 'admin-list' }, rows.map(reportCard)));
    }

    function reportCard(r) {
      const open = r.status === 'open';
      const targetLink = r.target_type === 'spot' && r.target_state === 'active'
        ? h('a', { href: `#/spot/${r.target_id}` }, r.target_label) : (r.target_label ?? `Об'єкт ${short(r.target_id)} не знайдено`);
      const resolve = (decision) => async (e) => {
        const button = e.currentTarget;
        const note = await ask(decision === 'resolved'
          ? { title: 'Скаргу вирішено', text: 'Що зроблено? Скаржник цього не бачить — це для журналу.', confirm: 'Позначити вирішеною' }
          : { title: 'Відхилити скаргу', text: 'Чому скарга безпідставна? Запис піде в журнал.', confirm: 'Відхилити' });
        if (note === null) return;
        act(button, () => api.resolveReport(r.id, decision, note), decision === 'resolved' ? 'Скаргу позначено вирішеною' : 'Скаргу відхилено');
      };
      const hideSpot = async (e) => {
        const button = e.currentTarget;
        const note = await ask({ title: 'Сховати точку з карти', required: true, danger: true, label: 'Причина',
          text: 'Гості перестануть бачити точку, майбутні бронювання буде скасовано. Причину побачить господар. Скаргу буде позначено вирішеною.',
          value: reasonLabel('spot', r.reason), confirm: 'Сховати' });
        if (note === null) return;
        // Одна транзакція на сервері: або точку сховано й скаргу закрито, або нічого не змінилось.
        act(button, () => api.actOnReport(r.id, 'hide_spot', note), 'Точку приховано, скаргу вирішено');
      };
      const blockUser = async (e) => {
        const button = e.currentTarget;
        const note = await ask({ title: 'Заблокувати користувача', required: true, danger: true, label: 'Причина',
          text: 'Людина не зможе увійти, її майбутні бронювання буде скасовано, а точки зникнуть з карти. Скаргу буде позначено вирішеною.',
          value: reasonLabel('user', r.reason), confirm: 'Заблокувати' });
        if (note === null) return;
        act(button, () => api.actOnReport(r.id, 'block_user', note), 'Користувача заблоковано, скаргу вирішено');
      };
      return h('li', { class: 'card admin-card', dataset: { id: r.id } },
        h('div', { class: 'admin-card-head' },
          h('span', { class: 'badge badge-info' }, TARGET_LABEL[r.target_type] ?? r.target_type),
          badge(REPORT_STATUS[r.status] ?? [r.status, 'badge-muted']),
          r.target_state === 'hidden' && badge(['Точку приховано', 'badge-muted']),
          r.target_state === 'suspended' && badge(['Заблокований', 'badge-muted']),
          h('span', { class: 'muted admin-time' }, dateTime(r.created_at))),
        h('h3', { class: 'admin-card-title' }, targetLink),
        h('p', {}, h('b', {}, reasonLabel(r.target_type, r.reason)), r.details && h('span', {}, ` — ${r.details}`)),
        h('p', { class: 'muted admin-meta' },
          `Скаржник: ${r.reporter_name || 'Без імені'}${r.reporter_email ? ` · ${r.reporter_email}` : ''}`,
          r.booking_id && ` · бронювання ${short(r.booking_id)}`,
          open && Number(r.same_target_open) > 1 && h('b', { class: 'admin-hot' }, ` · ${r.same_target_open} відкритих скарг на цей об'єкт`)),
        !open && h('p', { class: 'admin-resolution' }, `${dateTime(r.resolved_at)}: ${r.resolution || 'без коментаря'}`),
        open && h('div', { class: 'admin-actions' },
          r.target_type === 'spot' && r.target_state === 'active' && h('button', { type: 'button', class: 'btn btn-danger-ghost btn-sm', onclick: hideSpot }, 'Сховати точку'),
          r.target_type === 'user' && r.target_state === 'active' && h('button', { type: 'button', class: 'btn btn-danger-ghost btn-sm', onclick: blockUser }, 'Заблокувати'),
          h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: resolve('resolved') }, 'Вирішено'),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: resolve('rejected') }, 'Відхилити')));
    }

    // ---- Точки ----
    async function spots() {
      const rows = await api.listSpots();
      const list = h('ul', { class: 'admin-list' });
      const chips = h('div', { class: 'chips' });
      const draw = () => {
        chips.replaceChildren(...SPOT_FILTERS.map(([id, label]) => h('button', { type: 'button', class: `chip${state.spotFilter === id ? ' active' : ''}`,
          'aria-pressed': String(state.spotFilter === id), onclick: () => { state.spotFilter = id; draw(); } },
        `${label} · ${filterSpots(rows, id).length}`)));
        const shown = filterSpots(rows, state.spotFilter, state.spotQuery);
        list.replaceChildren(...(shown.length ? shown.map(spotCard) : [h('li', { class: 'card panel muted' }, 'Точок за цим фільтром немає.')]));
      };
      const search = h('input', { class: 'input admin-search', type: 'search', placeholder: 'Назва, район, господар чи email', 'aria-label': 'Пошук точок',
        value: state.spotQuery, oninput: (e) => { state.spotQuery = e.target.value; draw(); } });
      draw();
      return h('div', {}, h('div', { class: 'admin-toolbar' }, chips, search), list);
    }

    function spotCard(s) {
      const [stateLabel, stateCls] = spotState(s);
      const live = !s.archived_at;
      const toggleHidden = async (e) => {
        const button = e.currentTarget;
        if (s.hidden_at) {
          act(button, () => api.setSpotHidden(s.id, false, ''), `«${s.title}» знову на карті`);
          return;
        }
        const note = await ask({ title: `Сховати «${s.title}»`, required: true, danger: true, label: 'Причина', confirm: 'Сховати',
          text: 'Гості перестануть бачити точку, майбутні бронювання буде скасовано. Причину побачить господар у кабінеті.' });
        if (note !== null) act(button, () => api.setSpotHidden(s.id, true, note), `«${s.title}» приховано`);
      };
      return h('li', { class: 'card admin-card', dataset: { id: s.id } },
        h('div', { class: 'admin-card-head' },
          badge([stateLabel, stateCls]),
          s.verified_at && badge(['✓ Перевірена', 'badge-ok']),
          s.hidden_at && s.review_requested_at && badge(['Господар просить перевірити знову', 'badge-info']),
          Number(s.open_reports) > 0 && badge([`${s.open_reports} ${plural(Number(s.open_reports), ['скарга', 'скарги', 'скарг'])}`, 'badge-warn'])),
        h('h3', { class: 'admin-card-title' }, stateLabel === 'На карті' ? h('a', { href: `#/spot/${s.id}` }, s.title) : s.title,
          h('span', { class: 'muted' }, ` · ${s.district}`)),
        h('p', { class: 'admin-meta' },
          `Господар: ${s.owner_name || 'Без імені'}`, s.owner_email && h('span', { class: 'muted' }, ` · ${s.owner_email}`),
          s.owner_verified && h('span', { class: 'admin-ok' }, ' · ✓ перевірений')),
        s.hidden_at && h('p', { class: 'admin-resolution' }, `Приховано ${dateTime(s.hidden_at)}: ${s.hidden_reason || 'без причини'}`,
          s.review_requested_at && ` · господар виправив дані й попросив перевірити ${dateTime(s.review_requested_at)}`),
        h('p', { class: 'muted admin-meta' },
          `Завершених бронювань: ${s.completed_bookings} · активних: ${s.active_bookings} · `,
          h('a', { href: mapsLink(s.lat, s.lng), target: '_blank', rel: 'noopener' }, 'точне місце на мапі ↗')),
        live && h('div', { class: 'admin-actions' },
          h('button', { type: 'button', class: 'btn btn-secondary btn-sm',
            onclick: (e) => act(e.currentTarget, () => api.setSpotVerified(s.id, !s.verified_at), s.verified_at ? 'Перевірку знято' : 'Точку позначено перевіреною') },
          s.verified_at ? 'Зняти «Перевірена»' : 'Позначити перевіреною'),
          h('button', { type: 'button', class: `btn btn-sm ${s.hidden_at ? 'btn-secondary' : 'btn-danger-ghost'}`, onclick: toggleHidden },
            s.hidden_at ? 'Повернути на карту' : 'Сховати')));
    }

    // ---- Користувачі ----
    async function users() {
      const rows = await api.listUsers(state.userQuery);
      const input = h('input', { class: 'input admin-search', type: 'search', name: 'q', placeholder: 'Ім\'я, нік або email', 'aria-label': 'Пошук користувачів', value: state.userQuery });
      const form = h('form', { class: 'admin-search-form', onsubmit: (e) => { e.preventDefault(); state.userQuery = input.value.trim(); load(); } },
        input, h('button', { type: 'submit', class: 'btn btn-secondary btn-sm' }, 'Знайти'));
      return h('div', {},
        h('div', { class: 'admin-toolbar' }, form, h('span', { class: 'muted' }, rows.length >= 200 ? 'Показано перші 200' : `${rows.length} ${plural(rows.length, ['акаунт', 'акаунти', 'акаунтів'])}`)),
        rows.length ? h('ul', { class: 'admin-list' }, rows.map(userCard)) : h('p', { class: 'card panel muted' }, 'Нікого не знайдено.'));
    }

    function userCard(u) {
      const self = u.id === me.uid;
      const active = u.status === 'active';
      const toggleBlock = async (e) => {
        const button = e.currentTarget;
        if (!active) {
          const note = await ask({ title: 'Розблокувати акаунт', text: 'Людина знову зможе увійти. Скасовані бронювання не відновляться, точки повернуться на карту.', confirm: 'Розблокувати' });
          if (note !== null) act(button, () => api.setUserStatus(u.id, 'active', note), 'Акаунт розблоковано');
          return;
        }
        const note = await ask({ title: `Заблокувати ${fullName(u.first_name, u.last_name)}`, required: true, danger: true, label: 'Причина', confirm: 'Заблокувати',
          text: 'Людина не зможе увійти, її майбутні бронювання буде скасовано, а точки зникнуть з карти.' });
        if (note !== null) act(button, () => api.setUserStatus(u.id, 'suspended', note), 'Акаунт заблоковано');
      };
      return h('li', { class: 'card admin-card', dataset: { id: u.id } },
        h('div', { class: 'admin-card-head' },
          badge(USER_STATUS[u.status] ?? [u.status, 'badge-muted']),
          u.is_admin && badge(['Адміністратор', 'badge-info']),
          u.verified_at && badge(['✓ Перевірений господар', 'badge-ok']),
          Number(u.open_reports) > 0 && badge([`${u.open_reports} ${plural(Number(u.open_reports), ['скарга', 'скарги', 'скарг'])}`, 'badge-warn']),
          self && h('span', { class: 'muted' }, 'це ви')),
        h('h3', { class: 'admin-card-title' }, fullName(u.first_name, u.last_name),
          u.nickname && h('span', { class: 'muted' }, ` · нік «${u.nickname}»`)),
        h('p', { class: 'admin-meta' }, u.email, u.phone && ` · ${u.phone}`,
          u.role && h('span', { class: 'muted' }, ` · ${u.role === 'host' ? 'господар' : 'гість'}`)),
        h('p', { class: 'muted admin-meta' },
          `З нами з ${dateTime(u.registered_at)} · останній вхід ${dateTime(u.last_sign_in_at)} · `,
          `точок ${u.spots} · бронювань як гість ${u.guest_bookings}`),
        h('div', { class: 'admin-actions' },
          h('button', { type: 'button', class: 'btn btn-secondary btn-sm',
            onclick: (e) => act(e.currentTarget, () => api.setHostVerified(u.id, !u.verified_at), u.verified_at ? 'Перевірку господаря знято' : 'Господаря позначено перевіреним') },
          u.verified_at ? 'Зняти «Перевірений»' : 'Позначити перевіреним господарем'),
          !self && !(u.is_admin && active) && h('button', { type: 'button', class: `btn btn-sm ${active ? 'btn-danger-ghost' : 'btn-secondary'}`, onclick: toggleBlock },
            active ? 'Заблокувати' : 'Розблокувати')));
    }

    // ---- Бронювання ----
    async function bookings() {
      const rows = await api.listBookings(!state.bookingsAll);
      const head = h('div', { class: 'admin-toolbar' },
        h('div', { class: 'chips' }, [[false, 'Проблемні'], [true, 'Усі за 60 днів']].map(([all, label]) =>
          h('button', { type: 'button', class: `chip${state.bookingsAll === all ? ' active' : ''}`, 'aria-pressed': String(state.bookingsAll === all),
            onclick: () => { state.bookingsAll = all; load(); } }, label))),
        h('span', { class: 'muted' }, `${rows.length} ${plural(rows.length, ['бронювання', 'бронювання', 'бронювань'])}`));
      const note = h('p', { class: 'muted admin-note' }, 'Онлайн-оплати поки немає, тож проблемні «транзакції» — це бронювання без відповіді господаря, незавершені після зарядки або зі скаргою.');
      if (!rows.length) return h('div', {}, head, note, h('p', { class: 'card panel muted' }, state.bookingsAll ? 'Бронювань за 60 днів немає.' : 'Проблемних бронювань немає.'));
      return h('div', {}, head, note, h('ul', { class: 'admin-list' }, rows.map(bookingCard)));
    }

    function bookingCard(b) {
      const cancellable = b.status === 'pending' || b.status === 'confirmed';
      const cancel = async (e) => {
        const button = e.currentTarget;
        const note = await ask({ title: 'Скасувати бронювання', danger: true, confirm: 'Скасувати бронювання',
          text: 'Гість і господар отримають сповіщення «Бронювання скасовано».' });
        if (note !== null) act(button, () => api.cancelBooking(b.id, note), 'Бронювання скасовано');
      };
      return h('li', { class: 'card admin-card', dataset: { id: b.id } },
        h('div', { class: 'admin-card-head' },
          badge(BOOKING_STATUS[b.status] ?? [b.status, 'badge-muted']),
          b.problem && badge([BOOKING_PROBLEM[b.problem] ?? b.problem, 'badge-warn']),
          h('span', { class: 'muted admin-time' }, `створено ${dateTime(b.created_at)}`)),
        h('h3', { class: 'admin-card-title' }, b.spot_title, h('span', { class: 'muted' }, ` · ${slotLabel(b.starts_at, b.ends_at)}`)),
        h('p', { class: 'admin-meta' },
          `Гість: ${b.guest_name || 'Без імені'}`, b.guest_email && h('span', { class: 'muted' }, ` (${b.guest_email})`),
          ` → господар: ${b.host_name || 'Без імені'}`, b.host_email && h('span', { class: 'muted' }, ` (${b.host_email})`)),
        h('p', { class: 'muted admin-meta' }, `Бронювання ${short(b.id)} · повідомлень у чаті: ${b.messages}`,
          b.status_changed_at && ` · статус змінено ${dateTime(b.status_changed_at)}`),
        cancellable && h('div', { class: 'admin-actions' },
          h('button', { type: 'button', class: 'btn btn-danger-ghost btn-sm', onclick: cancel }, 'Скасувати бронювання')));
    }

    // ---- Журнал ----
    async function log() {
      const rows = await api.listActions();
      if (!rows.length) return h('p', { class: 'card panel muted' }, 'Дій адміністраторів ще не було.');
      return h('ul', { class: 'admin-list admin-log' }, rows.map((a) => h('li', { class: 'card admin-card' },
        h('div', { class: 'admin-card-head' },
          h('b', {}, ACTION_LABEL[a.action] ?? a.action),
          h('span', { class: 'muted admin-time' }, dateTime(a.created_at))),
        h('p', { class: 'muted admin-meta' }, `${a.admin_name || 'Адміністратор'} · ${TARGET_LABEL[a.target_type] ?? a.target_type} ${short(a.target_id)}`),
        a.note && h('p', {}, a.note))));
    }

    const TABS = { overview, reports, spots, users, bookings, log };
    const title = ADMIN_TABS.find(([id]) => id === tab)[1];
    root.replaceChildren(h('div', { class: 'container admin-page' },
      h('div', { class: 'page-head' },
        h('div', {},
          h('p', { class: 'eyebrow' }, 'Адмінпанель'),
          h('h1', {}, title),
          h('p', { class: 'muted' }, 'Кожну дію перевіряє сервер і записує в журнал.')),
        h('button', { type: 'button', class: 'btn btn-secondary', onclick: (e) => act(e.currentTarget, async () => {}, 'Оновлено') }, 'Оновити')),
      tabs, flash, body));
    load();
    refreshCounts();
  }

  update();
  const off = session.subscribe(update);
  return () => { alive = false; off(); openNote?.close(); };
}
