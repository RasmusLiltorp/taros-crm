"use client";

import { useState, useEffect, useRef } from "react";
import { getPocketBase } from "@/lib/pocketbase";
import type { ClientResponseError } from "pocketbase";
import type { Team, TeamMember } from "@/lib/types";

export function useTeam() {
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // loadData is exposed via refetch; store in a ref so callers always get the
  // latest version without triggering re-renders.
  const loadDataRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    const pb = getPocketBase();
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    async function loadData() {
      const user = pb.authStore.record;
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }
      if (!cancelled) setLoading(true);
      try {
        const membership = await pb
          .collection("team_members")
          .getFirstListItem<TeamMember>(`user="${user.id}"`, {
            expand: "team",
          });
        if (cancelled) return;
        const t = membership.expand?.team as Team;
        setTeam(t);

        if (t) {
          const allMembers = await pb
            .collection("team_members")
            .getFullList<TeamMember>({
              filter: `team="${t.id}"`,
              expand: "user",
            });
          if (cancelled) return;
          setMembers(allMembers);
        }
        if (!cancelled) setError(null);
      } catch (err) {
        if (cancelled) return;
        const pbErr = err as ClientResponseError;
        // If the request was auto-cancelled (duplicate concurrent request from
        // another useTeam() instance on the same page), retry after a short delay.
        if (pbErr?.isAbort) {
          retryTimer = setTimeout(() => { void loadData(); }, 150);
          return;
        }
        // Not in a team yet (or other error) — surface to callers
        if (!cancelled) setError(pbErr?.message ?? "Failed to load team.");
      }
      if (!cancelled) setLoading(false);
    }

    loadDataRef.current = loadData;
    void loadData();

    // Re-run whenever auth changes (e.g. after redirect from email verification)
    const unsub = pb.authStore.onChange(() => {
      void loadData();
    });

    return () => {
      cancelled = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
      unsub();
    };
  }, []);

  // refetch re-runs loadData; reset loading state so callers see a spinner.
  function refetch() {
    setLoading(true);
    void loadDataRef.current();
  }

  return { team, members, loading, error, setTeam, setMembers, refetch };
}
