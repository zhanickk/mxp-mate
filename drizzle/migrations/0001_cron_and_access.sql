-- ========== ACCESS: new sign-ups wait for VP approval ==========
CREATE OR REPLACE FUNCTION public.ensure_profile(_full_name text DEFAULT NULL, _email text DEFAULT NULL)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_first boolean;
  _profile public.profiles;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO _profile FROM public.profiles WHERE id = _uid;
  IF FOUND THEN
    IF _full_name IS NOT NULL AND _full_name <> '' AND (_profile.full_name IS NULL OR _profile.full_name = '') THEN
      UPDATE public.profiles SET full_name = _full_name WHERE id = _uid RETURNING * INTO _profile;
    END IF;
    RETURN _profile;
  END IF;

  _is_first := NOT EXISTS (SELECT 1 FROM public.user_roles);

  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    _uid,
    COALESCE(NULLIF(_full_name, ''), split_part(COALESCE(_email, (SELECT email FROM auth.users WHERE id = _uid), ''), '@', 1)),
    COALESCE(_email, (SELECT email FROM auth.users WHERE id = _uid)),
    CASE WHEN _is_first THEN 'vp'::public.app_role ELSE 'manager'::public.app_role END
  )
  RETURNING * INTO _profile;

  -- Only the very first account gets access automatically; others wait for VP approval.
  IF _is_first THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'vp') ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN _profile;
END;
$$;

-- Pending (not yet approved) accounts can still read their own profile.
DROP POLICY IF EXISTS "staff read profiles" ON public.profiles;
CREATE POLICY "staff read profiles" ON public.profiles FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR id = auth.uid());

-- VP can revoke access
CREATE OR REPLACE FUNCTION public.revoke_staff(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'vp') THEN
    RAISE EXCEPTION 'Only VP can revoke access';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Нельзя забрать доступ у себя';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.revoke_staff(uuid) TO authenticated;

-- ========== CATEGORIES: align seed with UI ==========
UPDATE public.task_templates SET category = 'Дни рождения' WHERE category = 'Birthday';
UPDATE public.task_templates SET category = 'Бот' WHERE category = 'Bot';

-- ========== CRON ==========
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

INSERT INTO public.app_settings (key, value)
VALUES ('cron_secret', encode(gen_random_bytes(24), 'hex'))
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.app_settings (key, value)
VALUES ('app_url', 'https://mxp-mate.lovable.app')
ON CONFLICT (key) DO NOTHING;

-- cron_secret must never be readable from the browser
DROP POLICY IF EXISTS "staff read settings" ON public.app_settings;
CREATE POLICY "staff read settings" ON public.app_settings FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) AND key <> 'cron_secret');
DROP POLICY IF EXISTS "vp write settings" ON public.app_settings;
CREATE POLICY "vp write settings" ON public.app_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'vp') AND key <> 'cron_secret')
  WITH CHECK (public.has_role(auth.uid(), 'vp') AND key <> 'cron_secret');

CREATE OR REPLACE FUNCTION public.call_cron_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url text := (SELECT value FROM public.app_settings WHERE key = 'app_url');
  _secret text := (SELECT value FROM public.app_settings WHERE key = 'cron_secret');
BEGIN
  IF _url IS NULL OR _url = '' THEN
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := rtrim(_url, '/') || '/api/public/cron-tick',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || _secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
END;
$$;
REVOKE ALL ON FUNCTION public.call_cron_tick() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('mxp-cron-tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mxp-cron-tick');
  PERFORM cron.schedule('mxp-cron-tick', '*/30 * * * *', 'SELECT public.call_cron_tick()');
END $$;
