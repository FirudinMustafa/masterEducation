import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import { ToastHost } from "@/components/ui/toast-host";
import { LoginGate } from "@/components/auth/login-gate";
import { CookieConsentBanner } from "@/components/legal/cookie-consent";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXTAUTH_URL ?? "https://mastereducation.com.tr"
  ),
  title: {
    default: "Master Education | Egitim Materyalleri & Yabanci Dil Kitaplari",
    template: "%s | Master Education",
  },
  description:
    "Egitim materyalleri ve yabanci dil kitaplari icin guvenilir adresiniz. ELT, DaF, MEB ve daha fazlasi. Toptan ve perakende satis.",
  openGraph: {
    type: "website",
    locale: "tr_TR",
    siteName: "Master Education",
    title: "Master Education | Egitim Materyalleri",
    description:
      "Egitim materyalleri ve yabanci dil kitaplari icin guvenilir adresiniz.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Master Education",
    description:
      "Egitim materyalleri ve yabanci dil kitaplari icin guvenilir adresiniz.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className={`${inter.variable} ${jakarta.variable} h-full`}>
      <body className="min-h-full flex flex-col font-sans antialiased overflow-x-hidden">
        <Providers>
          {children}
          <ToastHost />
          <LoginGate />
          <CookieConsentBanner />
        </Providers>
      </body>
    </html>
  );
}
