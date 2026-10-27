"use client";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronRight,
  ContactRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Radio,
  Settings2,
  UsersRound,
  Vault,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useApp } from "./providers";
import { Avatar, ErrorBox, Loading } from "./ui";
const navigation = [
  {
    label: "Visão geral",
    href: "/dashboard",
    icon: LayoutDashboard,
    admin: true,
  },
  { label: "Meus leads", href: "/my-leads", icon: ContactRound },
  { label: "Transferidos", href: "/transferred-leads", icon: ArrowLeftRight },
  { label: "Todos os leads", href: "/leads", icon: UsersRound },
  { label: "Vendas", href: "/sales", icon: ChartNoAxesCombined },
  { label: "Agendamentos", href: "/appointments", icon: CalendarDays },
  {
    label: "Conversas",
    href: "/whatsapp",
    icon: MessageCircle,
    section: "RELACIONAMENTO",
  },
  { label: "Disparos", href: "/campaigns", icon: Radio },
  { label: "Grupos de leads", href: "/groups", icon: UsersRound },
  { label: "Histórico e backup", href: "/backup", icon: Vault },
  {
    label: "Configurações",
    href: "/settings",
    icon: Settings2,
    admin: true,
    section: "ADMINISTRAÇÃO",
  },
];
export function Shell({ children }: { children: ReactNode }) {
  const { user, catalog, loading, error, refresh, logout } = useApp();
  const path = usePathname();
  const router = useRouter();
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    if (!loading && !user && !error) router.replace("/login");
  }, [loading, user, error, router]);
  if (loading) return <Loading />;
  if (error)
    return (
      <div className="standalone">
        <ErrorBox message={error} retry={refresh} />
      </div>
    );
  if (!user) return null;
  const active = navigation.find((x) => x.href === path || path.startsWith(`${x.href}/`));
  return (
    <div className="app-shell">
      {mobile && (
        <button
          className="sidebar-overlay"
          aria-label="Fechar menu"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <Link
          className="brand"
          href={user.isAdmin ? "/dashboard" : "/my-leads"}
        >
          <span className="brand-mark">
            a<span>s</span>
          </span>
          <strong>
            as<span>crm</span>
          </strong>
          <span className="brand-tag">AUTOESCOLAS</span>
        </Link>
        <div className="workspace">
          <span className="workspace-icon">
            <Building2 size={20} />
          </span>
          <div>
            <strong>Autoescola Silva</strong>
            <span>Workspace comercial</span>
          </div>
          <span className="online-dot" />
        </div>
        <nav>
          <span className="nav-section">PRINCIPAL</span>
          {navigation
            .filter((x) => !x.admin || user.isAdmin)
            .map((item) => (
              <div key={item.href}>
                {item.section && (
                  <span className="nav-section">{item.section}</span>
                )}
                <Link
                  onClick={() => setMobile(false)}
                  className={`nav-item ${active?.href === item.href ? "active" : ""}`}
                  href={item.href}
                >
                  <item.icon size={19} />
                  <span>{item.label}</span>
                  {active?.href === item.href && <span className="nav-active-dot" />}
                </Link>
              </div>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="support-card">
            <span className="support-symbol">
              <ArrowUpRight size={20} />
            </span>
            <strong>Cada conversa, um novo caminho.</strong>
            <p>Relacionamentos que levam mais longe.</p>
          </div>
          <button
            className="profile"
            onClick={() => void logout()}
            title="Sair da conta"
          >
            <Avatar name={user.name} />
            <span>
              <strong>{user.name}</strong>
              <small>
                {user.isAdmin ? "Administrador" : "Consultor comercial"}
              </small>
            </span>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir menu"
              onClick={() => setMobile(true)}
            >
              <Menu size={22} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <h1>{active?.label || "Início"}</h1>
          </div>
          <div className="topbar-actions">
            <span className="branch-label">
              <Building2 size={15} />
              {catalog?.branches.find((x) => x.id === user.branchId)?.name ||
                "Todas as unidades"}
            </span>
            <span className="topbar-divider" />
            <Avatar small name={user.name} />
          </div>
        </header>
        <main className="main-content">{children}</main>
        <footer className="app-footer">
          <span>
            as crm <span>·</span> Feito para conectar caminhos.
          </span>
          <span>
            <span className="online-dot" /> Ambiente de trabalho
          </span>
        </footer>
      </div>
    </div>
  );
}
