import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Header } from "@/components/ui/Header";
import { AuthProvider } from "@/components/AuthProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import Script from "next/script";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Voxely",
  description: "Secure, real-time voice and video streaming",
  robots: {
    index: false,
    follow: false,
  },
  icons: {
    icon: [
      { url: '/logo_192x192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/logo_167x167.png', sizes: '167x167' },
      { url: '/logo_180x180.png', sizes: '180x180' },
    ],
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Voxely',
  },
  formatDetection: {
    telephone: false,
  },
  themeColor: '#6366F1',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased min-h-screen flex flex-col`}>
        <AuthProvider>
          <ThemeProvider />
          <Header />
          <main className="flex-1 flex flex-col">
            {children}
          </main>
          {/* <Footer /> */}
          <Script id="register-sw" strategy="afterInteractive">
            {`
                if ('serviceWorker' in navigator) {
                  window.addEventListener('load', function() {
                    navigator.serviceWorker.register('/sw.js').then(function(registration) {
                      console.log('ServiceWorker registration successful with scope: ', registration.scope);
                    }, function(err) {
                      console.log('ServiceWorker registration failed: ', err);
                    });
                  });
                }
              `}
          </Script>
        </AuthProvider>
      </body>
    </html>
  );
}
