import { describe, expect, it } from "vitest";
import {
  inferFrequency,
  parseImportCsv,
  parseImportDate,
  parseImportValue,
} from "@/lib/csv/parseImport";

/**
 * Section 22.1, csvImport.test.ts.
 */

describe("parseImportDate", () => {
  it("normalizes every accepted format to a period start", () => {
    expect(parseImportDate("2020-03-01")).toBe("2020-03-01");
    expect(parseImportDate("2020-03-15")).toBe("2020-03-01");
    expect(parseImportDate("2020-03")).toBe("2020-03-01");
    expect(parseImportDate("2020Q2")).toBe("2020-04-01");
    expect(parseImportDate("2020-Q2")).toBe("2020-04-01");
    expect(parseImportDate("Q2 2020")).toBe("2020-04-01");
    expect(parseImportDate("2020")).toBe("2020-01-01");
    expect(parseImportDate("3/15/2020")).toBe("2020-03-01");
  });

  it("returns null for something it cannot read", () => {
    expect(parseImportDate("last tuesday")).toBeNull();
    expect(parseImportDate("2020-13")).toBeNull();
    expect(parseImportDate("")).toBeNull();
  });
});

describe("parseImportValue", () => {
  it("strips currency and grouping", () => {
    expect(parseImportValue("$1,234.5").value).toBe(1234.5);
  });

  it("strips a percent sign and records the hint", () => {
    const parsed = parseImportValue("4.2%");
    expect(parsed.value).toBe(4.2);
    expect(parsed.percent).toBe(true);
  });

  it("reads the missing-value tokens as null, never zero", () => {
    for (const token of ["", "NA", "N/A", "-", ".", "n/a"]) {
      const parsed = parseImportValue(token);
      expect(parsed.value).toBeNull();
      expect(parsed.ok).toBe(true);
    }
  });

  it("reports a value it cannot read", () => {
    expect(parseImportValue("about three").ok).toBe(false);
  });
});

describe("inferFrequency", () => {
  it("reads monthly, quarterly, and annual samples", () => {
    expect(
      inferFrequency(["2020-01-01", "2020-02-01", "2020-03-01", "2020-04-01", "2020-05-01"]),
    ).toBe("MONTHLY");
    expect(
      inferFrequency(["2020-01-01", "2020-04-01", "2020-07-01", "2020-10-01", "2021-01-01"]),
    ).toBe("QUARTERLY");
    expect(
      inferFrequency(["2016-01-01", "2017-01-01", "2018-01-01", "2019-01-01", "2020-01-01"]),
    ).toBe("ANNUAL");
  });

  it("gives up rather than guessing on an irregular file", () => {
    expect(inferFrequency(["2020-01-01", "2020-02-01", "2020-08-01", "2021-05-01"])).toBeNull();
  });
});

describe("parseImportCsv", () => {
  const good = [
    "date,value",
    "1990-01-01,3.4",
    "1990-02-01,3.5",
    "1990-03-01,3.6",
    "1990-04-01,3.7",
  ].join("\n");

  it("reads a well-formed file", () => {
    const parsed = parseImportCsv(good);

    expect(parsed.issues).toEqual([]);
    expect(parsed.frequency).toBe("MONTHLY");
    expect(parsed.rowCount).toBe(4);
    expect(parsed.columns).toHaveLength(1);
    expect(parsed.columns[0]?.header).toBe("value");
    expect(parsed.columns[0]?.points[0]).toEqual({ date: "1990-01-01", value: 3.4 });
  });

  it("creates one column per value column", () => {
    const multi = [
      "date,north,south",
      "2020-01-01,1,2",
      "2020-02-01,3,4",
      "2020-03-01,5,6",
      "2020-04-01,7,8",
    ].join("\n");

    const parsed = parseImportCsv(multi);
    expect(parsed.columns.map((c) => c.header)).toEqual(["north", "south"]);
    expect(parsed.columns[1]?.points.at(-1)?.value).toBe(8);
  });

  it("names the row number of a duplicate date", () => {
    const parsed = parseImportCsv(
      ["date,value", "2020-01-01,1", "2020-01-01,2", "2020-02-01,3", "2020-03-01,4"].join("\n"),
    );

    const duplicate = parsed.issues.find((i) => i.code === "DUPLICATE_DATE");
    expect(duplicate?.row).toBe(3);
    expect(duplicate?.message).toContain("row 2");
  });

  it("names the row number of an unreadable date and value", () => {
    const parsed = parseImportCsv(
      [
        "date,value",
        "2020-01-01,1",
        "last tuesday,2",
        "2020-03-01,about three",
        "2020-04-01,4",
        "2020-05-01,5",
      ].join("\n"),
    );

    expect(parsed.issues.find((i) => i.code === "UNPARSEABLE_DATE")?.row).toBe(3);
    expect(parsed.issues.find((i) => i.code === "UNPARSEABLE_VALUE")?.row).toBe(4);
  });

  it("rejects a three-row file", () => {
    const parsed = parseImportCsv(
      ["date,value", "2020-01-01,1", "2020-02-01,2", "2020-03-01,3"].join("\n"),
    );
    expect(parsed.issues.some((i) => i.code === "TOO_FEW_ROWS")).toBe(true);
  });

  it("carries the percent hint through to the column", () => {
    const parsed = parseImportCsv(
      ["date,rate", "2020-01-01,3.4%", "2020-02-01,3.5%", "2020-03-01,3.6%", "2020-04-01,3.7%"].join(
        "\n",
      ),
    );
    expect(parsed.columns[0]?.looksLikeRate).toBe(true);
    expect(parsed.columns[0]?.points[0]?.value).toBe(3.4);
  });

  it("rejects a date outside 1776 to next year", () => {
    const parsed = parseImportCsv(
      ["date,value", "1700-01-01,1", "2020-02-01,2", "2020-03-01,3", "2020-04-01,4"].join("\n"),
    );
    expect(parsed.issues.some((i) => i.code === "DATE_OUT_OF_RANGE")).toBe(true);
  });
});
