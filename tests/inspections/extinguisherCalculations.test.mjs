import assert from "node:assert/strict";
import test from "node:test";
import { calculateStorey, calculateBuilding, parseDecimal, addCalendarMonths, parseCalendarDate, projectServiceDate, APPROVED_DATE_POLICIES } from "../../engineer-app/src/modules/Extinguishers/extinguisherCalculations.ts";
const floor = (overrides = {}) => ({ id: "ground", name: "Ground", areaM2: 600, installed: [], ...overrides });

test("area demand and additional units use actual labelled ratings only", () => {
  const result = calculateStorey(floor({ additionalRatingA: 13 }));
  assert.equal(result.demandA, 39); assert.equal(result.additionalUnits, 3);
  assert.equal(calculateStorey(floor()).additionalUnits, null);
  assert.equal(calculateStorey(floor({ areaM2: 10 })).demandA, 0.65); // No unverified minimum/exception.
});
test("mixed ratings and zero quantities count correctly", () => {
  const result = calculateStorey(floor({ installed: [{ quantity: 1, ratingA: 13 }, { quantity: 1, ratingA: 21 }, { quantity: 0, ratingA: 55 }], additionalRatingA: 13 }));
  assert.equal(result.installedA, 34); assert.equal(result.differenceA, -5); assert.equal(result.additionalUnits, 1);
  assert.equal(calculateStorey(floor({ installed: [{ quantity: 3, ratingA: 13 }], additionalRatingA: 13 })).additionalUnits, 0);
});
test("a genuine shortfall just above an exact rating boundary is never rounded away", () => {
  const result = calculateStorey(floor({ areaM2: 400.001, installed: [{ quantity: 2, ratingA: 13 }], additionalRatingA: 13 }));
  assert.equal(result.shortfallA, 0.000065); assert.equal(result.additionalUnits, 1);
  assert.throws(() => calculateStorey(floor({ areaM2: 400.0001 })));
});
test("independent floors never cancel a shortfall with another floor's surplus", () => {
  const result = calculateBuilding([floor({ areaM2: 100, installed: [{ quantity: 1, ratingA: 55 }] }), floor({ id: "upper", name: "Upper", areaM2: 600, additionalRatingA: 13 })]);
  assert.equal(result.totalShortfallA, 39); assert.equal(result.storeys[1].additionalUnits, 3);
});
test("invalid areas, quantities and ratings are rejected explicitly", () => {
  for (const areaM2 of [0, -1, NaN, Infinity, "600", 10000001]) assert.throws(() => calculateStorey(floor({ areaM2 })));
  for (const quantity of [-1, 0.5, NaN, Infinity, 1000001]) assert.throws(() => calculateStorey(floor({ installed: [{ quantity, ratingA: 13 }] })));
  for (const ratingA of [0, -1, 1.5, NaN, Infinity, "13A"]) assert.throws(() => calculateStorey(floor({ installed: [{ quantity: 1, ratingA }] })));
  for (const additionalRatingA of [0, -1, NaN]) assert.throws(() => calculateStorey(floor({ additionalRatingA })));
  assert.throws(() => calculateBuilding([floor(), floor()]));
  for (const value of ["", " ", "-1", "1e3", "1,000", "13A", "Infinity", ".5"]) assert.throws(() => parseDecimal(value, "Input"));
  assert.equal(parseDecimal(" 12.5 ", "Area"), 12.5);
});
test("500 square metres and two 13A units need one additional 13A unit, resulting in 39A", () => {
  const result = calculateStorey(floor({ areaM2: 500, installed: [{ quantity: 2, ratingA: 13 }], additionalRatingA: 13 }));
  assert.equal(result.demandA, 32.5);
  assert.equal(result.installedA, 26);
  assert.equal(result.shortfallA, 6.5);
  assert.equal(result.additionalUnits, 1);
  assert.equal(result.installedA + result.additionalUnits * result.additionalRatingA, 39);
});

test("additional units round up for each selected labelled rating, including custom ratings", () => {
  for (const [ratingA, expectedUnits, expectedTotal] of [[8, 5, 40], [13, 3, 39], [21, 2, 42], [34, 2, 68], [17, 3, 51]]) {
    const result = calculateStorey(floor({ areaM2: 600, additionalRatingA: ratingA }));
    assert.equal(result.additionalUnits, expectedUnits);
    assert.equal(result.installedA + result.additionalUnits * result.additionalRatingA, expectedTotal);
  }
});

test("mixed quantities and independent additional ratings preserve each floor's proposal", () => {
  const result = calculateBuilding([
    floor({ areaM2: 100, installed: [{ quantity: 2, ratingA: 34 }], additionalRatingA: 8 }),
    floor({ id: "upper", areaM2: 1000, installed: [{ quantity: 2, ratingA: 13 }, { quantity: 1, ratingA: 21 }], additionalRatingA: 8 }),
    floor({ id: "top", areaM2: 600, additionalRatingA: 21 }),
  ]);
  assert.deepEqual(result.storeys.map(({ installedA, shortfallA, additionalUnits }) => ({ installedA, shortfallA, additionalUnits })), [
    { installedA: 68, shortfallA: 0, additionalUnits: 0 },
    { installedA: 47, shortfallA: 18, additionalUnits: 3 },
    { installedA: 0, shortfallA: 39, additionalUnits: 2 },
  ]);
  assert.equal(result.totalShortfallA, 57);
});

test("missing and invalid additional ratings cannot produce a misleading quantity", () => {
  assert.equal(calculateStorey(floor()).additionalUnits, null);
  for (const additionalRatingA of [0, -13, 13.5, Infinity, NaN, 10001, "13"]) {
    assert.throws(() => calculateStorey(floor({ additionalRatingA })));
  }
});

test("calendar months clamp month ends and leap years without timezone rollover", () => {
  assert.equal(addCalendarMonths("2024-02-29", 12), "2025-02-28");
  assert.equal(addCalendarMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addCalendarMonths("2023-12-31", 2), "2024-02-29");
  assert.equal(addCalendarMonths("2026-10-25", 1), "2026-11-25");
});
test("invalid dates and intervals fail; no BS date policy is shipped", () => {
  for (const value of ["2025-02-29", "2026-04-31", "2026-13-01", "01/02/2026", "2026-1-1", "", "1899-01-01"]) assert.throws(() => parseCalendarDate(value));
  for (const months of [0, -1, 1.5, NaN, 1201]) assert.throws(() => addCalendarMonths("2026-01-01", months));
  assert.deepEqual(APPROVED_DATE_POLICIES, []);
  assert.throws(() => projectServiceDate({ basisDate: "2025-01-01", asOf: "2026-01-01", equipmentType: "test", serviceType: "test" }, null));
});
test("synthetic approved policies exercise date boundaries, applicability and future-date rejection", () => {
  const policy = { id: "test-fixture-only", version: 1, approval: "approved", approvedBy: "test", source: "synthetic test fixture, not BS guidance", equipmentType: "test", serviceType: "test", basis: "last-service", months: 12 };
  const input = { basisDate: "2024-02-29", asOf: "2025-02-28", equipmentType: "test", serviceType: "test" };
  assert.equal(projectServiceDate(input, policy).status, "due-today");
  assert.equal(projectServiceDate({ ...input, asOf: "2025-03-01" }, policy).status, "overdue");
  assert.equal(projectServiceDate({ ...input, asOf: "2025-02-27" }, policy).status, "upcoming");
  assert.throws(() => projectServiceDate({ ...input, equipmentType: "other" }, policy));
  assert.throws(() => projectServiceDate({ ...input, asOf: "2024-01-01" }, policy));
});
