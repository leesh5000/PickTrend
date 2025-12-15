"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const navItems = [
  { href: "/admin", label: "대시보드", icon: "📊" },
  { href: "/admin/products/new", label: "상품 등록", icon: "➕" },
  { href: "/admin/products/bulk", label: "일괄 등록", icon: "📋" },
  { href: "/admin/products", label: "상품 관리", icon: "📦" },
  { href: "/admin/trends", label: "트렌드 관리", icon: "🔥" },
  { href: "/admin/categories", label: "카테고리 관리", icon: "🏷️" },
  { href: "/admin/videos", label: "영상 관리", icon: "🎬" },
  { href: "/admin/analytics", label: "분석", icon: "📈" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!session && pathname !== "/admin/login") {
    redirect("/admin/login");
  }

  // Show login page without layout
  if (pathname === "/admin/login") {
    return children;
  }

  const closeSidebar = () => setIsSidebarOpen(false);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Mobile Header */}
      <header className="lg:hidden flex items-center justify-between p-4 border-b bg-card">
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="p-2 rounded-lg hover:bg-muted transition"
          aria-label="메뉴 열기"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
        <Link href="/" className="text-xl font-bold">
          <span className="text-primary">Pick</span>Ranky
        </Link>
        <ThemeToggle />
      </header>

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 w-64 bg-card border-r flex flex-col transform transition-transform duration-300 ease-in-out",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <Link href="/" className="text-xl font-bold" onClick={closeSidebar}>
              <span className="text-primary">Pick</span>Ranky
            </Link>
            <div className="text-xs text-muted-foreground mt-1">Admin Panel</div>
          </div>
          {/* Close button for mobile */}
          <button
            onClick={closeSidebar}
            className="lg:hidden p-2 rounded-lg hover:bg-muted transition"
            aria-label="메뉴 닫기"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={closeSidebar}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg transition",
                    pathname === item.href
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  )}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-4 border-t space-y-2">
          <div className="hidden lg:flex items-center justify-between px-3 py-2">
            <span className="text-sm text-muted-foreground">테마</span>
            <ThemeToggle />
          </div>
          <Link
            href="/api/auth/signout"
            onClick={closeSidebar}
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition text-muted-foreground"
          >
            <span>🚪</span>
            <span>로그아웃</span>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 bg-muted/30 min-w-0">
        <div className="p-4 lg:p-6">{children}</div>
      </main>
    </div>
  );
}
