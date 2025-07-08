'use client'
import NavBar from "@/components/NavBar";
import { ThemeProvider } from 'next-themes'
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import React, { useState, useEffect } from 'react';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Presentation mode state is managed in page.tsx, so we use a custom event to communicate
  const [showNav, setShowNav] = useState(true);

  // Listen for presentation mode toggle events from page.tsx
  useEffect(() => {
    function handlePresentationEvent(e: CustomEvent) {
      setShowNav(!e.detail.presentationMode);
    }
    window.addEventListener('presentationModeToggle', handlePresentationEvent as EventListener);
    return () => window.removeEventListener('presentationModeToggle', handlePresentationEvent as EventListener);
  }, []);

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`min-h-screen flex flex-col bg-amber-500 ${geistSans.variable} ${geistMono.variable}`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {showNav && <NavBar />}
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}