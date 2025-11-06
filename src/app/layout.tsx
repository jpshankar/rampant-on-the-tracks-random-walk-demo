import type { Metadata } from "next";
import './globals.css';

export const metadata: Metadata = {
  title: "Rampant on the Tracks - Random Walking",
  description: "Random walking demo",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}