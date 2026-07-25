import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ThemeControl } from "./_components/theme-control";

export const metadata: Metadata = {
  title: "Savia",
  description: "Organiza lo que sigue.",
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  const prepaint = `try{const v=localStorage.getItem('savia-theme');const t=v==='light'||v==='dark'?v:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch{document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}`;
  return (
    <html lang="es-CO">
      <body>
        <script dangerouslySetInnerHTML={{ __html: prepaint }} />
        <ThemeControl />
        {children}
      </body>
    </html>
  );
}
