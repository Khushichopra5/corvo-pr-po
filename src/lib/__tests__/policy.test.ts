import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY } from "@/engine/default-policy";
import { diffPolicies, extractPolicyDraft, plainLanguageChanges } from "@/lib/policy";

describe("policy amendment extraction", () => {
  it("reads a replacement spot limit and effective date", () => {
    const result = extractPolicyDraft(
      "Amendment 01 effective 2026-11-20. In clause 5.4, replace the spot PO limit of INR 2,00,000 with INR 1,50,000.",
      DEFAULT_POLICY,
    );
    expect(result.draft.parameters.spot_po_max_inr).toBe(150000);
    expect(result.draft.effective_from).toBe("2026-11-20");
    expect(result.draft.version).toBe("5.1");
  });

  it("adds a plant-specific rule with a lower priority number than RFQ", () => {
    const result = extractPolicyDraft(
      "Add a rule for Chakan. Requirements of INR 8,00,000 or more go to RFP with 5 suppliers.",
      DEFAULT_POLICY,
    );
    const rule = result.draft.rules.find((candidate) => candidate.id.includes("CHK1"));
    expect(rule).toBeDefined();
    expect(rule?.priority).toBeLessThan(50);
    expect(rule?.then.route).toBe("RFP");
    expect(rule?.when).toMatchObject({ all: expect.any(Array) });
  });

  it("produces a plain-language diff", () => {
    const result = extractPolicyDraft(
      "Change the emergency cap from INR 5,00,000 to INR 8,00,000, effective 2026-12-01.",
      DEFAULT_POLICY,
    );
    expect(result.draft.parameters.emergency_po_max_inr).toBe(800000);
    const changes = diffPolicies(DEFAULT_POLICY, result.draft);
    expect(plainLanguageChanges(changes).join(" ")).toContain("Emergency PO limit");
  });

  it("does not guess a full policy document", () => {
    const text =
      "1.1 Every PR line must be matched to an item. This policy decides what happens to every purchase requisition. 8.1 Every decision must record the policy clause.";
    const result = extractPolicyDraft(text, DEFAULT_POLICY);
    expect(result.changes).toHaveLength(0);
    expect(result.warnings[0]).toContain("full policy");
  });
});
