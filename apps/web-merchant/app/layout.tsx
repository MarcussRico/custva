import type { Metadata } from "next";
import { Poppins, Gabarito, Instrument_Sans, DM_Mono } from "next/font/google";
import "./globals.css";

/* Poppins stays for the merchant dashboard, which styles against
   --font-poppins throughout. The landing page uses the three faces below. */
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins"
});

/* Display: rounded geometric sans, chosen because the Custva logomark is
   built from rounded terminals and a circular arc. */
const gabarito = Gabarito({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-gabarito"
});

/* Body: narrow-ish grotesque that keeps long paragraphs compact. */
const instrument = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-instrument"
});

/* Utility: used only for genuine instrument labels — day offsets,
   tier names, counts. Never for navigation or buttons. */
const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono"
});

export const metadata: Metadata = {
  title: "Custva — retention and WhatsApp follow-up for offline businesses",
  description:
    "Custva records walk-in visits, keeps a customer list you can filter, and sends scheduled WhatsApp follow-ups after each visit. Built for cafes, salons and local retail."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    /* The font variables must live on <html>, not <body>. Tailwind's @theme
       emits --font-display: var(--font-gabarito), ... onto :root, and a var()
       with no fallback pointing at a property that is undefined *there* makes
       the whole declaration invalid — font-family then silently fell back to
       the inherited Poppins. */
    <html
      lang="en"
      className={`${poppins.variable} ${gabarito.variable} ${instrument.variable} ${dmMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
