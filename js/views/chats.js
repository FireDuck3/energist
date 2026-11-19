// Вкладка «Чати» як у Telegram: список розмов зліва, переписка справа (на телефоні — по черзі).
import { h } from '../ui.js';
import { kyivNow } from '../calendar.js';
import { formatLastMessage, unreadLabel } from '../chats.js';
import {
  groupByDay, messageTicks, chatPreview, filterChats, mergeMessages, bookingActions, systemEvents, isTypingFresh, TYPING_TTL_MS,
} from '../chat-view-model.js';
import { createComposer } from './chat-composer.js';
import { openReport } from './report.js';
import { signInPrompt } from './auth-modal.js';

const STATUS = { pending: 'Очікує підтвердження', confirmed: 'Підтверджено', declined: 'Відхилено', cancelled: 'Скасовано', completed: 'Завершено' };
const ACTIONS = {
  confirm: ['Підтвердити', 'btn-primary'],
  decline: ['Відхилити', 'btn-secondary'],
  cancel: ['Скасувати бронювання', 'btn-secondary'],
  complete: ['Завершити співпрацю', 'btn-primary'],
};
const TICKS = { sending: '🕓', sent: '✓', read: '✓✓', failed: '!' };
const MONTHS = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];
const pad = (n) => String(n).padStart(2, '0');
const POLL_MS = 20000;

const timeOf = (iso) => { const k = kyivNow(new Date(iso)); return `${pad(Math.floor(k.minutes / 60))}:${pad(k.minutes % 60)}`; };
const initial = (name) => (name || '?').trim()[0]?.toUpperCase() ?? '?';

// «["2026-11-20 10:00:00","2026-11-20 12:00:00")» → «20 лис, 10:00–12:00»
function slotLabel(slot) {
  const [a, b] = String(slot ?? '').match(/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/g) ?? [];
  if (!a) return '';
  return `${Number(a.slice(8, 10))} ${MONTHS[Number(a.slice(5, 7)) - 1]}, ${a.slice(11, 16)}${b ? `–${b.slice(11, 16)}` : ''}`;
}

export function render({ id }, root, _store, session, _history, pilot) {
  const me = () => session.getState().user?.uid ?? null;
  let alive = true;
  let query = '';
  let thread = null; // стан відкритої розмови
  const layout = h('div', { class: `chats-layout${id ? ' has-thread' : ''}` });
  root.append(h('div', { class: 'chats-page' }, layout));
  if (id) document.body.classList.add('chat-open');
  document.body.classList.add('on-chats'); // чат займає весь екран під шапкою, без футера

  // ---------- Список ----------
  const listItems = h('div', { class: 'chats-items', role: 'list' });
  const search = h('input', { class: 'input chats-search', type: 'search', placeholder: 'Пошук…', 'aria-label': 'Пошук чатів',
    oninput: (e) => { query = e.target.value; drawList(); } });
  const listPane = h('aside', { class: 'chats-list' }, h('div', { class: 'chats-list-head' }, h('h1', {}, 'Чати'), search), listItems);
  const threadPane = h('section', { class: 'chats-thread' });
  layout.append(listPane, threadPane);

  function drawList() {
    const all = pilot.chats();
    const rows = filterChats(all, query);
    const now = new Date();
    if (!all.length) {
      listItems.replaceChildren(h('div', { class: 'chats-empty' },
        h('p', {}, 'Чатів ще немає — вони з\'являються після запиту на бронювання.'),
        h('a', { class: 'btn btn-primary btn-sm', href: '#/map' }, 'Знайти зарядку')));
      return;
    }
    listItems.replaceChildren(...(rows.length ? rows.map((c) => h('a', {
      class: `chat-row${c.id === id ? ' active' : ''}${c.unread_count ? ' unread' : ''}`, href: `#/chats/${c.id}`, role: 'listitem' },
      h('span', { class: 'chat-avatar', 'aria-hidden': 'true' }, initial(c.counterpart_name)),
      h('span', { class: 'chat-row-main' },
        h('span', { class: 'chat-row-top' },
          h('b', { class: 'chat-row-name' }, c.counterpart_name || 'Учасник бронювання'),
          h('span', { class: 'chat-row-time' }, formatLastMessage(c.last_message_at, now))),
        h('span', { class: 'chat-row-bottom' },
          h('span', { class: 'chat-row-preview' }, h('span', { class: 'chat-row-spot' }, `${c.spot_title || 'Точка зарядки'} · `), chatPreview(c)),
          c.unread_count > 0 && h('span', { class: 'unread-badge' }, unreadLabel(c.unread_count))))))
      : [h('p', { class: 'chats-empty muted' }, 'Нічого не знайдено')]));
  }

  // ---------- Розмова ----------
  function drawEmptyThread(text, withBack = false) {
    threadPane.replaceChildren(h('div', { class: 'chats-placeholder' },
      h('p', { class: 'muted' }, text),
      withBack && h('a', { class: 'btn btn-secondary btn-sm', href: '#/chats' }, 'До чатів')));
  }

  function openThread(booking) {
    const service = session.service;
    const t = thread = {
      booking, messages: [], local: [], reviews: [], loaded: false, error: '',
      counterpartReadAt: booking.counterpart_last_read_at ?? null, typingAt: null,
      loading: false, reloadAfter: false, lastReadId: undefined, lastCount: 0, offs: [], timer: null, busy: false,
    };
    const status = h('p', { class: 'chat-status', role: 'status' });
    const typing = h('span', { class: 'chat-typing' });
    const feed = h('div', { class: 'chat-feed', 'aria-live': 'polite' });
    const newBtn = h('button', { type: 'button', class: 'chat-new-btn', hidden: true, onclick: () => scrollDown(true) }, '↓ Нові повідомлення');
    const actionsBar = h('div', { class: 'chat-actions' });
    const counterpartId = me() === booking.guest_id ? booking.owner_id : booking.guest_id;
    const typingChannel = service?.openTypingChannel?.(booking.id, (uid) => {
      if (uid && uid !== me()) { t.typingAt = Date.now(); drawTyping(); setTimeout(drawTyping, TYPING_TTL_MS + 50); }
    }) ?? null;
    if (typingChannel) t.offs.push(() => typingChannel.close());

    const composer = createComposer({
      onSend: (text) => send({ id: crypto.randomUUID(), body: text }),
      onTyping: () => typingChannel?.sendTyping(me()),
    });
    composer.setDisabled(['declined', 'cancelled'].includes(booking.status));

    threadPane.replaceChildren(
      h('header', { class: 'chat-head' },
        h('a', { class: 'chat-back', href: '#/chats', 'aria-label': 'До списку чатів' }, '←'),
        h('span', { class: 'chat-avatar', 'aria-hidden': 'true' }, initial(booking.counterpart_name)),
        h('div', { class: 'chat-head-main' },
          h('b', {}, booking.counterpart_name || 'Учасник бронювання'),
          h('span', { class: 'chat-head-sub muted' },
            `${booking.spot_title || 'Точка зарядки'} · ${slotLabel(booking.slot)} · ${STATUS[booking.status] ?? ''}`), typing),
        h('details', { class: 'chat-menu' },
          h('summary', { 'aria-label': 'Меню чату' }, '⋮'),
          h('div', { class: 'chat-menu-list card' },
            h('a', { href: `#/spot/${booking.spot_id}` }, 'Відкрити точку'),
            counterpartId && h('button', { type: 'button', onclick: (e) => {
              e.currentTarget.closest('details').open = false;
              openReport({ targetType: 'user', targetId: counterpartId, bookingId: booking.id, title: booking.counterpart_name || 'учасник бронювання' }, session);
            } }, 'Поскаржитися')))),
      actionsBar, feed, newBtn, status, composer.el);

    function drawActions() {
      const list = bookingActions(t.booking, me(), new Date());
      actionsBar.hidden = !list.length;
      actionsBar.replaceChildren(...list.map((a) => h('button', { type: 'button', class: `btn btn-sm ${ACTIONS[a][1]}`, disabled: t.busy,
        async onclick() { t.busy = true; drawActions(); try { await pilot.act(t.booking.id, a); } finally { t.busy = false; if (alive) drawActions(); } } },
      ACTIONS[a][0])));
    }

    function drawTyping() {
      typing.textContent = isTypingFresh(t.typingAt, Date.now()) ? 'друкує…' : '';
    }

    const atBottom = () => feed.scrollHeight - feed.scrollTop - feed.clientHeight < 60;
    function scrollDown(force) {
      feed.scrollTop = feed.scrollHeight;
      if (force) newBtn.hidden = true;
    }

    function bubble(m) {
      if (m.system) return h('div', { class: 'chat-system' }, m.text);
      const mine = m.author_id === me();
      const ticks = messageTicks(m, me(), t.counterpartReadAt);
      return h('div', { class: `chat-msg ${mine ? 'mine' : 'theirs'}${m.failed ? ' failed' : ''}` },
        h('div', { class: 'chat-bubble' },
          h('span', { class: 'chat-text' }, m.body),
          h('span', { class: 'chat-meta' }, timeOf(m.created_at), ticks && h('span', { class: `chat-ticks ticks-${ticks}` }, TICKS[ticks]))),
        m.failed && h('button', { type: 'button', class: 'chat-retry', onclick: () => send(m) }, 'Не надіслано · Повторити'));
    }

    function reviewCard() {
      if (t.booking.status !== 'completed') return null;
      const items = t.reviews.map((r) => h('div', { class: 'chat-system chat-review' },
        `${r.author_id === me() ? 'Ваш відгук' : 'Відгук співрозмовника'}: ${'★'.repeat(r.rating)} · ${r.body}`));
      if (t.reviews.some((r) => r.author_id === me())) return items;
      const rating = h('select', { class: 'input', 'aria-label': 'Оцінка' }, [5, 4, 3, 2, 1].map((n) => h('option', { value: n }, `${'★'.repeat(n)} ${n}/5`)));
      const body = h('textarea', { class: 'input', rows: 2, maxlength: 2000, required: true, 'aria-label': 'Текст відгуку', placeholder: 'Як усе пройшло?' });
      const btn = h('button', { type: 'submit', class: 'btn btn-primary btn-sm' }, 'Залишити відгук');
      return [...items, h('form', { class: 'chat-review-card card', async onsubmit(e) {
        e.preventDefault();
        if (!body.value.trim() || btn.disabled) return;
        btn.disabled = true;
        try {
          await service.sendReview({ booking_id: t.booking.id, author_id: me(), rating: Number(rating.value), body: body.value.trim() });
          await load();
          void pilot.refresh();
        } catch { status.textContent = 'Не вдалося зберегти відгук. Можливо, він уже надісланий.'; }
        finally { btn.disabled = false; }
      } },
      h('b', {}, me() === t.booking.guest_id ? 'Оцініть зарядку — відгук побачать усі на сторінці точки' : 'Оцініть гостя — відгук бачать учасники бронювання'),
      rating, body, btn)];
    }

    function drawFeed({ forceBottom = false } = {}) {
      const wasAtBottom = atBottom();
      const items = [...mergeMessages(t.messages, t.local), ...systemEvents(t.booking)];
      const groups = groupByDay(items, new Date());
      // Підтримуємо незавершений відгук під час оновлень: картку перемальовуємо лише коли форми немає.
      const keepForm = feed.querySelector('.chat-review-card');
      feed.replaceChildren(
        ...(t.loaded && !items.some((i) => !i.system) ? [h('p', { class: 'chat-system' }, 'Уточніть місце зустрічі, підключення та умови зарядки.')] : []),
        ...groups.flatMap((g) => [h('div', { class: 'chat-day' }, h('span', {}, g.label)), ...g.items.map(bubble)]),
        ...(keepForm ? [keepForm] : [reviewCard()].flat().filter(Boolean)));
      const count = items.length;
      if (forceBottom || wasAtBottom || !t.lastCount) scrollDown(true);
      else if (count > t.lastCount) newBtn.hidden = false;
      t.lastCount = count;
    }
    feed.addEventListener('scroll', () => { if (atBottom()) newBtn.hidden = true; });

    async function load() {
      if (!alive || thread !== t) return;
      if (t.loading) { t.reloadAfter = true; return; }
      t.loading = true;
      try {
        const [rows, reviews, reads] = await Promise.all([
          service.listMessages(booking.id),
          service.listReviews(booking.id).catch(() => t.reviews),
          service.listChatReads ? service.listChatReads(booking.id).catch(() => null) : null,
        ]);
        if (!alive || thread !== t) return;
        t.messages = rows;
        t.reviews = reviews;
        const theirs = reads?.find((r) => r.user_id !== me());
        if (theirs) t.counterpartReadAt = theirs.last_read_at;
        t.local = t.local.filter((m) => !rows.some((r) => r.id === m.id));
        t.loaded = true;
        status.textContent = '';
        drawFeed();
        const lastId = rows.at(-1)?.id ?? null;
        if (lastId !== t.lastReadId && service.markBookingRead) {
          t.lastReadId = lastId;
          service.markBookingRead(booking.id).then(() => pilot.refresh()).catch(() => {});
        }
      } catch {
        if (alive && thread === t) status.textContent = 'Не вдалося завантажити чат. Повторна спроба за кілька секунд.';
      } finally {
        t.loading = false;
        if (t.reloadAfter && alive && thread === t) { t.reloadAfter = false; void load(); }
      }
    }

    // Оптимістична відправка: повідомлення видно одразу; той самий id при повторі не створює дубля.
    async function send({ id: msgId, body }) {
      const existing = t.local.find((m) => m.id === msgId);
      const msg = existing ?? { id: msgId, booking_id: booking.id, author_id: me(), body, created_at: new Date().toISOString() };
      Object.assign(msg, { pending: true, failed: false });
      if (!existing) t.local.push(msg);
      status.textContent = '';
      drawFeed({ forceBottom: true });
      try {
        await service.sendMessage({ id: msg.id, booking_id: booking.id, author_id: me(), body: msg.body });
        msg.pending = false;
        await load();
      } catch (error) {
        if (error?.code === '23505') { msg.pending = false; await load(); return; } // уже збережено раніше
        msg.pending = false;
        msg.failed = true;
        if (error?.code === 'WW429') status.textContent = 'Забагато повідомлень. Зачекайте хвилину.';
        if (alive && thread === t) drawFeed();
      }
    }

    try { t.offs.push(service.subscribeToChat?.(booking.id, () => { void load(); }) ?? (() => {})); } catch { /* опитування */ }
    try {
      t.offs.push(service.subscribeToReads?.(booking.id, (row) => {
        if (row?.user_id && row.user_id !== me()) { t.counterpartReadAt = row.last_read_at; drawFeed(); }
      }) ?? (() => {}));
    } catch { /* опитування */ }
    t.timer = setInterval(() => { void load(); }, POLL_MS);
    t.refreshBooking = (b) => { t.booking = b; drawActions(); };
    drawActions();
    drawFeed();
    void load();
    composer.focus();
  }

  function closeThread() {
    if (!thread) return;
    clearInterval(thread.timer);
    thread.offs.forEach((off) => { try { off(); } catch { /* ігноруємо */ } });
    thread = null;
  }

  // ---------- Оновлення ----------
  function update() {
    if (!alive) return;
    const state = session.getState();
    if (state.status === 'loading') { listItems.replaceChildren(h('p', { class: 'muted chats-empty' }, 'Завантаження…')); return; }
    if (state.status !== 'signedIn') {
      closeThread();
      document.body.classList.remove('chat-open');
      root.replaceChildren(signInPrompt({ title: 'Чати', text: 'Увійдіть, щоб бачити чати', reason: 'Увійдіть, щоб бачити чати' }, session));
      return;
    }
    // Після входу з екрана «Увійдіть…» повертаємо розмітку чатів.
    if (!root.contains(layout)) root.replaceChildren(h('div', { class: 'chats-page' }, layout));
    if (id) document.body.classList.add('chat-open');
    drawList();
    if (!id) { drawEmptyThread('Оберіть розмову'); return; }
    const booking = pilot.chats().find((c) => c.id === id);
    if (!booking) {
      if (pilot.chatsReady()) { closeThread(); drawEmptyThread('Чат не знайдено', true); }
      else drawEmptyThread('Завантаження…');
      return;
    }
    if (thread?.booking.id === booking.id) thread.refreshBooking(booking);
    else { closeThread(); openThread(booking); }
  }

  let account = me();
  const offSession = session.subscribe(() => {
    if (me() !== account) { account = me(); closeThread(); }
    update();
  });
  const offPilot = pilot.subscribe(update);
  update();
  void pilot.refresh();

  return () => {
    alive = false;
    closeThread();
    offSession();
    offPilot();
    document.body.classList.remove('chat-open', 'on-chats');
  };
}
