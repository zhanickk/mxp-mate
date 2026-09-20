-- Справочник всего LC Astana (для дней рождения) и этапы внутри джейдишки.
--
-- lc_people заполняется из HR-формы. Личные контакты (телефон, адреса, почта)
-- сознательно не переносим: для поздравлений нужны только имя, дата рождения,
-- музыкальный сервис и соцсети.

CREATE TABLE IF NOT EXISTS public.lc_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL UNIQUE,
  department text,
  position text,
  birthday date,
  telegram_username text,
  instagram text,
  music_app text,
  note text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lc_people TO authenticated;
GRANT ALL ON public.lc_people TO service_role;
ALTER TABLE public.lc_people ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read lc people" ON public.lc_people;
CREATE POLICY "staff read lc people" ON public.lc_people FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "vp manage lc people" ON public.lc_people;
CREATE POLICY "vp manage lc people" ON public.lc_people FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'vp'))
  WITH CHECK (public.has_role(auth.uid(), 'vp'));

CREATE INDEX IF NOT EXISTS lc_people_birthday_idx ON public.lc_people (birthday);

-- ---------- чеклист ----------
ALTER TABLE public.task_templates
  ADD COLUMN IF NOT EXISTS checklist text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS checklist text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS birthday_person_id uuid REFERENCES public.lc_people(id) ON DELETE SET NULL;

-- Персональный прогресс: у каждого исполнителя свой набор галочек.
CREATE TABLE IF NOT EXISTS public.assignment_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.task_assignments(id) ON DELETE CASCADE,
  idx integer NOT NULL,
  title text NOT NULL,
  done_at timestamptz,
  UNIQUE (assignment_id, idx)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignment_steps TO authenticated;
GRANT ALL ON public.assignment_steps TO service_role;
ALTER TABLE public.assignment_steps ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS assignment_steps_assignment_idx
  ON public.assignment_steps (assignment_id);

-- Видимость шагов повторяет видимость самого назначения: вложенный запрос
-- к task_assignments проходит через её собственные политики.
DROP POLICY IF EXISTS "steps follow assignment" ON public.assignment_steps;
CREATE POLICY "steps follow assignment" ON public.assignment_steps FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.task_assignments ta WHERE ta.id = assignment_steps.assignment_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.task_assignments ta WHERE ta.id = assignment_steps.assignment_id)
  );

-- При выдаче задачи шаги копируются из её чеклиста.
CREATE OR REPLACE FUNCTION public.seed_assignment_steps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.assignment_steps (assignment_id, idx, title)
  SELECT NEW.id, c.i - 1, c.title
  FROM public.tasks t
  CROSS JOIN LATERAL unnest(t.checklist) WITH ORDINALITY AS c(title, i)
  WHERE t.id = NEW.task_id
  ON CONFLICT (assignment_id, idx) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_assignments_seed_steps ON public.task_assignments;
CREATE TRIGGER task_assignments_seed_steps
AFTER INSERT ON public.task_assignments
FOR EACH ROW EXECUTE FUNCTION public.seed_assignment_steps();

-- Переключение галочки. Права те же, что на чтение назначения.
CREATE OR REPLACE FUNCTION public.toggle_step(_step_id uuid, _done boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE public.assignment_steps
  SET done_at = CASE WHEN _done THEN now() ELSE NULL END
  WHERE id = _step_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.toggle_step(uuid, boolean) TO authenticated;

-- ---------- описания и этапы шаблонов ----------
UPDATE public.task_templates SET
  title = 'Сделать видео-поздравление',
  description = 'Полный цикл поздравления с днём рождения: от подбора фотографий до готового видео и плейлиста. Двухминутная версия нужна для сторис, полная - для показа на LCM. Плейлист собирается в том сервисе, которым пользуется именинник.',
  default_deadline_days = 7,
  checklist = ARRAY[
    'Найти красивые фотографии именинника',
    'Собрать видео-поздравления у мемберов',
    'Собрать песни-ассоциации у близких',
    'Смонтировать видео',
    'Сделать версию на 2 минуты',
    'Собрать плейлист'
  ]
WHERE title IN ('Видео-поздравление с ДР', 'Сделать видео-поздравление');

UPDATE public.task_templates SET
  description = 'Собрать короткие видео-кружочки или записи у мемберов LC. Написать лично каждому, проследить, чтобы прислали вовремя, и сложить всё в одну папку.',
  checklist = ARRAY['Написать мемберам и объяснить формат', 'Собрать видео в одну папку', 'Дособрать у тех, кто не прислал']
WHERE title = 'Собрать видеопоздравления у мемберов';

UPDATE public.task_templates SET
  description = 'Спросить у близких друзей именинника, какие песни у них с ним ассоциируются. Из этого собирается плейлист, поэтому нужны названия треков, а не описания.',
  checklist = ARRAY['Определить круг близких друзей', 'Опросить каждого', 'Свести песни в один список']
WHERE title = 'Собрать песни-ассоциации у близких именинника';

UPDATE public.task_templates SET
  description = 'Пост для аккаунта LC Astana: визуал плюс текст. Перед публикацией согласовать с МКТ и проверить, что тон и оформление совпадают с гайдлайнами AIESEC.',
  checklist = ARRAY['Сделать визуал', 'Написать текст', 'Согласовать', 'Опубликовать']
WHERE title = 'Пост в Instagram LC Astana';
