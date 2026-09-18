import { action, query, type Spec } from "@wasp.sh/spec";

import {
  addEntityToPortfolio,
  createOrganization,
  createPortfolio,
  createTag,
  createTouchpoint,
  deletePortfolio,
  deleteTag,
  deleteTouchpoint,
  getEntity,
  getMyOrganizations,
  getPortfolios,
  getTags,
  getTouchpoints,
  removeEntityFromPortfolio,
  setEntityTags,
  updateEntity,
  updatePortfolio,
  updateTouchpoint,
} from "./operations" with { type: "ref" };

export const competitiveSpec: Spec = [
  // Organizations
  query(getMyOrganizations, { entities: ["Membership", "Organization"] }),
  action(createOrganization, { entities: ["Organization", "Membership"] }),

  // Portfolios
  query(getPortfolios, {
    entities: ["Membership", "Portfolio", "PortfolioItem", "TrackedEntity"],
  }),
  action(createPortfolio, { entities: ["Membership", "Portfolio"] }),
  action(updatePortfolio, { entities: ["Membership", "Portfolio"] }),
  action(deletePortfolio, { entities: ["Membership", "Portfolio"] }),

  // Entities
  action(addEntityToPortfolio, {
    entities: [
      "Membership",
      "Portfolio",
      "PortfolioItem",
      "TrackedEntity",
      "Tracker",
    ],
  }),
  action(removeEntityFromPortfolio, {
    entities: ["Membership", "PortfolioItem"],
  }),
  query(getEntity, {
    entities: [
      "Membership",
      "TrackedEntity",
      "Tracker",
      "EntityTag",
      "Tag",
      "PortfolioItem",
      "Portfolio",
    ],
  }),
  action(updateEntity, {
    entities: ["Membership", "TrackedEntity", "Tracker"],
  }),

  // Tags
  query(getTags, { entities: ["Membership", "Tag"] }),
  action(createTag, { entities: ["Membership", "Tag"] }),
  action(deleteTag, { entities: ["Membership", "Tag"] }),
  action(setEntityTags, { entities: ["Membership", "Tag", "EntityTag"] }),

  // Touchpoints
  query(getTouchpoints, { entities: ["Membership", "Touchpoint", "File"] }),
  action(createTouchpoint, { entities: ["Membership", "Touchpoint", "File"] }),
  action(updateTouchpoint, { entities: ["Membership", "Touchpoint", "File"] }),
  action(deleteTouchpoint, { entities: ["Membership", "Touchpoint"] }),
];
