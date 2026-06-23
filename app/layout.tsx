import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Macs In Stock",
  description: "Check local Apple Store pickup availability for Mac Studio and MacBook Pro.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Script async src="https://www.googletagmanager.com/gtag/js?id=G-0JL5PB9J41" strategy="afterInteractive" />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-0JL5PB9J41');
          `}
        </Script>
        {children}
      </body>
    </html>
  );
}
