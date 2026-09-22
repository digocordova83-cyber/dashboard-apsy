import { createContext, useContext, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";

export type LocalUser = {
  uid: number;
  username: string;
  name: string;
  role: "admin" | "analista" | "cliente";
};

type Ctx = {
  user: LocalUser | null;
  loading: boolean;
  refetch: () => void;
};

const LocalAuthContext = createContext<Ctx>({ user: null, loading: true, refetch: () => {} });

export function LocalAuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, refetch } = trpc.localAuth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  return (
    <LocalAuthContext.Provider value={{ user: (data as LocalUser | null) ?? null, loading: isLoading, refetch }}>
      {children}
    </LocalAuthContext.Provider>
  );
}

export function useLocalAuth() {
  return useContext(LocalAuthContext);
}
