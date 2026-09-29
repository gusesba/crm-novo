"use client";
export type SettingsTab = "users" | "branches" | "services" | "conditions";
export const settingsTitles: Record<SettingsTab, string> = {
  users: "Equipe",
  branches: "Sedes",
  services: "Serviços",
  conditions: "Condições de venda",
};
