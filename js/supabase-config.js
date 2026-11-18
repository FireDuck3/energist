// Публічні дані проєкту Supabase — їх можна викладати: доступ до даних обмежують правила RLS
// (supabase/schema.sql), а не секретність ключа.
export const supabaseConfig = {
  url: 'https://yxbpobiipcdazwnshime.supabase.co',
  anonKey: 'sb_publishable_JD-Im8Jx4D6SZypWwMX7JQ_EIoP7uCH',
  // Вхід кодом і скидання пароля потребують листів із кодом. Вбудована пошта Supabase їх не вміє
  // (шаблони редагуються лише з власним SMTP) — тож поки false ці кнопки не показуються.
  emailCodes: false,
  // Публічний VAPID-ключ для push (README → «Чати й push»). Порожній — кнопка push показує «не налаштовано».
  vapidPublicKey: 'BPfjESHCj7ps7p0hWE3MfvPTqyrHbxqHJlxFNGY_aHKOJcOj8b0GA2Lsyxi0LKS_yNl8Updu-ViF33zFPHBkhs0',
};
