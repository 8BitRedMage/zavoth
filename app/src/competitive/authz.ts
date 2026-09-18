import { OrgRole, type Membership } from "@prisma/client";
import { HttpError, prisma } from "wasp/server";
import { hasOrgRole } from "./roles";

type OperationContext = { user?: { id: string } | null };

/**
 * The single authorization boundary for everything org-scoped. Every
 * competitive-intelligence operation must call this before touching data.
 */
export async function requireOrgMember(
  context: OperationContext,
  orgId: string,
  minRole: OrgRole = OrgRole.VIEWER,
): Promise<Membership> {
  if (!context.user) {
    throw new HttpError(401);
  }

  const membership = await prisma.membership.findUnique({
    where: { userId_orgId: { userId: context.user.id, orgId } },
  });

  if (!membership) {
    throw new HttpError(403, "You are not a member of this organization");
  }

  if (!hasOrgRole(membership.role, minRole)) {
    throw new HttpError(
      403,
      `This action requires the ${minRole} role or higher`,
    );
  }

  return membership;
}

/**
 * Entities are global, so "does this org get to see it" means "is it in one
 * of the org's portfolios".
 */
export async function requireEntityInOrg(
  orgId: string,
  entityId: string,
): Promise<void> {
  const item = await prisma.portfolioItem.findFirst({
    where: { entityId, portfolio: { orgId } },
    select: { entityId: true },
  });

  if (!item) {
    throw new HttpError(404, "Entity not found in this organization");
  }
}
