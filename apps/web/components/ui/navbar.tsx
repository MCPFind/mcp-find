"use client";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { IconPlug, IconServer, IconBook } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

interface NavbarProps {
  variant?: "fixed" | "sticky";
}

export function Navbar({ variant: _variant }: NavbarProps) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);

  // Reset visibility on route change
  useEffect(() => {
    setVisible(true);
    lastScrollY.current = 0;
  }, [pathname]);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY < 100) {
        setVisible(true);
      } else if (currentScrollY < lastScrollY.current) {
        setVisible(true);
      } else if (currentScrollY > lastScrollY.current) {
        setVisible(false);
      }

      lastScrollY.current = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <AnimatePresence mode="wait">
      <motion.nav
        initial={{ opacity: 1, y: 0 }}
        animate={{
          y: visible ? 0 : -100,
          opacity: visible ? 1 : 0,
        }}
        transition={{ duration: 0.2 }}
        className="fixed top-6 inset-x-0 z-[5000] max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
      >
        <div className="flex items-center justify-between gap-2 rounded-full border border-white/10 bg-black/50 px-2 py-1.5 shadow-lg shadow-black/20 backdrop-blur-md">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 rounded-full px-3 py-2"
          >
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <IconPlug size={13} className="text-white" />
            </div>
            <span className="hidden sm:block font-bold text-white text-sm tracking-tight">
              MCP Find
            </span>
          </Link>


          {/* Nav items */}
          <div className="flex items-center gap-1">
            <Link
              href="/servers"
              className={cn(
                "relative flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                pathname === "/servers"
                  ? "text-white bg-white/10"
                  : "text-neutral-300 hover:bg-white/10 hover:text-white"
              )}
            >
              <IconServer size={16} className="block sm:hidden" />
              <span className="hidden sm:block">Browse Servers</span>
            </Link>
            <a
              href="https://modelcontextprotocol.io"
              target="_blank"
              rel="noopener noreferrer"
              className="relative flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              <IconBook size={16} className="block sm:hidden" />
              <span className="hidden sm:block">Docs</span>
            </a>
          </div>


          {/* CTA */}
          <Link
            href="/submit"
            className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-600/20"
          >
            Submit Server
          </Link>
        </div>
      </motion.nav>
    </AnimatePresence>
  );
}
