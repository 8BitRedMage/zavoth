import {
  BarChart3,
  Briefcase,
  FileText,
  LayoutGrid,
  Plug,
  Settings,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { routes } from "wasp/client/router";

export interface AppNavItem {
  name: string;
  to: string;
  icon: LucideIcon;
  isAdminOnly?: boolean;
}

export const appNavItems: AppNavItem[] = [
  { name: "Dashboard", to: routes.DashboardRoute.to, icon: LayoutGrid },
  { name: "Portfolios", to: routes.PortfoliosRoute.to, icon: Briefcase },
  { name: "Analytics", to: routes.AnalyticsRoute.to, icon: BarChart3 },
  { name: "Reports", to: routes.ReportsRoute.to, icon: FileText },
  { name: "Integrations", to: routes.IntegrationsRoute.to, icon: Plug },
];

export const appFooterNavItems: AppNavItem[] = [
  { name: "Settings", to: routes.AccountRoute.to, icon: Settings },
  {
    name: "Admin",
    to: routes.AdminRoute.to,
    icon: Shield,
    isAdminOnly: true,
  },
];

// Pages that render inside the logged-in dashboard shell.
export const appLayoutPaths: string[] = [
  routes.DashboardRoute.to,
  routes.PortfoliosRoute.to,
  routes.AnalyticsRoute.to,
  routes.ReportsRoute.to,
  routes.IntegrationsRoute.to,
  routes.FileUploadRoute.to,
  routes.AccountRoute.to,
  routes.CheckoutResultRoute.to,
];
