// Shared Telegram Bot API helpers. Server-only.
import { createHash } from "node:crypto";

const API_ROOT = "https://api.telegram.org/bot";

let cachedToken: string | null = null;

/** Bot token: Lovable secret first, then the value stored in app_settings. */
export async function resolveBotToken(): Promise<string | null> {
  const fromEnv = process.env["TELEGRAM_BOT_TOKEN"];
  if (fromEnv) return fromEnv;
  if (cachedToken) return cachedToken;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "telegram_bot_token")
    .maybeSingle();

  cachedToken = data?.value?.trim() || null;
  return cachedToken;
}

export async function getBotToken(): Promise<string> {
  const token = await resolveBotToken();
  if (!token) {
    throw new Error(
      "Токен бота не настроен: добавьте секрет TELEGRAM_BOT_TOKEN или запись telegram_bot_token в app_settings.",
    );
  }
  return token;
}

export async function hasBotToken(): Promise<boolean> {
  return (await resolveBotToken()) !== null;
}

/** Secret token sent by Telegram in X-Telegram-Bot-Api-Secret-Token, derived from the bot token. */
export async function getWebhookSecret(): Promise<string> {
  return createHash("sha256")
    .update(`mxp-tasks:${await getBotToken()}`, "utf8")
    .digest("hex")
    .slice(0, 48);
}

export type TgResult<T = unknown> = { ok: boolean; result?: T; description?: string };

async function callApi<T = unknown>(
  method: string,
  payload: Record<string, unknown>,
): Promise<TgResult<T>> {
  const res = await fetch(`${API_ROOT}${await getBotToken()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res
    .json()
    .catch(() => ({ ok: false, description: "Bad response" }))) as TgResult<T>;
  if (!json.ok) {
    console.error(`[telegram] ${method} failed:`, json.description);
  }
  return json;
}

export type InlineButton = { text: string; callback_data: string };

export function sendMessage(chatId: number | string, text: string, keyboard?: InlineButton[][]) {
  return callApi<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

export function editMessageText(
  chatId: number | string,
  messageId: number,
  text: string,
  keyboard?: InlineButton[][],
) {
  return callApi("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: keyboard ?? [] },
  });
}

export function answerCallbackQuery(id: string, text: string, showAlert = false) {
  return callApi("answerCallbackQuery", { callback_query_id: id, text, show_alert: showAlert });
}

export function getMe() {
  return callApi<{ id: number; username: string; first_name: string }>("getMe", {});
}

export function setWebhook(url: string, secretToken: string) {
  return callApi("setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  });
}

export function getWebhookInfo() {
  return callApi<{ url: string; pending_update_count: number; last_error_message?: string }>(
    "getWebhookInfo",
    {},
  );
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- message composition ----------

export function escapeHtml(value: string | null | undefined): string {
  return (value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const almatyFmt = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Asia/Almaty",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function almaty(iso: string | null | undefined): string {
  if (!iso) return "-";
  return almatyFmt.format(new Date(iso)).replace(",", "");
}

export const STATUS_LINE: Record<string, string> = {
  sent: "📨 Статус: отправлено",
  accepted: "✅ Статус: принято",
  submitted: "🕓 Статус: на проверке",
  done: "🏁 Статус: принято тимлидом",
  help_needed: "🆘 Статус: нужна помощь",
  overdue: "⛔️ Статус: просрочено",
  not_delivered: "⚠️ Статус: не доставлено",
};

export type Step = { id: string; idx: number; title: string; done_at: string | null };

const MONTHS_GEN = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

/** Сколько дней до ближайшего дня рождения, по календарю Астаны. */
export function daysUntilBirthday(birthday: string | null | undefined): number | null {
  if (!birthday) return null;
  const [, month, day] = birthday.split("-").map(Number);
  if (!month || !day) return null;

  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(new Date());
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const today = Date.UTC(ty ?? 1970, (tm ?? 1) - 1, td ?? 1);

  let next = Date.UTC(ty ?? 1970, month - 1, day);
  if (next < today) next = Date.UTC((ty ?? 1970) + 1, month - 1, day);
  return Math.round((next - today) / 86_400_000);
}

/** «23 июня» из даты рождения. */
export function birthdayLabel(birthday: string | null | undefined): string {
  if (!birthday) return "-";
  const [, month, day] = birthday.split("-").map(Number);
  if (!month || !day) return "-";
  return `${day} ${MONTHS_GEN[month - 1] ?? ""}`.trim();
}

/** Строка вида «Этапы: 2 из 6» плюс сам список с галочками. */
export function stepLines(steps: Step[]): string[] {
  if (steps.length === 0) return [];
  const done = steps.filter((s) => s.done_at).length;
  return [
    "",
    `📋 <b>Этапы: ${done} из ${steps.length}</b>`,
    ...[...steps]
      .sort((a, b) => a.idx - b.idx)
      .map((s) => `${s.done_at ? "☑️" : "▫️"} ${escapeHtml(s.title)}`),
  ];
}

export function taskMessage(opts: {
  title: string;
  description?: string | null | undefined;
  teamName?: string | null | undefined;
  deadline: string;
  prefix?: string | undefined;
  steps?: Step[] | undefined;
}): string {
  const lines = [
    `${opts.prefix ?? "📌 <b>Новая джейдишка</b>"}`,
    "",
    `<b>${escapeHtml(opts.title)}</b>`,
  ];
  if (opts.description) lines.push(escapeHtml(opts.description));
  lines.push("", `👥 ${escapeHtml(opts.teamName ?? "MXP")}`);
  lines.push(`⏰ Дедлайн: ${almaty(opts.deadline)} (Астана)`);
  lines.push(...stepLines(opts.steps ?? []));
  return lines.join("\n");
}

/** Кнопки для того, кто выдал джейдишку: принять работу или вернуть на доработку. */
export function reviewKeyboard(assignmentId: string): InlineButton[][] {
  return [
    [
      { text: "👍 Принять", callback_data: `ok:${assignmentId}` },
      { text: "↩️ Вернуть", callback_data: `ret:${assignmentId}` },
    ],
  ];
}

export function keyboardFor(
  status: string,
  assignmentId: string,
  steps: Step[] = [],
): InlineButton[][] {
  if (status === "done" || status === "submitted") return [];

  const rows: InlineButton[][] =
    status === "accepted" || status === "help_needed"
      ? [
          [
            { text: "🏁 Сделал", callback_data: `done:${assignmentId}` },
            { text: "🆘 Нужна помощь", callback_data: `help:${assignmentId}` },
          ],
        ]
      : [
          [
            { text: "✅ Принял", callback_data: `acc:${assignmentId}` },
            { text: "🏁 Сделал", callback_data: `done:${assignmentId}` },
          ],
          [{ text: "🆘 Нужна помощь", callback_data: `help:${assignmentId}` }],
        ];

  if (steps.length > 0) {
    const done = steps.filter((s) => s.done_at).length;
    rows.push([
      {
        text: `📋 Отметить этап (${done}/${steps.length})`,
        callback_data: `steps:${assignmentId}`,
      },
    ]);
  }
  return rows;
}

/** Экран выбора этапа: по кнопке на шаг плюс возврат к задаче. */
export function stepsKeyboard(assignmentId: string, steps: Step[]): InlineButton[][] {
  const rows: InlineButton[][] = [...steps]
    .sort((a, b) => a.idx - b.idx)
    .map((s) => [
      {
        text: `${s.done_at ? "☑️" : "▫️"} ${s.title.slice(0, 40)}`,
        callback_data: `st:${s.id}`,
      },
    ]);
  rows.push([{ text: "⬅️ Назад к задаче", callback_data: `bk:${assignmentId}` }]);
  return rows;
}
