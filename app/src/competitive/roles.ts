import { OrgRole } from "@prisma/client";

// Shared by the server's authz checks and the client, which uses it to hide
// controls the server would refuse anyway.

// Higher index = more privilege.
const ROLE_RANK: Record<OrgRole, number> = {
  [OrgRole.VIEWER]: 0,
  [OrgRole.MEMBER]: 1,
  [OrgRole.ADMIN]: 2,
  [OrgRole.OWNER]: 3,
};

export function hasOrgRole(role: OrgRole, minRole: OrgRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}
