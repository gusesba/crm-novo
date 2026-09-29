import { Providers } from "@/components/providers";
import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "via crm — Seu próximo caminho",
  description: "Relacionamento e gestão comercial para autoescolas.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
