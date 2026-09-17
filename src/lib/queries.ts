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
  tasks: Pick<Task, "id" | "title" | "deadline" | "team_id" | "category"> | null;
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
    queryFn: () =>
      must<Template[]>(supabase.from("task_templates").select("*").order("title")),
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
            "*, members(id, full_name, team_id, position), tasks(id, title, deadline, team_id, category)",
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

export const CATEGORIES = [
  "LCM",
  "Instagram",
  "Дни рождения",
  "Engagement",
  "Бот",
  "Другое",
];
