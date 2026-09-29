"use client";
import { api, clearCsrf, post } from "@/lib/api";
import type { Catalog, User } from "@/lib/types";
import { CheckCircle2, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type Context = {
  user: User | null;
  catalog?: Catalog;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  notify: (text: string) => void;
};
const AppContext = createContext<Context | null>(null);
export function Providers({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [catalog, setCatalog] = useState<Catalog>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const refresh = useCallback(async () => {
    setError("");
    try {
      const current = await api<User>("/auth/me");
      setUser(current);
      setCatalog(await api<Catalog>("/catalog"));
    } catch (e) {
      setUser(null);
      if (!(e && typeof e === "object" && "status" in e && e.status === 401))
        setError(e instanceof Error ? e.message : "API indisponível.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(id);
    }
  }, [toast]);
  const logout = async () => {
    await post("/auth/logout");
    clearCsrf();
    setUser(null);
    setCatalog(undefined);
    window.location.assign("/login");
  };
  return (
    <AppContext.Provider
      value={{
        user,
        catalog,
        loading,
        error,
        refresh,
        logout,
        notify: setToast,
      }}
    >
      {children}
      {toast && (
        <div role="status" className="toast">
          <CheckCircle2 size={19} />
          {toast}
          <button aria-label="Fechar notificação" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </AppContext.Provider>
  );
}
export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("Provider ausente");
  return context;
}
