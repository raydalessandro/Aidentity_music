import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIDENTITY",
  description: "Builder di siti e press kit per artisti.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
