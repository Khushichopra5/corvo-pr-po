import { describe, expect, it } from "vitest";
import { parseDraft } from "@/lib/chat-parser";

describe("chat slot parsing", () => {
  it("extracts item, quantity, plant and a relative date", () => {
    const parsed = parseDraft("need 200 nitrile gloves for Chakan by next Friday");
    expect(parsed.description).toBe("nitrile gloves");
    expect(parsed.quantity).toBe(200);
    expect(parsed.plant).toBe("CHK1");
    expect(parsed.needByDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("does not treat a bearing model number as quantity", () => {
    const parsed = parseDraft("need bearing 6205 for Bhosari by 25 Nov");
    expect(parsed.quantity).toBeUndefined();
    expect(parsed.description).toContain("6205");
    expect(parsed.plant).toBe("PUN1");
    expect(parsed.needByDate).toBe(`${new Date().getFullYear()}-11-25`);
  });

  it("keeps unknown item descriptions intact", () => {
    const parsed = parseDraft("drinking water purifier 50 LPH for PUN1 by 2026-12-01");
    expect(parsed.description?.toLowerCase()).toBe("drinking water purifier 50 lph");
    expect(parsed.needByDate).toBe("2026-12-01");
  });
});
