import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { NavLink } from "react-router";
import { type User } from "wasp/entities";
import { cn } from "../../utils";
import { appFooterNavItems, appNavItems, type AppNavItem } from "./constants";

export function AppSidebar({
  user,
  collapsed = false,
  onToggleCollapsed,
  onNavigate,
}: {
  user: Partial<User>;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
}) {
  const visible = (items: AppNavItem[]) =>
    items.filter((item) => !item.isAdminOnly || user.isAdmin);

  return (
    <div className="bg-console-surface flex h-full flex-col justify-between px-4 py-6">
      <div className="flex flex-col gap-6">
        <div
          className={cn(
            "flex items-center",
            collapsed ? "justify-center" : "justify-between",
          )}
        >
          {!collapsed && (
            <p className="text-console-muted font-mono text-[10px] font-bold uppercase tracking-[1px]">
              Navigation
            </p>
          )}
          {onToggleCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="text-console-dim hover:text-console-muted flex cursor-pointer items-center gap-1.5 font-mono text-[10px] font-medium transition-colors"
            >
              {!collapsed && "Collapse"}
              {collapsed ? (
                <ChevronsRight className="size-2.5" aria-hidden="true" />
              ) : (
                <ChevronsLeft className="size-2.5" aria-hidden="true" />
              )}
            </button>
          )}
        </div>

        <NavList
          items={visible(appNavItems)}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      </div>

      <NavList
        items={visible(appFooterNavItems)}
        collapsed={collapsed}
        onNavigate={onNavigate}
      />
    </div>
  );
}

function NavList({
  items,
  collapsed,
  onNavigate,
}: {
  items: AppNavItem[];
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item.name}>
          <NavLink
            to={item.to}
            onClick={onNavigate}
            title={collapsed ? item.name : undefined}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg border-l-2 p-3 transition-colors",
                collapsed && "justify-center",
                isActive
                  ? "bg-console-raised border-console-cyan"
                  : "hover:bg-console-raised/60 border-transparent",
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded border",
                    isActive
                      ? "bg-console-cyan/10 border-console-cyan text-console-cyan"
                      : "bg-console-raised border-console-border text-console-muted",
                  )}
                >
                  <item.icon
                    className="size-3"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                </span>
                {!collapsed && (
                  <span
                    className={cn(
                      "text-sm whitespace-nowrap",
                      isActive
                        ? "text-console-fg font-semibold"
                        : "text-console-muted font-medium",
                    )}
                  >
                    {item.name}
                  </span>
                )}
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}
