-- ========== ENUMS ==========
CREATE TYPE public.app_role AS ENUM ('vp', 'team_leader', 'manager');
CREATE TYPE public.member_position AS ENUM ('vp', 'team_leader', 'manager', 'member');
CREATE TYPE public.assignment_status AS ENUM ('sent', 'accepted', 'done', 'help_needed', 'overdue', 'not_delivered');

-- ========== TEAMS ==========
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  color text NOT NULL DEFAULT '#037EF3',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- ========== MEMBERS ==========
CREATE OR REPLACE FUNCTION public.gen_invite_code()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT upper(substr(replace(encode(gen_random_bytes(8), 'hex'), '-', ''), 1, 8));
$$;

CREATE TABLE public.members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  position public.member_position NOT NULL DEFAULT 'member',
  telegram_username text,
  telegram_chat_id bigint UNIQUE,
  invite_code text NOT NULL UNIQUE DEFAULT public.gen_invite_code(),
  birthday date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.members TO authenticated;
GRANT ALL ON public.members TO service_role;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

-- ========== PROFILES ==========
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text NOT NULL DEFAULT '',
  email text,
  role public.app_role NOT NULL DEFAULT 'manager',
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ========== USER ROLES ==========
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.my_team_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team_id FROM public.profiles WHERE id = auth.uid();
$$;

-- ========== TASKS ==========
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category text,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  deadline timestamptz NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_recurring boolean NOT NULL DEFAULT false,
  recurrence text CHECK (recurrence IN ('weekly')),
  parent_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- ========== TASK ASSIGNMENTS ==========
CREATE TABLE public.task_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  status public.assignment_status NOT NULL DEFAULT 'sent',
  telegram_message_id bigint,
  sent_at timestamptz,
  accepted_at timestamptz,
  done_at timestamptz,
  reminder_sent boolean NOT NULL DEFAULT false,
  awaiting_comment boolean NOT NULL DEFAULT false,
  comment text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, member_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_assignments TO authenticated;
GRANT ALL ON public.task_assignments TO service_role;
ALTER TABLE public.task_assignments ENABLE ROW LEVEL SECURITY;

-- ========== TASK TEMPLATES ==========
CREATE TABLE public.task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category text,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  default_deadline_days integer NOT NULL DEFAULT 7,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_templates TO authenticated;
GRANT ALL ON public.task_templates TO service_role;
ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;

-- ========== ACTIVITY LOG ==========
CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid REFERENCES public.task_assignments(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- ========== APP SETTINGS ==========
CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- ========== POLICIES ==========
-- teams
CREATE POLICY "staff read teams" ON public.teams FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "vp manage teams" ON public.teams FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'vp')) WITH CHECK (public.has_role(auth.uid(), 'vp'));

-- members
CREATE POLICY "staff read members" ON public.members FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "vp manage members" ON public.members FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'vp')) WITH CHECK (public.has_role(auth.uid(), 'vp'));
CREATE POLICY "manager manage members" ON public.members FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'manager')) WITH CHECK (public.has_role(auth.uid(), 'manager'));
CREATE POLICY "tl manage own team members" ON public.members FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'team_leader') AND team_id IS NOT DISTINCT FROM public.my_team_id())
  WITH CHECK (public.has_role(auth.uid(), 'team_leader') AND team_id IS NOT DISTINCT FROM public.my_team_id());

-- profiles
CREATE POLICY "staff read profiles" ON public.profiles FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) OR id = auth.uid());
CREATE POLICY "self update profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "vp manage profiles" ON public.profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'vp')) WITH CHECK (public.has_role(auth.uid(), 'vp'));

-- user_roles
CREATE POLICY "read roles" ON public.user_roles FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) OR user_id = auth.uid());

-- tasks
CREATE POLICY "staff read tasks" ON public.tasks FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "vp manage tasks" ON public.tasks FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'vp')) WITH CHECK (public.has_role(auth.uid(), 'vp'));
CREATE POLICY "manager manage tasks" ON public.tasks FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'manager')) WITH CHECK (public.has_role(auth.uid(), 'manager'));
CREATE POLICY "tl manage tasks" ON public.tasks FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'team_leader')) WITH CHECK (public.has_role(auth.uid(), 'team_leader'));

-- task_assignments
CREATE POLICY "staff read assignments" ON public.task_assignments FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff write assignments" ON public.task_assignments FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- templates
CREATE POLICY "staff read templates" ON public.task_templates FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff write templates" ON public.task_templates FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- activity log
CREATE POLICY "staff read activity" ON public.activity_log FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff insert activity" ON public.activity_log FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

-- app settings
CREATE POLICY "staff read settings" ON public.app_settings FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "vp write settings" ON public.app_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'vp')) WITH CHECK (public.has_role(auth.uid(), 'vp'));

-- ========== PROFILE BOOTSTRAP (first user becomes VP) ==========
CREATE OR REPLACE FUNCTION public.ensure_profile(_full_name text DEFAULT NULL, _email text DEFAULT NULL)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _role public.app_role;
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

  IF NOT EXISTS (SELECT 1 FROM public.profiles) THEN
    _role := 'vp';
  ELSE
    _role := 'manager';
  END IF;

  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (_uid, COALESCE(NULLIF(_full_name, ''), split_part(COALESCE(_email, ''), '@', 1)), _email, _role)
  RETURNING * INTO _profile;

  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN _profile;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_profile(text, text) TO authenticated;

-- VP can change a staff member's role (keeps user_roles in sync)
CREATE OR REPLACE FUNCTION public.set_staff_role(_user_id uuid, _role public.app_role, _team_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'vp') THEN
    RAISE EXCEPTION 'Only VP can change roles';
  END IF;
  UPDATE public.profiles SET role = _role, team_id = _team_id WHERE id = _user_id;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role);
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_staff_role(uuid, public.app_role, uuid) TO authenticated;

-- ========== TRIGGERS ==========
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER task_assignments_touch BEFORE UPDATE ON public.task_assignments
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ========== REALTIME ==========
ALTER TABLE public.task_assignments REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_assignments;

-- ========== SEED ==========
INSERT INTO public.teams (name, description, color) VALUES
  ('Team Performance', 'Еженедельные LCM: адженда, презентация, бронь кабинета', '#037EF3'),
  ('Team Engagement', 'Instagram, поздравления, бот, активности для мемберов', '#F85A40');

INSERT INTO public.task_templates (title, description, category, team_id, default_deadline_days)
SELECT v.title, v.description, v.category, t.id, v.days
FROM (VALUES
  ('Дизайн адженды LCM', 'Подготовить и оформить адженду ближайшего LCM.', 'LCM', 'Team Performance', 5),
  ('Презентация для LCM', 'Собрать и оформить презентацию для LCM.', 'LCM', 'Team Performance', 5),
  ('Забронировать кабинет на LCM', 'Забронировать аудиторию и подтвердить бронь.', 'LCM', 'Team Performance', 4),
  ('Пост в Instagram LC Astana', 'Подготовить визуал и текст поста для аккаунта LC Astana.', 'Instagram', 'Team Engagement', 3),
  ('Видео-поздравление с ДР', 'Смонтировать видео-поздравление для именинника.', 'Birthday', 'Team Engagement', 3),
  ('Собрать видеопоздравления у мемберов', 'Собрать короткие видео у мемберов LC.', 'Birthday', 'Team Engagement', 3),
  ('Собрать песни-ассоциации у близких именинника', 'Опросить близких и собрать песни-ассоциации.', 'Birthday', 'Team Engagement', 3),
  ('Bingo в чате LC', 'Запустить Bingo-активность в чате LC.', 'Engagement', 'Team Engagement', 7),
  ('Фотохант', 'Организовать фотохант для мемберов.', 'Engagement', 'Team Engagement', 7),
  ('Турнир Clash Royale', 'Организовать турнир Clash Royale.', 'Engagement', 'Team Engagement', 7),
  ('Задачи по боту', 'Работа над внутренним ботом MXP.', 'Bot', 'Team Engagement', 7),
  ('Креатив для engagement', 'Придумать и описать новую активность.', 'Engagement', 'Team Engagement', 7)
) AS v(title, description, category, team_name, days)
JOIN public.teams t ON t.name = v.team_name;

INSERT INTO public.app_settings (key, value) VALUES ('bot_username', '') ON CONFLICT DO NOTHING;