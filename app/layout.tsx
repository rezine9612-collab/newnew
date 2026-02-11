import type { Metadata } from "next";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "NeuPrint",
  description: "NeuPrint MVP",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
