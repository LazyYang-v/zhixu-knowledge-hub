import { expect, it } from "vitest";
import { csvCell } from "../../src/lib/csv";
it("neutralizes formulas and escapes delimiters", () => {
  for (const text of ['=HYPERLINK("evil")', " +cmd", "@SUM(A1)", "-1", "\t=1"])
    expect(csvCell(text)).toMatch(/^"'/);
  expect(csvCell('a,"b"')).toBe('"a,""b"""');
});
