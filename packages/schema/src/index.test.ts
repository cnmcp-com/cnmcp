import { describe, expect, it } from "vitest";

import { ALGORITHM_VERSION, GRADES, V1_WEIGHTS } from "./index";

describe("schema constants", () => {
  it("keeps v1 weights summing to 100", () => {
    const total = Object.values(V1_WEIGHTS).reduce((sum, value) => sum + value, 0);
    expect(total).toBe(100);
    expect(ALGORITHM_VERSION).toBe("v1.0");
    expect(GRADES).toEqual(["A", "B", "C", "D"]);
  });
});
