import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Macs In Stock",
  description: "Check local Apple Store pickup availability for Mac Studio and MacBook Pro.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
