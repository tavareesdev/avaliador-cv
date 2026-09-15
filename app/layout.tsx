import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Avaliador de Currículo com IA",
  description:
    "Avalie seu currículo como um ATS e um recrutador, e adapte-o a uma vaga específica — de graça.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
