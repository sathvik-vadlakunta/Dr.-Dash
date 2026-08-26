/**
 * Section 7.1. System categories: `isSystem = true`, `ownerId = null`, visible
 * to everyone. A user never gets a copy of these; edits create an overlay
 * (Section 9.1) keyed on the same slug.
 */

export interface SeedCategory {
  slug: string;
  name: string;
  sortOrder: number;
}

export const SEED_CATEGORIES: SeedCategory[] = [
  { sortOrder: 10, slug: "output-income", name: "National Income and Output" },
  { sortOrder: 20, slug: "prices-inflation", name: "Prices and Inflation" },
  { sortOrder: 30, slug: "labor-market", name: "Labor Market" },
  { sortOrder: 40, slug: "money-rates", name: "Money, Banking, and Interest Rates" },
  { sortOrder: 50, slug: "government-finance", name: "Government Finance" },
  { sortOrder: 60, slug: "international", name: "International Trade and Exchange Rates" },
  { sortOrder: 70, slug: "housing", name: "Housing and Construction" },
  { sortOrder: 80, slug: "productivity-costs", name: "Productivity and Costs" },
  { sortOrder: 90, slug: "consumer-business", name: "Consumer and Business Activity" },
  { sortOrder: 100, slug: "population-denominators", name: "Population and Denominators" },
  { sortOrder: 110, slug: "dr-dash-constructed", name: "Dr. Dash Constructed Series" },
];

export const CATEGORY_SLUGS = SEED_CATEGORIES.map((c) => c.slug);
export type CategorySlug = (typeof CATEGORY_SLUGS)[number];
