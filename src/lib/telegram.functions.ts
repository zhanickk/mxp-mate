import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Sends the JD to every listed assignment. */
export const sendTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ assignment_ids: z.array(z.string().uuid()).min(1) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { dispatchAssignments } = await import("./dispatch.server");
    return dispatchAssignments(data.assignment_ids);
  });

/** Re-sends an existing JD message. */
export const resendTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ assignment_ids: z.array(z.string().uuid()).min(1) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { dispatchAssignments } = await import("./dispatch.server");
    return dispatchAssignments(data.assignment_ids, {
      prefix: "🔁 <b>Джейдишка (повторно)</b>",
      resend: true,
    });
  });

/** Sends a short reminder for one assignment. */
export const sendReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ assignment_id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { sendReminderFor } = await import("./dispatch.server");
    return sendReminderFor(data.assignment_id);
  });

/** Bot health check: getMe + current webhook info. */
export const getBotStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const tg = await import("./telegram.server");
    if (!(await tg.hasBotToken())) {
      return { configured: false as const };
    }
    const [me, hook] = await Promise.all([tg.getMe(), tg.getWebhookInfo()]);
    return {
      configured: true as const,
      me: me.ok ? me.result : null,
      error: me.ok ? null : (me.description ?? "Ошибка"),
      webhook: hook.ok ? hook.result : null,
    };
  });

/** VP-only: points the Telegram webhook at this app. */
export const setupWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ origin: z.string().url() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: isVp, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "vp",
    });
    if (roleError || !isVp) throw new Error("Только VP может подключать webhook");

    const tg = await import("./telegram.server");
    const url = `${data.origin.replace(/\/$/, "")}/api/public/telegram-webhook`;
    const result = await tg.setWebhook(url, await tg.getWebhookSecret());
    const me = await tg.getMe();

    if (me.ok && me.result?.username) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("app_settings")
        .upsert({
          key: "bot_username",
          value: me.result.username,
          updated_at: new Date().toISOString(),
        });
    }

    return {
      ok: result.ok,
      url,
      description: result.description ?? null,
      me: me.ok ? me.result : null,
    };
  });
