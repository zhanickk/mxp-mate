-- Позволяет человеку самому "забрать" свою позицию (VP или тимлид) по персональной
-- ссылке с кодом мембера, вместо того чтобы VP вручную выставлял роль в Настройках.
-- Ссылка вида {app_url}/claim/{member.id}?code={member.invite_code} выдаётся только
-- через страницу «Мемберы»/«Настройки» (видна только VP), поэтому случайная
-- регистрация не может присвоить себе чужую позицию без знания кода.

CREATE OR REPLACE FUNCTION public.member_claim_preview(_member_id uuid, _code text)
RETURNS TABLE (full_name text, "position" public.member_position, team_name text, already_claimed boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _member public.members;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Не авторизован';
  END IF;

  SELECT * INTO _member FROM public.members WHERE id = _member_id;
  IF NOT FOUND OR _member.invite_code IS DISTINCT FROM _code THEN
    RAISE EXCEPTION 'Неверная ссылка';
  END IF;

  IF _member.position NOT IN ('vp', 'team_leader') THEN
    RAISE EXCEPTION 'Эта позиция не даёт доступа к сайту';
  END IF;

  RETURN QUERY
  SELECT
    _member.full_name,
    _member.position,
    (SELECT t.name FROM public.teams t WHERE t.id = _member.team_id),
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.member_id = _member.id AND p.id <> auth.uid());
END;
$$;
GRANT EXECUTE ON FUNCTION public.member_claim_preview(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_position(_member_id uuid, _code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _member public.members;
  _role public.app_role;
  _taken boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Не авторизован';
  END IF;

  SELECT * INTO _member FROM public.members WHERE id = _member_id;
  IF NOT FOUND OR _member.invite_code IS DISTINCT FROM _code THEN
    RAISE EXCEPTION 'Неверная ссылка';
  END IF;

  IF _member.position NOT IN ('vp', 'team_leader') THEN
    RAISE EXCEPTION 'Эта позиция не даёт доступа к сайту';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE member_id = _member.id AND id <> _uid
  ) INTO _taken;
  IF _taken THEN
    RAISE EXCEPTION 'Эта позиция уже занята другим аккаунтом';
  END IF;

  _role := _member.position::text::public.app_role;

  UPDATE public.profiles
  SET role = _role, team_id = _member.team_id, member_id = _member.id
  WHERE id = _uid;

  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, _role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_position(uuid, text) TO authenticated;
