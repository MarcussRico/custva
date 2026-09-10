import type { Metadata } from "next";
import { Poppins, Gabarito, Instrument_Sans, DM_Mono } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins"
});

/* The login page uses the same three faces as the merchant site so the two
   do not look like different products. Poppins stays for the admin dashboard,
   which styles against --font-poppins. */
const gabarito = Gabarito({ subsets: ["latin"], weight: ["400","500","600","700"], variable: "--font-gabarito" });
const instrument = Instrument_Sans({ subsets: ["latin"], weight: ["400","500","600"], variable: "--font-instrument" });
const dmMono = DM_Mono({ subsets: ["latin"], weight: ["400","500"], variable: "--font-dm-mono" });

export const metadata: Metadata = {
  title: "Custva Admin Dashboard",
  description: "Platform-level analytics, merchant management, and governance."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${gabarito.variable} ${instrument.variable} ${dmMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
