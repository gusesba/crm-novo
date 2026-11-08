"use client";
import { Field } from "@/components/ui";
import type { Lead } from "@/lib/types";
import { PhoneInput } from "./phone-input";
export function CustomerFields({
  lead,
  initial,
  readOnly = false,
}: {
  lead?: Lead;
  initial?: { name: string; phone: string };
  readOnly?: boolean;
}) {
  return (
    <div className="form-grid">
      <Field label="Nome completo *" wide>
        <input
          name="name"
          readOnly={readOnly}
          defaultValue={lead?.name || initial?.name}
          required
          pattern={".*\\S.*"}
          title="Informe o nome do cliente."
          maxLength={160}
          placeholder="Como o cliente se chama?"
        />
      </Field>
      <Field label="Contato principal *">
        <PhoneInput
          name="phone"
          readOnly={readOnly}
          defaultValue={lead?.phone || initial?.phone}
          required
          placeholder="(51) 99999-9999"
        />
      </Field>
      <Field label="Telefone adicional">
        <PhoneInput
          name="additionalPhone"
          readOnly={readOnly}
          defaultValue={lead?.additionalPhone || ""}
          placeholder="Outro número de contato"
        />
      </Field>
      <Field label="E-mail">
        <input
          name="email"
          type="email"
          maxLength={200}
          defaultValue={lead?.email || ""}
          placeholder="cliente@email.com"
        />
      </Field>
      <Field label="Data de nascimento">
        <input
          name="birthDate"
          type="date"
          max={new Date().toISOString().slice(0, 10)}
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
          {["site", "redes sociais", "presencialmente", "fone", "não informado"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>
    </div>
  );
}
