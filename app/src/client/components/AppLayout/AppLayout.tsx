import { ReactNode, useState } from "react";
import { useAuth } from "wasp/client/auth";
import { VoiceChatWidget } from "../../../voice/client/VoiceChatWidget";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { cn } from "../../utils";
import { Sheet, SheetContent, SheetTitle } from "../ui/sheet";
import { AppSidebar } from "./AppSidebar";
import { AppTopBar } from "./AppTopBar";

export function AppLayout({ children }: { children: ReactNode }) {
  const { data: user } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage(
    "app-sidebar-collapsed",
    false,
  );

  return (
    <div className="bg-console-bg text-console-fg dark flex h-screen flex-col">
      <AppTopBar
        user={user ?? undefined}
        onOpenMobileNav={() => setMobileNavOpen(true)}
      />

      <div className="flex min-h-0 flex-1">
        {user && (
          <>
            <aside
              className={cn(
                "border-console-border hidden shrink-0 border-r transition-[width] duration-200 lg:block",
                sidebarCollapsed ? "w-16" : "w-[220px]",
              )}
            >
              <AppSidebar
                user={user}
                collapsed={sidebarCollapsed}
                onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
              />
            </aside>

            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetContent
                side="left"
                className="bg-console-surface border-console-border w-[220px] p-0"
              >
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <AppSidebar
                  user={user}
                  onNavigate={() => setMobileNavOpen(false)}
                />
              </SheetContent>
            </Sheet>
          </>
        )}

        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      {user && <VoiceChatWidget />}
    </div>
  );
}
