import { LogOut, Menu, Search, Settings } from "lucide-react";
import { useEffect, useRef } from "react";
import { logout } from "wasp/client/auth";
import { Link as WaspRouterLink, routes } from "wasp/client/router";
import { type User } from "wasp/entities";
import zavothLogo from "../../static/zavoth-logo.svg";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export function AppTopBar({
  user,
  onOpenMobileNav,
}: {
  user?: Partial<User>;
  onOpenMobileNav?: () => void;
}) {
  return (
    <header className="border-console-border flex items-center gap-4 border-b px-4 py-4 sm:px-8">
      {user && onOpenMobileNav && (
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="text-console-muted hover:bg-console-raised hover:text-console-fg -ml-1 rounded-md p-1.5 transition-colors lg:hidden"
        >
          <span className="sr-only">Open navigation</span>
          <Menu className="size-5" aria-hidden="true" />
        </button>
      )}

      <WaspRouterLink
        to={routes.DashboardRoute.to}
        className="flex shrink-0 items-center gap-4"
      >
        <img src={zavothLogo} alt="" className="size-7" />
        <span className="text-console-fg text-lg font-bold">Zavoth</span>
      </WaspRouterLink>

      <PortfolioFilter />

      <div className="ml-auto flex items-center gap-5">
        <div className="hidden items-center gap-2 md:flex">
          <span
            aria-hidden="true"
            className="bg-console-green size-1.5 rounded-full"
          />
          <p className="text-console-muted font-mono text-[11px] font-medium whitespace-nowrap">
            ALL STREAMS ACTIVE
          </p>
        </div>
        {user && <OperatorMenu user={user} />}
      </div>
    </header>
  );
}

function PortfolioFilter() {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <label className="bg-console-surface border-console-border focus-within:border-console-dim mx-auto hidden w-full max-w-[360px] items-center gap-2 rounded-md border px-3 py-2 sm:flex">
      <Search
        className="text-console-muted size-3.5 shrink-0"
        strokeWidth={2}
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="search"
        placeholder="FILTER PORTFOLIO_ (CMD+K)"
        aria-label="Filter portfolio"
        className="placeholder:text-console-dim text-console-fg min-w-0 flex-1 appearance-none border-none bg-transparent p-0 font-mono text-xs leading-none shadow-none focus:outline-none focus:ring-0"
      />
    </label>
  );
}

function OperatorMenu({ user }: { user: Partial<User> }) {
  const displayName = user.username ?? user.email ?? "Account";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="border-console-border bg-console-raised text-console-fg hover:border-console-dim flex size-8 cursor-pointer items-center justify-center rounded-full border text-sm font-semibold transition-colors"
        >
          {initial}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">
          {displayName}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <WaspRouterLink
            to={routes.AccountRoute.to}
            className="flex w-full items-center gap-3"
          >
            <Settings size="1.1rem" />
            Account Settings
          </WaspRouterLink>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => logout()}>
          <LogOut size="1.1rem" />
          Log Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
