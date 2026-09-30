"use client";
import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronRight,
  CircleHelp,
  ContactRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Radio,
  Settings2,
  ShieldCheck,
  UsersRound,
  Vault,
  X,
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
  const [help, setHelp] = useState(false);
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
  const active = navigation.find((x) => x.href === path);
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
            v<span>ı</span>
          </span>
          <strong>
            via<span>crm</span>
          </strong>
          <span className="brand-tag">AUTOESCOLAS</span>
        </Link>
        <div className="workspace">
          <span className="workspace-icon">
            <Building2 size={20} />
          </span>
          <div>
            <strong>Sua autoescola</strong>
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
                  className={`nav-item ${path === item.href ? "active" : ""}`}
                  href={item.href}
                >
                  <item.icon size={19} />
                  <span>{item.label}</span>
                  {path === item.href && <span className="nav-active-dot" />}
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
            <strong>{active?.label || "Início"}</strong>
          </div>
          <div className="topbar-actions">
            <span className="branch-label">
              <Building2 size={15} />
              {catalog?.branches.find((x) => x.id === user.branchId)?.name ||
                "Todas as unidades"}
            </span>
            <span className="topbar-divider" />
            <button
              className="icon-button"
              aria-label="Ajuda"
              onClick={() => setHelp(!help)}
            >
              <CircleHelp size={19} />
            </button>
            <Avatar small name={user.name} />
          </div>
        </header>
        {help && (
          <div className="help-banner">
            <ShieldCheck size={20} />
            <p>
              <strong>Seu espaço comercial.</strong> Cadastre leads, programe
              retornos e acompanhe as conversas. Em Disparos, os contatos “Não
              Enviar Mais” são excluídos automaticamente.
            </p>
            <button
              className="icon-button"
              aria-label="Fechar ajuda"
              onClick={() => setHelp(false)}
            >
              <X size={18} />
            </button>
          </div>
        )}
        <main className="main-content">{children}</main>
        <footer className="app-footer">
          <span>
            via crm <span>·</span> Feito para conectar caminhos.
          </span>
          <span>
            <span className="online-dot" /> Ambiente de trabalho
          </span>
        </footer>
      </div>
    </div>
  );
}
