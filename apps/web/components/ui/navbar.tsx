"use client";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { IconPlug, IconMenu2, IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

interface NavbarProps {
  variant?: "fixed" | "sticky";
}

export function Navbar({ variant: _variant }: NavbarProps) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const lastScrollY = useRef(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // Reset visibility and close menu on route change
  useEffect(() => {
    setVisible(true);
    setMenuOpen(false);
    lastScrollY.current = 0;
  }, [pathname]);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

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
            <span className="font-bold text-white text-sm tracking-tight">
              MCP Find
            </span>
          </Link>

          {/* Desktop nav items */}
          <div className="hidden sm:flex items-center gap-1">
            <Link
              href="/servers"
              className={cn(
                "relative flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                pathname === "/servers"
                  ? "text-white bg-white/10"
                  : "text-neutral-300 hover:bg-white/10 hover:text-white"
              )}
            >
              Browse Servers
            </Link>
            <a
              href="https://modelcontextprotocol.io"
              target="_blank"
              rel="noopener noreferrer"
              className="relative flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              Docs
            </a>
          </div>

          {/* Right side: CTA + mobile menu */}
          <div className="flex items-center gap-1" ref={menuRef}>
            <Link
              href="/submit"
              className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-600/20"
            >
              Submit Server
            </Link>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="sm:hidden flex items-center justify-center w-9 h-9 rounded-full text-neutral-300 hover:bg-white/10 hover:text-white transition-colors"
              aria-label="Toggle menu"
            >
              {menuOpen ? <IconX size={18} /> : <IconMenu2 size={18} />}
            </button>

            {/* Mobile dropdown */}
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="sm:hidden absolute top-full right-4 mt-2 w-48 rounded-xl border border-white/10 bg-black/90 backdrop-blur-md shadow-xl shadow-black/30 overflow-hidden"
                >
                  <Link
                    href="/servers"
                    className={cn(
                      "block px-4 py-3 text-sm font-medium transition-colors",
                      pathname === "/servers"
                        ? "text-white bg-white/10"
                        : "text-neutral-300 hover:bg-white/10 hover:text-white"
                    )}
                    onClick={() => setMenuOpen(false)}
                  >
                    Browse Servers
                  </Link>
                  <a
                    href="https://modelcontextprotocol.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-4 py-3 text-sm font-medium text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
                    onClick={() => setMenuOpen(false)}
                  >
                    Docs
                  </a>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.nav>
    </AnimatePresence>
  );
}
