import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Team = Tables<"teams">;
export type Member = Tables<"members">;
export type Task = Tables<"tasks">;
export type Assignment = Tables<"task_assignments">;
export type Template = Tables<"task_templates">;

export type AssignmentWithRefs = Assignment & {
  members: Pick<Member, "id" | "full_name" | "team_id" | "position"> | null;
  tasks: Pick<Task, "id" | "title" | "deadline" | "team_id" | "category" | "created_by"> | null;
};

async function must<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return (data ?? []) as T;
}

export function useTeams() {
  return useQuery({
    queryKey: ["teams"],
    queryFn: () => must<Team[]>(supabase.from("teams").select("*").order("name")),
  });
}

export function useMembers() {
  return useQuery({
    queryKey: ["members"],
    queryFn: () => must<Member[]>(supabase.from("members").select("*").order("full_name")),
  });
}

export function useTemplates() {
  return useQuery({
    queryKey: ["templates"],
    queryFn: () => must<Template[]>(supabase.from("task_templates").select("*").order("title")),
  });
}

export function useTasks() {
  return useQuery({
    queryKey: ["tasks"],
    queryFn: () =>
      must<Task[]>(supabase.from("tasks").select("*").order("deadline", { ascending: false })),
  });
}

export function useAssignments() {
  return useQuery({
    queryKey: ["assignments"],
    queryFn: () =>
      must<AssignmentWithRefs[]>(
        supabase
          .from("task_assignments")
          .select(
            "*, members(id, full_name, team_id, position), tasks(id, title, deadline, team_id, category, created_by)",
          )
          .order("created_at", { ascending: false }),
      ),
  });
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export const CATEGORIES = ["LCM", "Instagram", "Дни рождения", "Engagement", "Бот", "Другое"];

export type Profile = Tables<"profiles">;
export type ActivityRow = Tables<"activity_log">;

export type FullAssignment = Assignment & {
  members: Pick<Member, "id" | "full_name" | "team_id" | "position" | "telegram_chat_id"> | null;
};

export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    queryFn: () => must<Profile[]>(supabase.from("profiles").select("*").order("created_at")),
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const rows = await must<Tables<"app_settings">[]>(supabase.from("app_settings").select("*"));
      return Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""])) as Record<string, string>;
    },
  });
}

export function useTask(taskId: string) {
  return useQuery({
    queryKey: ["task", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", taskId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export function useTaskAssignments(taskId: string) {
  return useQuery({
    queryKey: ["assignments", "task", taskId],
    queryFn: () =>
      must<FullAssignment[]>(
        supabase
          .from("task_assignments")
          .select("*, members(id, full_name, team_id, position, telegram_chat_id)")
          .eq("task_id", taskId)
          .order("created_at"),
      ),
  });
}

export function useActivity(assignmentIds: string[]) {
  return useQuery({
    queryKey: ["activity", assignmentIds],
    enabled: assignmentIds.length > 0,
    queryFn: () =>
      must<ActivityRow[]>(
        supabase
          .from("activity_log")
          .select("*")
          .in("assignment_id", assignmentIds)
          .order("created_at", { ascending: false })
          .limit(100),
      ),
  });
}

/** Aggregate status for a task from its assignments. */
export function aggregateStatus(rows: { status: string }[]): string {
  if (rows.length === 0) return "sent";
  const s = rows.map((r) => r.status);
  if (s.every((x) => x === "done")) return "done";
  if (s.includes("help_needed")) return "help_needed";
  if (s.includes("overdue")) return "overdue";
  if (s.includes("submitted")) return "submitted";
  if (s.some((x) => x === "accepted" || x === "done")) return "accepted";
  if (s.every((x) => x === "not_delivered")) return "not_delivered";
  return "sent";
}

export const POSITION_LABEL: Record<string, string> = {
  vp: "VP MXP",
  team_leader: "Team Leader",
  manager: "Manager",
  member: "Member",
};

export function botLink(botUsername: string | undefined, inviteCode: string) {
  const u = (botUsername ?? "").replace(/^@/, "");
  return u ? `https://t.me/${u}?start=${inviteCode}` : "";
}

export function useStaffRoles() {
  return useQuery({
    queryKey: ["user_roles"],
    queryFn: () => must<Tables<"user_roles">[]>(supabase.from("user_roles").select("*")),
  });
}
