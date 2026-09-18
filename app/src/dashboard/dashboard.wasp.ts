import { page, route, type Spec } from "@wasp.sh/spec";

import { DashboardPage } from "./DashboardPage" with { type: "ref" };
import {
  AnalyticsPage,
  IntegrationsPage,
  PortfoliosPage,
  ReportsPage,
} from "./ComingSoonPages" with { type: "ref" };

export const dashboardSpec: Spec = [
  route(
    "DashboardRoute",
    "/dashboard",
    page(DashboardPage, { authRequired: true }),
  ),
  route(
    "PortfoliosRoute",
    "/portfolios",
    page(PortfoliosPage, { authRequired: true }),
  ),
  route(
    "AnalyticsRoute",
    "/analytics",
    page(AnalyticsPage, { authRequired: true }),
  ),
  route("ReportsRoute", "/reports", page(ReportsPage, { authRequired: true })),
  route(
    "IntegrationsRoute",
    "/integrations",
    page(IntegrationsPage, { authRequired: true }),
  ),
];
