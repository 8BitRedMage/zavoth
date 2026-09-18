import { action, page, query, route, type Spec } from "@wasp.sh/spec";

import { PortfoliosPage } from "./client/PortfoliosPage" with { type: "ref" };
import {
  getManualSources,
  recordManualData,
  setEntityProfileUrl,
} from "./manualSources/operations" with { type: "ref" };
import {
  lookUpEntityFootprint,
  saveEntityFootprint,
} from "./footprint/operations" with { type: "ref" };
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
  updatePortfolioItem,
  updateTouchpoint,
} from "./operations" with { type: "ref" };

export const competitiveSpec: Spec = [
  route(
    "PortfoliosRoute",
    "/portfolios",
    page(PortfoliosPage, { authRequired: true }),
  ),

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
  action(updatePortfolioItem, {
    entities: ["Membership", "PortfolioItem"],
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

  // Footprint lookup
  action(lookUpEntityFootprint, {
    entities: ["Membership", "PortfolioItem", "TrackedEntity"],
  }),
  action(saveEntityFootprint, {
    entities: ["Membership", "PortfolioItem", "TrackedEntity", "Tracker"],
  }),

  // Manual sources: platforms that forbid bots, read by a person instead
  query(getManualSources, {
    entities: ["Membership", "PortfolioItem", "TrackedEntity", "ManualImport"],
  }),
  action(recordManualData, {
    entities: ["Membership", "PortfolioItem", "ManualImport"],
  }),
  action(setEntityProfileUrl, {
    entities: ["Membership", "PortfolioItem", "TrackedEntity"],
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
