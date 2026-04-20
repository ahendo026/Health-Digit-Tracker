import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useGetUploadSummary } from "@workspace/api-client-react";
import { LayoutDashboard, List, UploadCloud, CheckCircle2, Menu, X } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { data: summary } = useGetUploadSummary();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { label: "Upload", href: "/", icon: UploadCloud },
    { label: "History", href: "/history", icon: List },
    { label: "Review", href: "/review", icon: CheckCircle2, badge: summary?.pendingReview },
  ];

  const sidebarContent = (
    <>
      <div className="h-16 flex items-center justify-between px-6 border-b border-border">
        <div className="font-semibold text-lg flex items-center gap-2 text-primary">
          <LayoutDashboard className="w-5 h-5" />
          HealthDigits
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden h-8 w-8"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto py-6 px-4 flex flex-col gap-1">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <div
              onClick={() => setMobileOpen(false)}
              className={`flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                location === item.href
                  ? "bg-primary text-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent"
              }`}
            >
              <div className="flex items-center gap-3">
                <item.icon className="w-4 h-4" />
                {item.label}
              </div>
              {item.badge !== undefined && item.badge > 0 && (
                <Badge variant={location === item.href ? "secondary" : "default"} className="ml-2">
                  {item.badge}
                </Badge>
              )}
            </div>
          </Link>
        ))}

        {summary && (
          <div className="mt-8 px-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Overview
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Uploads</span>
                <span className="font-medium">{summary.total ?? 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Analyzed</span>
                <span className="font-medium">{summary.analyzed ?? 0}</span>
              </div>
              {(summary.byClassification ?? []).map((c) => (
                <div key={c.classification} className="flex justify-between text-sm">
                  <span className="text-muted-foreground capitalize">
                    {c.classification?.replace(/_/g, " ") || "Unknown"}
                  </span>
                  <span className="font-medium">{c.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 border-r border-border bg-sidebar shrink-0 flex-col">
        {sidebarContent}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-border bg-sidebar flex flex-col transition-transform duration-200 md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden h-14 border-b border-border bg-background flex items-center px-4 gap-3 sticky top-0 z-30">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </Button>
          <div className="font-semibold flex items-center gap-2 text-primary">
            <LayoutDashboard className="w-4 h-4" />
            HealthDigits
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
