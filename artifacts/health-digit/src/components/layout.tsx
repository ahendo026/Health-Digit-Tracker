import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useGetUploadSummary } from "@workspace/api-client-react";
import { LayoutDashboard, List, UploadCloud, CheckCircle2 } from "lucide-react";
import { Badge } from "./ui/badge";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { data: summary } = useGetUploadSummary();

  const navItems = [
    { label: "Upload", href: "/", icon: UploadCloud },
    { label: "History", href: "/history", icon: List },
    { label: "Review", href: "/review", icon: CheckCircle2, badge: summary?.pendingReview },
  ];

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside className="w-64 border-r border-border bg-sidebar shrink-0 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <div className="font-semibold text-lg flex items-center gap-2 text-primary">
            <LayoutDashboard className="w-5 h-5" />
            Health Digit
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-6 px-4 flex flex-col gap-1">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <div
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
                  <span className="font-medium">{summary.total}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Analyzed</span>
                  <span className="font-medium">{summary.analyzed}</span>
                </div>
                {summary.byClassification.map((c) => (
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
      </aside>
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
