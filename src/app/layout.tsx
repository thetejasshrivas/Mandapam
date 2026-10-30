import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./shell.css";
import "./dashboard.css";
import "./tasks.css";
import "./tasks-mobile.css";
import "./budget.css";
import "./ceremonies.css";
import "./family.css";
import "./adapt.css";

export const metadata: Metadata = {
  title: "Wedding Preparation Workspace",
  description: "A wedding preparation workspace, currently under development.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
