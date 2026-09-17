# MXP Task Hub

Build a complete, polished, production-ready internal app called "MXP Tasks" for AIESEC LC Astana, Membership Experience (MXP) department. It is a mini-CRM to assign tasks ("джейдишки", JDs) to members and track them, PLUS a Telegram bot that sends each JD to members in private messages with buttons and tracks status. Build EVERYTHING in this single pass — database, auth, UI, edge functions, cron. The whole UI must be in Russian.

## DESIGN
Modern, clean, beautiful SaaS dashboard. AIESEC brand: primary blue #037EF3, accents #F85A40 (orange/red), #00C16E (green), #FFC845 (yellow), dark text #0A2540, light background #F7F9FC. Rounded-2xl cards, soft shadows, Inter font, lucide icons, subtle hover/transition animations, sidebar navigation (collapses to bottom nav on mobile). Fully responsive, mobile-first quality. Empty states with friendly illustrations/icons and Russian copy. Status badges with colors: sent = grey "Отправлено", accepted = blue "Принято", done = green "Выполнено", help_needed = orange "Нужна помощь", overdue = red "Просрочено". Toast notifications for all actions. Loading skeletons.

## STRUCTURE OF MXP (context)
- 1 VP (вице-президент MXP) — full admin
- 2 Team Leaders, each heads a team with ~4 members
- 2 Managers
- Team Performance: runs weekly LCMs (agenda design, presentation, booking the room)
- Team Engagement: LC Astana Instagram (posts), birthday video greetings (collecting video greetings from members, collecting "song associations" from birthday person's close ones), the internal bot project, Bingo in the LC Telegram chat, Photohunt, Clash Royale tournament, other engagement creative

## AUTH & ROLES
Email/password auth for staff. Table `profiles` (id = auth user id, full_name, role: 'vp' | 'team_leader' | 'manager', team_id nullable, member_id nullable link to members). The FIRST user who signs up automatically becomes 'vp'. VP can invite/assign roles to other staff on the Settings page. Use a separate `user_roles` table + security definer function `has_role()` to avoid RLS recursion.
Regular members do NOT log in — they only interact via Telegram.

## DATABASE
- teams: id, name, description, color. Seed: "Team Performance" (blue), "Team Engagement" (orange)
- members: id, full_name, team_id, position ('vp','team_leader','manager','member'), telegram_username, telegram_chat_id (bigint, nullable), invite_code (unique, auto-generated 8-char random), birthday (date, nullable), is_active (default true), created_at
- tasks: id, title, description, category, team_id nullable, deadline timestamptz, created_by (profile id), is_recurring bool, recurrence ('weekly' | null), parent_task_id nullable, created_at
- task_assignments: id, task_id, member_id, status ('sent','accepted','done','help_needed','overdue','not_delivered'), telegram_message_id, sent_at, accepted_at, done_at, reminder_sent bool default false, comment text, updated_at
- task_templates: id, title, description, category, team_id, default_deadline_days int
  Seed templates:
  Team Performance: "Дизайн адженды LCM", "Презентация для LCM", "Забронировать кабинет на LCM"
  Team Engagement: "Пост в Instagram LC Astana", "Видео-поздравление с ДР", "Собрать видеопоздравления у мемберов", "Собрать песни-ассоциации у близких именинника", "Bingo в чате LC", "Фотохант", "Турнир Clash Royale", "Задачи по боту", "Креатив для engagement"
- activity_log: id, assignment_id, member_id, action, created_at (every status change)
- app_settings: key/value (bot_username, etc.)
Enable realtime on task_assignments so the dashboard updates live when members press buttons in Telegram.
RLS: all authenticated staff can read; vp can do everything; manager can create/edit tasks and assignments; team_leader can create/edit tasks and members only of their own team.

## PAGES
1. **Дашборд**: KPI cards (Активные, Выполнено за неделю, Просрочено, Нужна помощь), completion rate donut, per-team progress bars, bar chart of completed tasks by week (recharts), leaderboard "Топ мемберов" by completed tasks, "Требует внимания" list (help_needed + overdue), upcoming birthdays in next 14 days (with quick button "Создать задачу на поздравление" using the birthday template).
2. **Задачи**: list/table + kanban toggle (columns by aggregate status), filters by team, status, member, category, search. "Новая джейдишка" dialog: choose template or blank, title, description (textarea), category, deadline (date+time picker, Asia/Almaty), assignees multi-select with quick buttons "Вся Team Performance", "Вся Team Engagement", "Все MXP", recurring toggle (weekly). On save: create task + assignments and call send-task edge function; show toast with how many delivered and a warning listing members without connected Telegram.
3. **Карточка задачи**: details, per-assignee status table with timestamps, buttons "Отправить повторно", "Напомнить", change status manually, activity timeline.
4. **Мемберы**: table/cards with avatar initials, team, position, Telegram status (green "Подключён" / grey "Не подключён"), completion rate. Add/edit member dialog. Button "Скопировать ссылку" copies `https://t.me/{bot_username}?start={invite_code}` and also shows a QR code of it.
5. **Профиль мембера**: stats, all assignments history, completion rate, on-time rate.
6. **Команды**: two team cards with members and team stats.
7. **Шаблоны**: CRUD for task templates.
8. **Настройки** (vp only): bot username field, "Подключить webhook" button (calls setup-webhook function), bot status check (getMe), staff/roles management.

## TELEGRAM BOT (Supabase Edge Functions, secret TELEGRAM_BOT_TOKEN — ask me to add it)
1. `telegram-webhook` (public, verify_jwt = false; validate header X-Telegram-Bot-Api-Secret-Token against a secret derived from the bot token):
   - `/start {invite_code}` → link telegram_chat_id + telegram_username to member, reply: "Привет, {имя}! 👋 Ты подключён к MXP Tasks. Сюда будут приходить твои джейдишки." Invalid code → "Ссылка недействительна 😕 Напиши своему тимлиду."
   - `/start` without code and unknown user → explain to ask the team leader for a personal link.
   - `/tasks` → list the member's open assignments with deadlines and status.
   - `/help` → short command list.
   - callback_query `acc:{assignment_id}`, `done:{assignment_id}`, `help:{assignment_id}` → verify the chat_id belongs to that assignment's member, update status + timestamp, write activity_log, edit the original message to append the current status line and keep only relevant buttons (after accept: "🏁 Сделал" and "🆘 Нужна помощь"; after done: no buttons), answerCallbackQuery with a short toast.
   - On help_needed: DM the task creator's linked member (if telegram connected) "🆘 {имя} просит помощь по задаче «{title}»".
   - After "done": bot asks "Можешь отправить ссылку или комментарий к результату (или /skip)" and saves the next text message as assignment comment.
2. `send-task` (auth required): input assignment_ids; for each, send DM in HTML parse mode:
   "📌 <b>Новая джейдишка</b>\n\n<b>{title}</b>\n{description}\n\n👥 {team}\n⏰ Дедлайн: {dd.MM.yyyy HH:mm} (Астана)"
   inline keyboard: "✅ Принял", "🏁 Сделал", "🆘 Нужна помощь". Save telegram_message_id. Members without chat_id → status 'not_delivered'. Return {sent, failed:[names]}. Respect Telegram rate limits (small delay between messages).
3. `send-reminder` (auth required): resend reminder for one assignment.
4. `cron-tick` scheduled every 30 minutes via pg_cron + pg_net:
   - assignments not done, deadline within 24h, reminder_sent = false → DM "⏰ Напоминание: «{title}» — дедлайн {time}" and set reminder_sent.
   - past deadline and not done → status 'overdue', DM member, DM task creator summary.
   - weekly recurring tasks whose deadline passed → create next week's copy (deadline + 7 days) with same assignees and send it.
   - every day at 9:00 Asia/Almaty: members with birthday in 3 days → notify VP and Team Engagement leader.
5. `setup-webhook` (vp only): calls setWebhook with the telegram-webhook URL and secret token, returns result; also returns getMe info to show bot name.

Put the Telegram helper (sendMessage, editMessageText, answerCallbackQuery) in a shared module. All dates displayed in Asia/Almaty timezone with date-fns ru locale.

Make it fully working end-to-end, with no placeholders, and seed a few demo tasks only if the members table is empty? No — do NOT seed fake members; seed only teams and templates. Double-check TypeScript builds without errors.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://mxp-mate.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/fcdd006c-e1d7-4310-a812-e2c192d6ae5d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
