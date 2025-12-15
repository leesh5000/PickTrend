"use client";

import { useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "../ui/theme-toggle";

const NAV_ITEMS = [
  { name: "상품", href: "/rankings", active: true },
  { name: "검색어", href: "/trends", active: true },
  { name: "기사", href: "#", active: false },
  { name: "커뮤니티", href: "#", active: false },
];

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="border-b">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold">
          <span className="text-primary">Pick</span>Ranky
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          {NAV_ITEMS.map((item) =>
            item.active ? (
              <Link
                key={item.name}
                href={item.href}
                className="text-muted-foreground hover:text-foreground transition"
              >
                {item.name}
              </Link>
            ) : (
              <span
                key={item.name}
                className="text-muted-foreground/50 cursor-not-allowed relative group"
                title="Coming Soon"
              >
                {item.name}
                <span className="absolute -top-1 -right-2 text-[10px] text-primary">*</span>
              </span>
            )
          )}
          <ThemeToggle />
        </nav>

        {/* Mobile Menu Button */}
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-2 rounded-lg hover:bg-muted transition"
            aria-label="메뉴 열기"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {isMenuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isMenuOpen && (
        <nav className="md:hidden border-t bg-background">
          <ul className="px-4 py-2 space-y-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.name}>
                {item.active ? (
                  <Link
                    href={item.href}
                    onClick={() => setIsMenuOpen(false)}
                    className="block px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition"
                  >
                    {item.name}
                  </Link>
                ) : (
                  <span
                    className="block px-3 py-2 rounded-lg text-muted-foreground/50 cursor-not-allowed relative"
                    title="Coming Soon"
                  >
                    {item.name}
                    <span className="ml-1 text-[10px] text-primary">*</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
