"use client";
import { Field } from "@/components/ui";
import type { Lead } from "@/lib/types";
export function CustomerFields({
  lead,
  initial,
}: {
  lead?: Lead;
  initial?: { name: string; phone: string };
}) {
  return (
    <div className="form-grid">
      <Field label="Nome completo *" wide>
        <input
          name="name"
          defaultValue={lead?.name || initial?.name}
          required
          maxLength={160}
          placeholder="Como o cliente se chama?"
        />
      </Field>
      <Field label="Contato principal *">
        <input
          name="phone"
          type="tel"
          defaultValue={lead?.phone || initial?.phone}
          required
          placeholder="(51) 99999-9999"
        />
      </Field>
      <Field label="Telefone adicional">
        <input
          name="additionalPhone"
          type="tel"
          defaultValue={lead?.additionalPhone || ""}
          placeholder="Outro número de contato"
        />
      </Field>
      <Field label="E-mail">
        <input
          name="email"
          type="email"
          defaultValue={lead?.email || ""}
          placeholder="cliente@email.com"
        />
      </Field>
      <Field label="Data de nascimento">
        <input
          name="birthDate"
          type="date"
          defaultValue={lead?.birthDate || ""}
        />
      </Field>
      <Field label="Gênero">
        <select name="gender" defaultValue={lead?.gender || ""}>
          <option value="">Selecione</option>
          {["Masculino", "Feminino", "Outro", "Prefiro não informar"].map(
            (s) => (
              <option key={s}>{s}</option>
            ),
          )}
        </select>
      </Field>
      <Field label="Origem">
        <select name="origin" defaultValue={lead?.origin || "site"}>
          {["site", "redes sociais", "presencialmente", "fone"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>
    </div>
  );
}
