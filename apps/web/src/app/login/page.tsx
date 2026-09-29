"use client";
import { useApp } from "@/components/providers";
import { ErrorBox, Field } from "@/components/ui";
import { clearCsrf, post } from "@/lib/api";
import type { User } from "@/lib/types";
import { ArrowRight, ArrowUpRight, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
export default function Login() {
  const { user, refresh } = useApp();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (user) router.replace(user.isAdmin ? "/dashboard" : "/my-leads");
  }, [user, router]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await post<User>("/auth/login", {
        username: form.get("username"),
        password: form.get("password"),
      });
      clearCsrf();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <section className="login-art">
        <div className="brand">
          <span className="brand-mark">
            v<span>ı</span>
          </span>
          <strong>
            via<span>crm</span>
          </strong>
        </div>
        <div className="login-copy">
          <span className="eyebrow">UM NOVO CAMINHO PARA SUA OPERAÇÃO</span>
          <h1>
            Boas conversas.
            <br />
            Grandes <em>conquistas.</em>
          </h1>
          <p>
            Aproximando pessoas da primeira habilitação.
            <br />E sua equipe, dos próximos resultados.
          </p>
          <div className="login-graphic">
            <div className="road road-one" />
            <div className="road road-two" />
            <span className="graphic-point p1" />
            <span className="graphic-point p2" />
            <div className="graphic-card">
              <span className="success-ring">
                <ArrowUpRight />
              </span>
              <div>
                <strong>Próxima parada: novas conquistas</strong>
                <span>Relacionamento que faz a diferença.</span>
              </div>
            </div>
          </div>
        </div>
        <small>Relacionamentos que levam mais longe.</small>
      </section>
      <section className="login-form">
        <div>
          <span className="eyebrow">BEM-VINDO AO SEU WORKSPACE</span>
          <h2>Vamos seguir em frente.</h2>
          <p>Acesse sua conta para cuidar do que importa.</p>
          <form onSubmit={submit}>
            {error && <ErrorBox message={error} />}
            <Field label="Usuário">
              <input
                name="username"
                autoComplete="username"
                placeholder="Seu usuário de acesso"
                required
                autoFocus
              />
            </Field>
            <Field label="Senha">
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder="Sua senha"
                required
              />
            </Field>
            <button className="button primary login-submit" disabled={busy}>
              {busy ? "Entrando…" : "Acessar meu espaço"}
              <ArrowRight size={18} />
            </button>
          </form>
          <div className="login-security">
            <ShieldCheck size={16} /> Acesso seguro à sua operação comercial
          </div>
        </div>
        <small>
          Precisa de acesso? Fale com o administrador da sua unidade.
        </small>
      </section>
    </div>
  );
}
