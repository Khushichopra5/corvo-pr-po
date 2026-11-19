import type { Policy } from "./types";

/**
 * Corvo Procurement Policy v5.0, encoded as data.
 * The decision engine is generic; changing these parameters/rules does not
 * require a code change. Clause references are retained for audit.
 */
export const DEFAULT_POLICY: Policy = {
  schema_version: "1.0",
  policy_id: "CORVO-PROC-POL-04",
  version: "5.0",
  effective_from: "2026-04-01",
  status: "active",
  currency: "INR",
  plants: ["PUN1", "CHK1"],
  supplier_guard: { excludeStatuses: ["Blocked", "Inactive"] },
  parameters: {
    spot_po_max_inr: 200000,
    emergency_po_max_inr: 500000,
    rfq_max_inr: 1000000,
    capex_suggestions: 5,
    rfq_suggestions: 3,
    rfp_suggestions: 5,
    clubbing_created_days: 14,
    clubbing_need_by_days: 7,
    consolidation_hours: 24,
    valuation_po_lookback_days: 365,
    valuation_po_supplier_filter: "any",
    preferred_po_lookback_days: 548,
    bought_active_lookback_days: 365,
    recency_fast_days: 90,
    recency_medium_days: 365,
    frequency_cap: 3,
    ranking_weights: {
      frequency: 0.4,
      recency: 0.3,
      contract: 0.15,
      delivery: 0.075,
      quality: 0.075,
    },
  },
  rules: [
    {
      id: "R-NEW",
      clause: "1.2",
      priority: 5,
      enabled: true,
      label: "New item sourcing",
      when: { fact: "item.is_new", op: "eq", value: true },
      then: {
        decision: "SOURCING_REQUEST",
        route: "NEW_ITEM_SOURCING",
        supplier: "NONE",
        price: "NONE",
        suggest_count: 0,
      },
    },
    {
      id: "R-CAPEX",
      clause: "5.1",
      priority: 10,
      enabled: true,
      label: "Capex sourcing",
      when: { fact: "item.item_type", op: "eq", value: "Capex" },
      then: {
        decision: "SOURCING_REQUEST",
        route: "CAPEX_SOURCING",
        supplier: "NONE",
        price: "NONE",
        suggest_count: { param: "capex_suggestions" },
        requires_approval: "CAPEX",
      },
    },
    {
      id: "R-CONTRACT",
      clause: "5.2",
      priority: 20,
      enabled: true,
      label: "Rate contract PO",
      when: { fact: "contract.usable", op: "eq", value: true },
      then: {
        decision: "PO",
        route: "CONTRACT_PO",
        supplier: "CONTRACT",
        price: "CONTRACT_RATE",
      },
    },
    {
      id: "R-EMERGENCY",
      clause: "5.3",
      priority: 30,
      enabled: true,
      label: "Emergency PO",
      when: {
        all: [
          { fact: "requirement.is_emergency", op: "eq", value: true },
          { fact: "requirement.value", op: "lte", value: { param: "emergency_po_max_inr" } },
          { fact: "history.bought_active_365d", op: "eq", value: true },
        ],
      },
      then: {
        decision: "PO",
        route: "EMERGENCY_PO",
        supplier: "PREFERRED_RANK_1",
        price: "REFERENCE_PRICE",
      },
    },
    {
      id: "R-SPOT",
      clause: "5.4",
      priority: 40,
      enabled: true,
      label: "Spot PO",
      when: {
        all: [
          { fact: "requirement.value", op: "lt", value: { param: "spot_po_max_inr" } },
          { fact: "history.bought_active_365d", op: "eq", value: true },
        ],
      },
      then: {
        decision: "PO",
        route: "SPOT_PO",
        supplier: "PREFERRED_RANK_1",
        price: "REFERENCE_PRICE",
      },
    },
    {
      id: "R-RFQ",
      clause: "5.5",
      priority: 50,
      enabled: true,
      label: "RFQ",
      when: { fact: "requirement.value", op: "lt", value: { param: "rfq_max_inr" } },
      then: {
        decision: "SOURCING_REQUEST",
        route: "RFQ",
        supplier: "NONE",
        price: "NONE",
        suggest_count: { param: "rfq_suggestions" },
      },
    },
    {
      id: "R-RFP",
      clause: "5.6",
      priority: 60,
      enabled: true,
      label: "RFP",
      when: { fact: "requirement.value", op: "gte", value: { param: "rfq_max_inr" } },
      then: {
        decision: "SOURCING_REQUEST",
        route: "RFP",
        supplier: "NONE",
        price: "NONE",
        suggest_count: { param: "rfp_suggestions" },
      },
    },
  ],
};

export function clonePolicy(policy: Policy = DEFAULT_POLICY): Policy {
  return JSON.parse(JSON.stringify(policy)) as Policy;
}
