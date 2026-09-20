-- Проверка выполнения и данные для статистики.
--
-- 1. Мембер жмёт «Сделал» -> статус submitted («На проверке»), а не done.
--    Принять или вернуть может только автор задачи или VP.
-- 2. У назначения запоминается команда мембера на момент выдачи, чтобы
--    статистика команд не искажалась, когда мембер переходит в другую команду.
--    Личная статистика мембера при этом остаётся сквозной за всё время.

-- Новое значение enum нужно закоммитить отдельным запросом, до того как оно
-- используется ниже. Выполнять первой строкой, отдельно от остального файла.
ALTER TYPE public.assignment_status ADD VALUE IF NOT EXISTS 'submitted';

-- ---------- колонки ----------
ALTER TABLE public.task_assignments
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS review_comment text,
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS task_assignments_team_idx ON public.task_assignments (team_id);
CREATE INDEX IF NOT EXISTS task_assignments_member_idx ON public.task_assignments (member_id);

-- Бэкфилл: у прошлых назначений команда берётся из текущей команды мембера.
UPDATE public.task_assignments ta
SET team_id = m.team_id
FROM public.members m
WHERE ta.member_id = m.id AND ta.team_id IS NULL;

-- ---------- снапшот команды при выдаче ----------
CREATE OR REPLACE FUNCTION public.set_assignment_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.team_id IS NULL THEN
    SELECT team_id INTO NEW.team_id FROM public.members WHERE id = NEW.member_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_assignments_set_team ON public.task_assignments;
CREATE TRIGGER task_assignments_set_team
BEFORE INSERT ON public.task_assignments
FOR EACH ROW EXECUTE FUNCTION public.set_assignment_team();

-- ---------- кто имеет право принимать ----------
CREATE OR REPLACE FUNCTION public.can_review_assignment(_assignment_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'vp')
      OR EXISTS (
        SELECT 1
        FROM public.task_assignments ta
        JOIN public.tasks t ON t.id = ta.task_id
        WHERE ta.id = _assignment_id AND t.created_by = _user_id
      );
$$;
GRANT EXECUTE ON FUNCTION public.can_review_assignment(uuid, uuid) TO authenticated;

-- Защита: перевести назначение в done может только автор задачи или VP.
-- Серверные вызовы (бот, cron) идут под service_role, где auth.uid() пуст, их не трогаем.
CREATE OR REPLACE FUNCTION public.guard_assignment_done()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'done'
     AND OLD.status IS DISTINCT FROM 'done'
     AND auth.uid() IS NOT NULL
     AND NOT public.can_review_assignment(NEW.id, auth.uid())
  THEN
    RAISE EXCEPTION 'Принять работу может только тот, кто выдал джейдишку, или VP';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_assignments_guard_done ON public.task_assignments;
CREATE TRIGGER task_assignments_guard_done
BEFORE UPDATE ON public.task_assignments
FOR EACH ROW EXECUTE FUNCTION public.guard_assignment_done();

-- ---------- приём и возврат ----------
CREATE OR REPLACE FUNCTION public.review_assignment(
  _assignment_id uuid,
  _approve boolean,
  _comment text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _member uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Не авторизован';
  END IF;

  IF NOT public.can_review_assignment(_assignment_id, _uid) THEN
    RAISE EXCEPTION 'Принять работу может только тот, кто выдал джейдишку, или VP';
  END IF;

  SELECT member_id INTO _member FROM public.task_assignments WHERE id = _assignment_id;
  IF _member IS NULL THEN
    RAISE EXCEPTION 'Назначение не найдено';
  END IF;

  IF _approve THEN
    UPDATE public.task_assignments
    SET status = 'done',
        done_at = COALESCE(done_at, now()),
        reviewed_at = now(),
        reviewed_by = _uid,
        review_comment = _comment
    WHERE id = _assignment_id;
  ELSE
    UPDATE public.task_assignments
    SET status = 'accepted',
        done_at = NULL,
        submitted_at = NULL,
        reviewed_at = now(),
        reviewed_by = _uid,
        review_comment = _comment
    WHERE id = _assignment_id;
  END IF;

  INSERT INTO public.activity_log (assignment_id, member_id, action)
  VALUES (
    _assignment_id,
    _member,
    CASE WHEN _approve THEN 'Работа принята' ELSE 'Возвращено на доработку' END
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.review_assignment(uuid, boolean, text) TO authenticated;
