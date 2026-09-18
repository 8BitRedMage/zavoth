import { OrgRole } from "@prisma/client";
import { getMyOrganizations, useQuery } from "wasp/client/operations";
import { useLocalStorage } from "../../client/hooks/useLocalStorage";
import { hasOrgRole } from "../roles";

/**
 * The organization the user is working in. Most people have exactly one; with
 * several, the last pick is remembered per browser.
 */
export function useCurrentOrg() {
  const { data: orgs, isLoading, error } = useQuery(getMyOrganizations);
  const [storedOrgId, setOrgId] = useLocalStorage<string | null>(
    "current-org-id",
    null,
  );

  // A stored id can outlive the membership it pointed at.
  const org = orgs?.find((o) => o.id === storedOrgId) ?? orgs?.[0] ?? null;

  return {
    orgs: orgs ?? [],
    org,
    setOrgId,
    isLoading,
    error,
    can: (minRole: OrgRole) => !!org && hasOrgRole(org.role, minRole),
  };
}
