"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin", label: "대시보드", icon: "📊" },
  { href: "/admin/products/new", label: "상품 등록", icon: "➕" },
  { href: "/admin/products/bulk", label: "일괄 등록", icon: "📋" },
  { href: "/admin/products", label: "상품 관리", icon: "📦" },
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

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r flex flex-col">
        <div className="p-4 border-b">
          <Link href="/" className="text-xl font-bold">
            <span className="text-primary">Pick</span>Trend
          </Link>
          <div className="text-xs text-muted-foreground mt-1">Admin Panel</div>
        </div>

        <nav className="flex-1 p-4">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
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

        <div className="p-4 border-t">
          <Link
            href="/api/auth/signout"
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition text-muted-foreground"
          >
            <span>🚪</span>
            <span>로그아웃</span>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 bg-muted/30">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
