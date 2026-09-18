-- Bot token can live in app_settings when no TELEGRAM_BOT_TOKEN secret is set.
-- Neither the token nor the cron secret may ever be read from the browser.
DROP POLICY IF EXISTS "staff read settings" ON public.app_settings;
CREATE POLICY "staff read settings" ON public.app_settings FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) AND key NOT IN ('cron_secret', 'telegram_bot_token'));

DROP POLICY IF EXISTS "vp write settings" ON public.app_settings;
CREATE POLICY "vp write settings" ON public.app_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'vp') AND key NOT IN ('cron_secret', 'telegram_bot_token'))
  WITH CHECK (public.has_role(auth.uid(), 'vp') AND key NOT IN ('cron_secret', 'telegram_bot_token'));
