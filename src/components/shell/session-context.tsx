"use client";

import { createContext, useContext, useMemo } from "react";
import { can as roleCan, type Capability, type Role } from "@/lib/auth/permissions";

export type Viewer = {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
  organization: string | null;
};

type SessionValue = { viewer: Viewer; can: (capability: Capability) => boolean };

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ viewer, children }: { viewer: Viewer; children: React.ReactNode }) {
  const value = useMemo<SessionValue>(() => ({ viewer, can: (capability) => roleCan(viewer.role, capability) }), [viewer]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** The signed-in person and what their role lets the interface offer (the database enforces it). */
export function useViewer(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useViewer must be used inside the app shell");
  return value;
}
