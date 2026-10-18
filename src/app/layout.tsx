import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PRISME — Des données aux décisions",
  description: "Votre espace personnel d’analyse des tipsters, de simulation et de suivi de bankroll.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body>{children}</body></html>;
}
