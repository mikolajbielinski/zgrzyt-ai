import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Speaker Labeler",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body className="bg-gray-950 text-gray-100 antialiased">{children}</body>
    </html>
  );
}
