"use client";

import { useState, useEffect, useMemo } from "react";
import { getPocketBase } from "@/lib/pocketbase";
import type { UserRecord } from "@/lib/types";

export function useAuth() {
  // getPocketBase() returns a module-level singleton on the client; useMemo
  // ensures the reference is stable across re-renders without reading a ref
  // during render.
  const pb = useMemo(() => getPocketBase(), []);

  const [user, setUser] = useState<UserRecord | null>(
    pb.authStore.record as UserRecord | null
  );
  const [isAuthenticated, setIsAuthenticated] = useState(pb.authStore.isValid);

  useEffect(() => {
    const unsub = pb.authStore.onChange(() => {
      setUser(pb.authStore.record as UserRecord | null);
      setIsAuthenticated(pb.authStore.isValid);
    });
    return () => unsub();
  }, [pb]);

  return { user, isAuthenticated };
}
