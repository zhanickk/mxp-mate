-- Доступ по командам:
--   vp            — видит и делает всё (Жанадил, Аделия)
--   team_leader   — работает только со своей командой: назначает джейдишки своим мемберам,
--                   видит их задачи и задачи, которые дали ей самой
--   manager/member — в сайт не заходят, только бот

CREATE OR REPLACE FUNCTION public.my_member_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT member_id FROM public.profiles WHERE id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.my_member_id() TO authenticated;

-- ---------- members ----------
DROP POLICY IF EXISTS "staff read members" ON public.members;
DROP POLICY IF EXISTS "manager manage members" ON public.members;
DROP POLICY IF EXISTS "tl manage own team members" ON public.members;

CREATE POLICY "vp read members" ON public.members FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'vp'));
CREATE POLICY "tl read own team members" ON public.members FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'team_leader')
    AND (id = public.my_member_id() OR (team_id IS NOT NULL AND team_id = public.my_team_id()))
  );
CREATE POLICY "tl manage own team members" ON public.members FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'team_leader')
    AND team_id IS NOT NULL AND team_id = public.my_team_id()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'team_leader')
    AND team_id IS NOT NULL AND team_id = public.my_team_id()
  );

-- ---------- teams ----------
DROP POLICY IF EXISTS "staff read teams" ON public.teams;
CREATE POLICY "staff read teams" ON public.teams FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'vp')
    OR (public.has_role(auth.uid(), 'team_leader') AND id = public.my_team_id())
  );

-- ---------- tasks ----------
DROP POLICY IF EXISTS "staff read tasks" ON public.tasks;
DROP POLICY IF EXISTS "manager manage tasks" ON public.tasks;
DROP POLICY IF EXISTS "tl manage tasks" ON public.tasks;

CREATE POLICY "tl read tasks" ON public.tasks FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'team_leader')
    AND (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.task_assignments ta
        LEFT JOIN public.members m ON m.id = ta.member_id
        WHERE ta.task_id = tasks.id
          AND (ta.member_id = public.my_member_id() OR m.team_id = public.my_team_id())
      )
    )
  );
CREATE POLICY "tl create tasks" ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'team_leader') AND created_by = auth.uid());
CREATE POLICY "tl update own tasks" ON public.tasks FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'team_leader') AND created_by = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'team_leader') AND created_by = auth.uid());
CREATE POLICY "tl delete own tasks" ON public.tasks FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'team_leader') AND created_by = auth.uid());

-- ---------- task_assignments ----------
DROP POLICY IF EXISTS "staff read assignments" ON public.task_assignments;
DROP POLICY IF EXISTS "staff write assignments" ON public.task_assignments;

CREATE POLICY "vp manage assignments" ON public.task_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'vp'))
  WITH CHECK (public.has_role(auth.uid(), 'vp'));

CREATE POLICY "tl read assignments" ON public.task_assignments FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'team_leader')
    AND (
      member_id = public.my_member_id()
      OR EXISTS (
        SELECT 1 FROM public.members m
        WHERE m.id = task_assignments.member_id AND m.team_id = public.my_team_id()
      )
    )
  );

CREATE POLICY "tl create assignments" ON public.task_assignments FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'team_leader')
    AND EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = task_assignments.member_id
        AND m.team_id IS NOT NULL
        AND m.team_id = public.my_team_id()
    )
  );

CREATE POLICY "tl update own team assignments" ON public.task_assignments FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'team_leader')
    AND EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = task_assignments.member_id AND m.team_id = public.my_team_id()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'team_leader')
    AND EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = task_assignments.member_id AND m.team_id = public.my_team_id()
    )
  );

CREATE POLICY "tl delete own team assignments" ON public.task_assignments FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'team_leader')
    AND EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = task_assignments.member_id AND m.team_id = public.my_team_id()
    )
  );

-- ---------- activity_log ----------
DROP POLICY IF EXISTS "staff read activity" ON public.activity_log;
CREATE POLICY "staff read activity" ON public.activity_log FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'vp')
    OR EXISTS (
      SELECT 1
      FROM public.task_assignments ta
      LEFT JOIN public.members m ON m.id = ta.member_id
      WHERE ta.id = activity_log.assignment_id
        AND (ta.member_id = public.my_member_id() OR m.team_id = public.my_team_id())
    )
  );

-- ---------- templates ----------
DROP POLICY IF EXISTS "staff write templates" ON public.task_templates;
CREATE POLICY "vp write templates" ON public.task_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'vp'))
  WITH CHECK (public.has_role(auth.uid(), 'vp'));
CREATE POLICY "tl write own team templates" ON public.task_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'team_leader') AND team_id = public.my_team_id())
  WITH CHECK (public.has_role(auth.uid(), 'team_leader') AND team_id = public.my_team_id());
