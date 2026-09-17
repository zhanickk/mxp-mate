import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Invalidates assignment queries whenever task_assignments changes (e.g. bot button presses). */
export function useAssignmentsRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel(`assignments-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_assignments" }, () => {
        void qc.invalidateQueries({ queryKey: ["assignments"] });
        void qc.invalidateQueries({ queryKey: ["activity"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);
}
