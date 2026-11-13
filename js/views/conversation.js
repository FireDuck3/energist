import { h, openModal } from '../ui.js';

export function openConversation(booking, session, refresh) {
  const account = session.getState().user?.uid;
  const service = session.service;
  let closed = false;
  let loading = false;
  let sending = false;
  let messageId = crypto.randomUUID();
  let submittedText = null;
  const messages = h('div', { class: 'conversation-messages', 'aria-live': 'polite' });
  const reviews = h('div');
  const status = h('p', { role: 'status' });
  const input = h('textarea', { class: 'input', maxlength: 2000, required: true, 'aria-label': 'Повідомлення', rows: 3 });
  const send = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Надіслати');
  const form = h('form', { onsubmit: async e => {
    e.preventDefault();
    const body = input.value.trim();
    if (!body || sending) return;
    if (body !== submittedText) { messageId = crypto.randomUUID(); submittedText = body; }
    sending = true;
    send.disabled = true;
    try {
      await service.sendMessage({ id: messageId, booking_id: booking.id, author_id: account, body });
      input.value = '';
      submittedText = null;
      await load();
    } catch {
      // A lost response can follow a successful insert. Check the id before offering a retry.
      try {
        const rows = await service.listMessages(booking.id);
        if (rows.some(row => row.id === messageId)) { input.value = ''; submittedText = null; await load(); }
        else status.textContent = 'Повідомлення не надіслано. Спробуйте ще раз.';
      } catch { status.textContent = 'Перевірте інтернет і повторіть надсилання.'; }
    } finally { sending = false; send.disabled = false; }
  } }, h('label', {}, 'Ваше повідомлення', input), send);
  const content = h('section', { class: 'conversation' },
    h('h2', {}, 'Чат із ', booking.counterpart_name || 'учасником бронювання'),
    messages, status, form, reviews);
  const modal = openModal(content, { onClose: () => { closed = true; clearInterval(timer); off(); } });
  const off = session.subscribe(() => {
    if (session.getState().user?.uid !== account || session.getState().status !== 'signedIn') modal.close();
  });
  async function load() {
    if (closed || loading) return;
    loading = true;
    try {
      const [rows, feedback] = await Promise.all([service.listMessages(booking.id), service.listReviews(booking.id)]);
      if (closed) return;
      messages.replaceChildren(...rows.map(row => h('article', { class: 'conversation-message' },
        h('b', {}, row.author_id === account ? 'Ви' : booking.counterpart_name || 'Співрозмовник'),
        h('p', {}, row.body), h('small', {}, new Date(row.created_at).toLocaleString('uk-UA')))));
      if (!rows.length) messages.append(h('p', { class: 'muted' }, 'Уточніть місце зустрічі, підключення та умови зарядки.'));
      status.textContent = '';
      // Preserve an unfinished review while polling for new messages.
      if (!reviews.querySelector('form')) drawReviews(feedback);
    } catch { if (!closed) status.textContent = 'Не вдалося завантажити чат. Повторна спроба за кілька секунд.'; }
    finally { loading = false; }
  }
  function drawReviews(rows) {
    reviews.replaceChildren(h('h3', {}, 'Відгуки про співпрацю'),
      ...rows.map(row => h('article', {}, h('b', {}, row.author_id === account ? 'Ваш відгук' : 'Відгук співрозмовника'),
        h('p', {}, row.rating + '/5 · ' + row.body))));
    if (booking.status !== 'completed') {
      reviews.append(h('p', { class: 'muted' }, 'Відгуки відкриються після завершення співпраці.'));
      return;
    }
    if (rows.some(row => row.author_id === account)) return;
    const rating = h('select', { class: 'input', 'aria-label': 'Оцінка' }, [5,4,3,2,1].map(n => h('option', { value: n }, n + '/5')));
    const body = h('textarea', { class: 'input', required: true, maxlength: 2000, 'aria-label': 'Текст відгуку' });
    const button = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Залишити відгук');
    const reviewForm = h('form', { onsubmit: async e => {
      e.preventDefault();
      if (!body.value.trim()) return;
      button.disabled = true;
      try {
        await service.sendReview({ booking_id: booking.id, author_id: account, rating: Number(rating.value), body: body.value.trim() });
        reviewForm.remove();
        await load();
        await refresh();
      } catch { status.textContent = 'Не вдалося зберегти відгук. Можливо, він уже надісланий. Оновіть чат.'; }
      finally { button.disabled = false; }
    } }, rating, body, button);
    reviews.append(reviewForm);
  }
  const timer = setInterval(load, 5000);
  void load();
}
