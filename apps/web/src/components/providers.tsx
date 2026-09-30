"use client";
import { api, clearCsrf, post } from "@/lib/api";
import type { Catalog, User } from "@/lib/types";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type Context = {
  user: User | null;
  catalog?: Catalog;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  notify: (
    text: string,
    kind?: "success" | "error",
    retry?: () => void,
  ) => void;
};
type Toast = {
  id: number;
  text: string;
  kind: "success" | "error";
  retry?: () => void;
};
const AppContext = createContext<Context | null>(null);
export function Providers({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [catalog, setCatalog] = useState<Catalog>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextToastId = useRef(0);
  const toastStack = useRef<HTMLDivElement>(null);
  const [toastHost, setToastHost] = useState<HTMLElement | null>(null);
  const notify = useCallback(
    (text: string, kind: Toast["kind"] = "success", retry?: () => void) => {
      if (!text) return;
      const toast = { id: ++nextToastId.current, text, kind, retry };
      setToasts((current) => [toast, ...current]);
    },
    [],
  );
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
    const updateHost = () => {
      const dialogs =
        document.querySelectorAll<HTMLDialogElement>("dialog[open]");
      setToastHost(dialogs.item(dialogs.length - 1) || document.body);
    };
    updateHost();
    // Modal dialogs make everything outside them inert, including popovers.
    const observer = new MutationObserver(updateHost);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const stack = toastStack.current;
    if (!stack) return;
    stack.hidePopover();
    stack.showPopover();
  }, [toasts, toastHost]);
  useLayoutEffect(() => {
    const cards =
      toastStack.current?.querySelector<HTMLDivElement>(".toast-stack-cards");
    if (!cards) return;
    const measure = () => {
      let offset = 0;
      Array.from(cards.children).forEach((child, index) => {
        const card = child as HTMLDivElement;
        card.style.setProperty("--toast-offset", `${offset}px`);
        if (index === 0)
          cards.style.setProperty(
            "--toast-first-height",
            `${card.offsetHeight}px`,
          );
        offset += card.offsetHeight + 10;
      });
      cards.style.setProperty(
        "--toast-expanded-height",
        `${offset - 10 + 6}px`,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    Array.from(cards.children).forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [toasts, toastHost]);
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
        notify,
      }}
    >
      {children}
      {toasts.length > 0 &&
        toastHost &&
        createPortal(
          <div
            ref={toastStack}
            popover="manual"
            className="toast-stack"
            role="region"
            aria-label="Notificações"
            tabIndex={0}
          >
            <div className="toast-stack-count">
              {toasts.length}{" "}
              {toasts.length === 1 ? "notificação" : "notificações"}
            </div>
            <div className="toast-stack-cards">
              {toasts.map((toast, index) => (
                <div
                  key={toast.id}
                  role={toast.kind === "error" ? "alert" : "status"}
                  className={`toast toast-${toast.kind}`}
                  style={
                    {
                      "--toast-index": index,
                      zIndex: toasts.length - index,
                    } as CSSProperties
                  }
                >
                  {toast.kind === "error" ? (
                    <AlertCircle size={19} />
                  ) : (
                    <CheckCircle2 size={19} />
                  )}
                  <div className="toast-content">
                    <span>{toast.text}</span>
                    {toast.retry && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={toast.retry}
                      >
                        Tentar novamente
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    className="toast-close"
                    aria-label="Fechar notificação"
                    onClick={() =>
                      setToasts((current) =>
                        current.filter((item) => item.id !== toast.id),
                      )
                    }
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>,
          toastHost,
        )}
    </AppContext.Provider>
  );
}
export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("Provider ausente");
  return context;
}
