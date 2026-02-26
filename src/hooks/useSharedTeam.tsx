"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useTeam } from "@/hooks/useTeam";
import type { Team, TeamMember } from "@/lib/types";

interface TeamContextValue {
  team: Team | null;
  members: TeamMember[];
  loading: boolean;
  error: string | null;
  setTeam: (team: Team | null) => void;
  setMembers: (members: TeamMember[]) => void;
  refetch: () => void;
}

const TeamContext = createContext<TeamContextValue | null>(null);

export function TeamProvider({ children }: { children: ReactNode }) {
  const value = useTeam();
  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

/**
 * Use this hook in any component under the (app) layout to get the shared
 * team state. This ensures all components see the same team instance and
 * that refetch() updates everyone simultaneously.
 */
export function useSharedTeam(): TeamContextValue {
  const ctx = useContext(TeamContext);
  if (!ctx) {
    throw new Error("useSharedTeam must be used within a TeamProvider");
  }
  return ctx;
}
