'use client';

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";

export default function NavBar() {
  // Track if component is mounted (to avoid SSR/client mismatch)
  const [mounted, setMounted] = useState(false);
  // next-themes hook for theme management
  const { resolvedTheme, setTheme } = useTheme();

  // On mount, allow rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  // Prevent hydration mismatch: render nothing until mounted
  if (!mounted) return null;

  return (
    <div className="w-full bg-primary shadow-lg shadow-foreground h-16 flex items-center">
      <div className="pl-6 flex items-center h-full flex-1">
        <span className="bg-background text-2xl font-bold text-primary px-4 py-1 rounded-md shadow-sm shadow-foreground">
          BreakWorks
        </span>
      </div>
      <div className="pr-6">
        <button
          aria-label="Toggle dark mode"
          className="bg-background hover:bg-background/80 transition-colors px-3 py-1 rounded-md shadow-sm shadow-foreground text-primary font-semibold flex items-center"
          onClick={() =>
            setTheme(resolvedTheme === "dark" ? "light" : "dark")
          }
        >
          {resolvedTheme === "dark" ? (
            <Moon className="h-5 w-5" />
          ) : (
            <Sun className="h-5 w-5" />
          )}
        </button>
      </div>
    </div>
  );
}