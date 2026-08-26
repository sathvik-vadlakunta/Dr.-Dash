import {
  checkSeriesInvariants,
  type Aggregation,
  type Frequency,
  type SeriesFields,
  type SeriesKind,
} from "../../src/lib/series/types";
import { CATEGORY_SLUGS } from "./categories";

/**
 * Sections 7.2 and 7.3. Every FRED id used anywhere in this build is enumerated
 * here; nothing may hardcode an id that is not in this file (Rule 0.1.3).
 *
 * Rows carry only what Section 7 states. The capability flags are *derived* by
 * `toSeedSeries` from the capability matrix of Section 6.7, so the Section 5.2
 * invariants hold by construction rather than by 65 hand-typed booleans. The
 * derivation is asserted at module load: an inconsistent row throws before the
 * seed can write it.
 */

interface Row {
  slug: string;
  category: (typeof CATEGORY_SLUGS)[number];
  title: string;
  shortLabel: string;
  description: string;
  units: string;
  unitsShort: string;
  mult: number;
  freq: Frequency;
  kind: SeriesKind;
  sa?: "SA" | "NSA" | "SAAR";
  /** Section 7.2 column `N`. */
  nominal?: true;
  /** Section 7.2 column `R`. */
  realAlready?: true;
  /** Section 7.2 column `defl`. */
  defl?: string;
  /** Section 7.2 column `pop`. Its presence is what turns per capita on. */
  pop?: string;
  /** Section 7.2 column `agg`. */
  agg?: Aggregation;
  canGrowth?: false;
  canBeDenominator?: false;
  isPublic?: false;
  notes?: string;
  constructed?: true;
}

export interface SeedSeries extends SeriesFields {
  categorySlug: string;
}

const FRED_URL = (id: string) => `https://fred.stlouisfed.org/series/${id}`;

function toSeedSeries(r: Row): SeedSeries {
  const isLevel = r.kind === "LEVEL_CURRENCY" || r.kind === "LEVEL_COUNT";
  return {
    slug: r.slug,
    categorySlug: r.category,
    source: r.constructed ? "CONSTRUCTED" : "FRED",
    fredId: r.constructed ? null : r.slug,
    title: r.title,
    shortLabel: r.shortLabel,
    description: r.description,
    units: r.units,
    unitsShort: r.unitsShort,
    unitMultiplier: r.mult,
    frequency: r.freq,
    seasonalAdjustment: r.sa ?? "NSA",
    kind: r.kind,
    isNominal: r.nominal === true,
    isRealAlready: r.realAlready === true,
    // Section 6.7: only a nominal monetary level can be deflated.
    canReal: r.nominal === true,
    // A level with a named population divisor, and nothing else, is per capita-able.
    canPerCapita: isLevel && r.pop !== undefined,
    canGrowth: r.canGrowth ?? r.kind !== "FLAG",
    // "A rate cannot be a denominator", and neither can a 0/1 flag.
    canBeDenominator:
      r.canBeDenominator ?? (r.kind !== "RATE_PERCENT" && r.kind !== "FLAG"),
    defaultDeflator: r.defl ?? null,
    defaultPopulation: r.pop ?? null,
    aggregation: r.agg ?? "AVG",
    sourceName: r.constructed ? "Dr. Dash" : "FRED",
    sourceUrl: r.constructed ? null : FRED_URL(r.slug),
    notes: r.notes ?? null,
    isPublic: r.isPublic ?? true,
  };
}

// ---------------------------------------------------------------------------
// Category `output-income`
// ---------------------------------------------------------------------------

const OUTPUT_INCOME: Row[] = [
  {
    slug: "GDP",
    category: "output-income",
    title: "Gross Domestic Product",
    shortLabel: "Nominal GDP",
    description:
      "The market value of all final goods and services produced in the United States, measured at the prices of the period in which they were produced.",
    units: "Billions of Dollars",
    unitsShort: "Bil. $",
    mult: 1e9,
    freq: "QUARTERLY",
    kind: "LEVEL_CURRENCY",
    sa: "SAAR",
    nominal: true,
    defl: "GDPDEF",
    pop: "B230RC0Q173SBEA",
    agg: "AVG",
  },
  {
    slug: "GDPC1",
    category: "output-income",
    title: "Real Gross Domestic Product",
    shortLabel: "Real GDP",
    description:
      "Gross domestic product valued at the prices of a single reference year, so changes reflect quantities produced rather than the prices they sold for.",
    units: "Billions of Chained 2017 Dollars",
    unitsShort: "Bil. 2017 $",
    mult: 1e9,
    freq: "QUARTERLY",
    kind: "LEVEL_CURRENCY",
    sa: "SAAR",
    realAlready: true,
    defl: "GDPDEF",
    pop: "B230RC0Q173SBEA",
    agg: "AVG",
  },
  {
    slug: "GDPDEF",
    category: "output-income",
    title: "Gross Domestic Product: Implicit Price Deflator",
    shortLabel: "GDP Deflator",
    description:
      "The ratio of nominal to real GDP, scaled to 100 in the reference year. It is the broadest price index in the national accounts because it covers everything GDP covers.",
    units: "Index 2017=100",
    unitsShort: "Index 2017=100",
    mult: 1,
    freq: "QUARTERLY",
    kind: "INDEX",
    sa: "SA",
    agg: "AVG",
    notes:
      "DEFLATOR: the broadest price index available, covering every component of GDP. Use it for national-accounts aggregates.",
  },
  {
    slug: "PCEC",
    category: "output-income",
    title: "Personal Consumption Expenditures",
    shortLabel: "Consumption (C)",
    description:
      "Household spending on goods and services. The largest component of GDP, usually around two thirds of it.",
    units: "Billions of Dollars",
    unitsShort: "Bil. $",
    mult: 1e9,
    freq: "QUARTERLY",
    kind: "LEVEL_CURRENCY",
    sa: "SAAR",
    nominal: true,
    defl: "GDPDEF",
    pop: "B230RC0Q173SBEA",
    agg: "AVG",
  },
  {
    slug: "GPDI",
    category: "output-income",
    title: "Gross Private Domestic Investment",
    shortLabel: "Investment (I)",
    description:
      "Business spending on structures, equipment, and intellectual property, plus residential construction and inventory change. The most cyclical component of GDP.",
    units: "Billions of Dollars",
    unitsShort: "Bil. $",
    mult: 1e9,
    freq: "QUARTERLY",
    kind: "LEVEL_CURRENCY",
    sa: "SAAR",
    nominal: true,
    defl: "GDPDEF",
    pop: "B230RC0Q173SBEA",
    agg: "AVG",
  },
  {
    slug: "GCE",
    category: "output-income",
    title: "Government Consumption Expenditures and Gross Investment",
    shortLabel: "Government (G)",
    description:
      "Federal, state, and local purchases of goods and services plus government investment. Transfer payments are excluded because they buy nothing directly.",
    units: "Billions of Dollars",
    unitsShort: "Bil. $",
    mult: 1e9,
    freq: "QUARTERLY",
    kind: "LEVEL_CURRENCY",
    sa: "SAAR",
    nominal: true,
    defl: "GDPDEF",
    pop: "B230RC0Q173SBEA",
    agg: "AVG",
  },
  {
    slug: "NETEXP",
    category: "output-income",
    title: "Net Exports of Goods and Services",
    shortLabel: "Net Exports (NX)",
    description:
      "Exports minus imports. It has been negative for the United States since the mid 1970s.",
    units: "Billions of Dollars",
    unitsShort: "Bil. $",
    mult: 1e9,
    freq: "QUARTERLY",
    kind: "LEVEL_CURRENCY",
    sa: "SAAR",
    nominal: true,
    defl: "GDPDEF",
    pop: "B230RC0Q173SBEA",
    agg: "AVG",
    canGrowth: false,
    notes:
      "A series that crosses zero has no meaningful growth rate: the percent change from a value near zero is unbounded, and the sign of the change flips with the sign of the base. Plot it as a share of GDP instead.",
  },
  {
    slug: "EXPGS",
    category: "output-income",
    title: "Exports of Goods and Services",
    shortLabel: "Exports",
    description: "The value of goods and services sold by U.S. residents to the rest of the world.",
    units: "Billions of Dollars",
    unitsShort: "Bil. $",
    mult: 1e9,
    freq: "QUARTERLY",
    kind: "LEVEL_CURRENCY",
    sa: "SAAR",
    nominal: true,
    defl: "GDPDEF",
    pop: "B230RC0Q173SBEA",
    agg: "AVG",
  },
  {
    slug: "IMPGS",
    category: "output-income",
    title: "Imports of Goods and Services",
    shortLabel: "Imports",
    description: "The value of goods and services bought by U.S. residents from the rest of the world.",
    units: "Billions of Dollars",
    unitsShort: "Bil. $",
    mult: 1e9,
    freq: "QUARTERLY",
    kind: "LEVEL_CURRENCY",
    sa: "SAAR",
    nominal: true,
    defl: "GDPDEF",
    pop: "B230RC0Q173SBEA",
    agg: "AVG",
  },
  {
    slug: "GDPPOT",
    category: "output-income",
    title: "Real Potential Gross Domestic Product",
    shortLabel: "Potential Real GDP",
    description:
      "The Congressional Budget Office's estimate of the output the economy can sustain at full employment of labor and capital. The gap between actual and potential output is the output gap.",
    units: "Billions of Chained 2017 Dollars",
    unitsShort: "Bil. 2017 $",
    mult: 1e9,
    freq: "QUARTERLY",
    kind: "LEVEL_CURRENCY",
    sa: "NSA",
    realAlready: true,
    defl: "GDPDEF",
    pop: "B230RC0Q173SBEA",
    agg: "AVG",
  },
];

// ---------------------------------------------------------------------------
// Category `prices-inflation`
// ---------------------------------------------------------------------------

const PRICES_INFLATION: Row[] = [
  {
    slug: "CPIAUCSL",
    category: "prices-inflation",
    title: "Consumer Price Index for All Urban Consumers: All Items",
    shortLabel: "CPI, All Items",
    description:
      "The price of a fixed basket of goods and services bought by urban households, scaled so that its 1982 to 1984 average equals 100. Only ratios between periods are meaningful.",
    units: "Index 1982-1984=100",
    unitsShort: "Index 1982-84=100",
    mult: 1,
    freq: "MONTHLY",
    kind: "INDEX",
    sa: "SA",
    notes:
      "DEFLATOR: the index most households experience directly. Use it for wages, retail sales, and anything measured at consumer prices.",
  },
  {
    slug: "CPILFESL",
    category: "prices-inflation",
    title: "Consumer Price Index for All Urban Consumers: All Items Less Food and Energy",
    shortLabel: "Core CPI",
    description:
      "The CPI with food and energy removed, because those two components are volatile enough to obscure the underlying trend in prices.",
    units: "Index 1982-1984=100",
    unitsShort: "Index 1982-84=100",
    mult: 1,
    freq: "MONTHLY",
    kind: "INDEX",
    sa: "SA",
  },
  {
    slug: "PCEPI",
    category: "prices-inflation",
    title: "Personal Consumption Expenditures: Chain-type Price Index",
    shortLabel: "PCE Price Index",
    description:
      "The price index for household consumption in the national accounts. Its basket updates as spending shifts, so it usually runs a few tenths below the CPI. It is the Federal Reserve's preferred inflation measure.",
    units: "Index 2017=100",
    unitsShort: "Index 2017=100",
    mult: 1,
    freq: "MONTHLY",
    kind: "INDEX",
    sa: "SA",
    notes:
      "DEFLATOR: the Federal Reserve's preferred consumer price measure, with a basket that updates as spending shifts.",
  },
  {
    slug: "PCEPILFE",
    category: "prices-inflation",
    title: "Personal Consumption Expenditures Excluding Food and Energy: Chain-type Price Index",
    shortLabel: "Core PCE Price Index",
    description:
      "The PCE price index without food and energy. This is the series the Federal Open Market Committee's 2 percent target is usually read against.",
    units: "Index 2017=100",
    unitsShort: "Index 2017=100",
    mult: 1,
    freq: "MONTHLY",
    kind: "INDEX",
    sa: "SA",
  },
  {
    slug: "PPIACO",
    category: "prices-inflation",
    title: "Producer Price Index by Commodity: All Commodities",
    shortLabel: "PPI, All Commodities",
    description:
      "Prices received by domestic producers, measured before goods reach the retail counter. It often turns before consumer prices do.",
    units: "Index 1982=100",
    unitsShort: "Index 1982=100",
    mult: 1,
    freq: "MONTHLY",
    kind: "INDEX",
    sa: "NSA",
  },
  {
    slug: "T10YIE",
    category: "prices-inflation",
    title: "10-Year Breakeven Inflation Rate",
    shortLabel: "10-Yr Breakeven Inflation",
    description:
      "The gap between the yield on a nominal ten-year Treasury and an inflation-indexed one. It is what bond markets need inflation to average over ten years for the two to pay the same.",
    units: "Percent",
    unitsShort: "Percent",
    mult: 1,
    freq: "DAILY",
    kind: "RATE_PERCENT",
    sa: "NSA",
  },
];

// ---------------------------------------------------------------------------
// Category `labor-market`
// ---------------------------------------------------------------------------

const LABOR_MARKET: Row[] = [
  {
    slug: "UNRATE",
    category: "labor-market",
    title: "Unemployment Rate",
    shortLabel: "Unemployment Rate",
    description:
      "The share of the labor force without a job and actively looking for one. Its denominator counts only people who say they are looking, which is why it can fall for two very different reasons.",
    units: "Percent",
    unitsShort: "Percent",
    mult: 1,
    freq: "MONTHLY",
    kind: "RATE_PERCENT",
    sa: "SA",
  },
  {
    slug: "PAYEMS",
    category: "labor-market",
    title: "All Employees, Total Nonfarm",
    shortLabel: "Nonfarm Payrolls",
    description:
      "The count of jobs on employer payrolls outside agriculture. It comes from a survey of establishments rather than households, so it counts jobs, not people.",
    units: "Thousands of Persons",
    unitsShort: "Thous. persons",
    mult: 1e3,
    freq: "MONTHLY",
    kind: "LEVEL_COUNT",
    sa: "SA",
    pop: "POPTHM",
  },
  {
    slug: "CIVPART",
    category: "labor-market",
    title: "Labor Force Participation Rate",
    shortLabel: "Labor Force Participation",
    description:
      "The share of the civilian noninstitutional population aged 16 and over that is either working or looking for work.",
    units: "Percent",
    unitsShort: "Percent",
    mult: 1,
    freq: "MONTHLY",
    kind: "RATE_PERCENT",
    sa: "SA",
  },
  {
    slug: "EMRATIO",
    category: "labor-market",
    title: "Employment-Population Ratio",
    shortLabel: "Employment-Population Ratio",
    description:
      "The share of the civilian noninstitutional population that is employed. Its denominator is the whole population, so unlike the unemployment rate it does not depend on whether non-workers say they are looking.",
    units: "Percent",
    unitsShort: "Percent",
    mult: 1,
    freq: "MONTHLY",
    kind: "RATE_PERCENT",
    sa: "SA",
  },
  {
    slug: "UNEMPLOY",
    category: "labor-market",
    title: "Unemployment Level",
    shortLabel: "Unemployment Level",
    description:
      "The count of people without a job who are available for work and have looked in the past four weeks.",
    units: "Thousands of Persons",
    unitsShort: "Thous. persons",
    mult: 1e3,
    freq: "MONTHLY",
    kind: "LEVEL_COUNT",
    sa: "SA",
    pop: "POPTHM",
  },
  {
    slug: "CLF16OV",
    category: "labor-market",
    title: "Civilian Labor Force Level",
    shortLabel: "Civilian Labor Force",
    description:
      "Everyone aged 16 and over who is either employed or unemployed and looking. It is the denominator of the unemployment rate.",
    units: "Thousands of Persons",
    unitsShort: "Thous. persons",
    mult: 1e3,
    freq: "MONTHLY",
    kind: "LEVEL_COUNT",
    sa: "SA",
    pop: "POPTHM",
  },
  {
    slug: "ICSA",
    category: "labor-market",
    title: "Initial Claims",
    shortLabel: "Initial Claims",
    description:
      "New filings for unemployment insurance in a week. It is the highest-frequency labor market series published and turns faster than anything monthly.",
    units: "Number",
    unitsShort: "Claims",
    mult: 1,
    freq: "WEEKLY",
    kind: "LEVEL_COUNT",
    sa: "SA",
    pop: "POPTHM",
  },
  {
    slug: "JTSJOL",
    category: "labor-market",
    title: "Job Openings: Total Nonfarm",
    shortLabel: "Job Openings",
    description:
      "Positions employers are actively trying to fill on the last business day of the month, from the JOLTS survey.",
    units: "Thousands",
    unitsShort: "Thousands",
    mult: 1e3,
    freq: "MONTHLY",
    kind: "LEVEL_COUNT",
    sa: "SA",
    pop: "POPTHM",
  },
  {
    slug: "AHETPI",
    category: "labor-market",
    title:
      "Average Hourly Earnings of Production and Nonsupervisory Employees, Total Private",
    shortLabel: "Avg Hourly Earnings, Prod.",
    description:
      "The average hourly wage of production and nonsupervisory workers, in the dollars of the period paid. Deflate it to see whether pay actually bought more.",
    units: "Dollars per Hour",
    unitsShort: "$/hour",
    mult: 1,
    freq: "MONTHLY",
    kind: "LEVEL_CURRENCY",
    sa: "SA",
    nominal: true,
    defl: "CPIAUCSL",
  },
  {
    slug: "NROU",
    category: "labor-market",
    title: "Noncyclical Rate of Unemployment",
    shortLabel: "Natural Rate of Unemployment",
    description:
      "The Congressional Budget Office's estimate of the unemployment rate consistent with stable inflation. The gap between the actual rate and this one is the cyclical part.",
    units: "Percent",
    unitsShort: "Percent",
    mult: 1,
    freq: "QUARTERLY",
    kind: "RATE_PERCENT",
    sa: "NSA",
  },
];

// ---------------------------------------------------------------------------
// Category `money-rates`
// ---------------------------------------------------------------------------

const MONEY_RATES: Row[] = [
  {
    slug: "FEDFUNDS",
    category: "money-rates",
    title: "Federal Funds Effective Rate",
    shortLabel: "Fed Funds Rate",
    description:
      "The rate banks actually charge each other for overnight reserves. It is the instrument the Federal Reserve moves, and the anchor of every other short rate.",
    units: "Percent",
    unitsShort: "Percent",
    mult: 1,
    freq: "MONTHLY",
    kind: "RATE_PERCENT",
    sa: "NSA",
  },
  {
    slug: "GS10",
    category: "money-rates",
    title: "Market Yield on U.S. Treasury Securities at 10-Year Constant Maturity",
    shortLabel: "10-Year Treasury",
    description:
      "The benchmark long-term risk-free rate. Mortgage rates and corporate borrowing costs are priced off it.",
    units: "Percent",
    unitsShort: "Percent",
    mult: 1,
    freq: "MONTHLY",
    kind: "RATE_PERCENT",
    sa: "NSA",
  },
  {
    slug: "GS2",
    category: "money-rates",
    title: "Market Yield on U.S. Treasury Securities at 2-Year Constant Maturity",
    shortLabel: "2-Year Treasury",
    description:
      "A short maturity that tracks where markets expect policy to be over the next two years. Plotted against the ten year it gives the most watched slope of the yield curve.",
    units: "Percent",
    unitsShort: "Percent",
    mult: 1,
    freq: "MONTHLY",
    kind: "RATE_PERCENT",
    sa: "NSA",
  },
  {
    slug: "TB3MS",
    category: "money-rates",
    title: "3-Month Treasury Bill Secondary Market Rate",
    shortLabel: "3-Month T-Bill",
    description:
      "The shortest widely quoted government rate, and the usual empirical stand-in for the risk-free rate in academic work.",
    units: "Percent",
    unitsShort: "Percent",
    mult: 1,
    freq: "MONTHLY",
    kind: "RATE_PERCENT",
    sa: "NSA",
  },
  {
    slug: "MORTGAGE30US",
    category: "money-rates",
    title: "30-Year Fixed Rate Mortgage Average in the United States",
    shortLabel: "30-Yr Mortgage Rate",
    description:
      "The average rate quoted on a conventional thirty-year fixed mortgage. It is the price at which monetary policy reaches most households.",
    units: "Percent",
    unitsShort: "Percent",
    mult: 1,
    freq: "WEEKLY",
    kind: "RATE_PERCENT",
    sa: "NSA",
  },
  {
    slug: "BAA",
    category: "money-rates",
    title: "Moody's Seasoned Baa Corporate Bond Yield",
    shortLabel: "Baa Corporate Yield",
    description:
      "The yield on the lowest tier of investment-grade corporate debt. Its spread over Treasuries is a standard gauge of credit stress.",
    units: "Percent",
    unitsShort: "Percent",
    mult: 1,
    freq: "MONTHLY",
    kind: "RATE_PERCENT",
    sa: "NSA",
  },
  {
    slug: "M1SL",
    category: "money-rates",
    title: "M1 Money Stock",
    shortLabel: "M1 Money Stock",
    description:
      "Currency in circulation plus checkable and other liquid deposits. Its definition changed in May 2020, which produces a step in the level.",
    units: "Billions of Dollars",
    unitsShort: "Bil. $",
    mult: 1e9,
    freq: "MONTHLY",
    kind: "LEVEL_CURRENCY",
    sa: "SA",
    nominal: true,
    defl: "CPIAUCSL",
    pop: "POPTHM",
  },
  {
    slug: "M2SL",
    category: "money-rates",
    title: "M2 Money Stock",
    shortLabel: "M2 Money Stock",
    description:
      "M1 plus savings deposits, small time deposits, and retail money market funds. The broader of the two aggregates the Federal Reserve still publishes.",
    units: "Billions of Dollars",
    unitsShort: "Bil. $",
    mult: 1e9,
    freq: "MONTHLY",
    kind: "LEVEL_CURRENCY",
    sa: "SA",
    nominal: true,
    defl: "CPIAUCSL",
    pop: "POPTHM",
  },
  {
    slug: "BOGMBASE",
    category: "money-rates",
    title: "Monetary Base: Total",
    shortLabel: "Monetary Base",
    description:
      "Currency in circulation plus reserve balances held at the Federal Reserve. This is the quantity the central bank controls directly.",
    units: "Millions of Dollars",
    unitsShort: "Mil. $",
    mult: 1e6,
    freq: "MONTHLY",
    kind: "LEVEL_CURRENCY",
    sa: "NSA",
    nominal: true,
    defl: "CPIAUCSL",
    pop: "POPTHM",
  },
];

// ---------------------------------------------------------------------------
// Category `government-finance`
// ---------------------------------------------------------------------------

const GOVERNMENT_FINANCE: Row[] = [
  {
    slug: "FGRECPT",
    category: "government-finance",
    title: "Federal Government Current Receipts",
    shortLabel: "Federal Receipts",
    description:
      "Everything the federal government takes in: income taxes, payroll taxes, corporate taxes, and other receipts, on a national accounts basis.",
    units: "Billions of Dollars",
    unitsShort: "Bil. $",
    mult: 1e9,
    freq: "QUARTERLY",
    kind: "LEVEL_CURRENCY",
    sa: "SAAR",
    nominal: true,
    defl: "GDPDEF",
    pop: "B230RC0Q173SBEA",
    agg: "AVG",
  },
  {
    slug: "FGEXPND",
    category: "government-finance",
    title: "Federal Government Current Expenditures",
    shortLabel: "Federal Expenditures",
    description:
      "Everything the federal government spends, including transfers and interest. Plotted against receipts, the gap is the deficit.",
    units: "Billions of Dollars",
    unitsShort: "Bil. $",
    mult: 1e9,
    freq: "QUARTERLY",
    kind: "LEVEL_CURRENCY",
    sa: "SAAR",
    nominal: true,
    defl: "GDPDEF",
    pop: "B230RC0Q173SBEA",
    agg: "AVG",
  },
  {
    slug: "GFDEBTN",
    category: "government-finance",
    title: "Federal Debt: Total Public Debt",
    shortLabel: "Federal Debt, Total",
    description:
      "The total outstanding stock of federal debt at the close of the quarter. It is a stock, not a flow, so it is measured at the end of the period rather than averaged across it.",
    units: "Millions of Dollars",
    unitsShort: "Mil. $",
    mult: 1e6,
    freq: "QUARTERLY",
    kind: "LEVEL_CURRENCY",
    sa: "NSA",
    nominal: true,
    defl: "GDPDEF",
    pop: "B230RC0Q173SBEA",
    agg: "EOP",
  },
  {
    slug: "GFDEGDQ188S",
    category: "government-finance",
    title: "Federal Debt: Total Public Debt as Percent of Gross Domestic Product",
    shortLabel: "Federal Debt as % of GDP",
    description:
      "The debt stock divided by annualized GDP. It compares the obligation to the income available to service it, which the level alone cannot do.",
    units: "Percent of GDP",
    unitsShort: "Percent of GDP",
    mult: 1,
    freq: "QUARTERLY",
    kind: "RATE_PERCENT",
    sa: "SA",
    agg: "AVG",
  },
  {
    slug: "A091RC1Q027SBEA",
    category: "government-finance",
    title: "Federal Government: Interest Payments",
    shortLabel: "Federal Interest Payments",
    description:
      "What the federal government pays to service its debt. It rises with both the debt stock and the interest rate on it.",
    units: "Billions of Dollars",
    unitsShort: "Bil. $",
    mult: 1e9,
    freq: "QUARTERLY",
    kind: "LEVEL_CURRENCY",
    sa: "SAAR",
    nominal: true,
    defl: "GDPDEF",
    pop: "B230RC0Q173SBEA",
    agg: "AVG",
  },
];

// ---------------------------------------------------------------------------
// Category `international`
// ---------------------------------------------------------------------------

const INTERNATIONAL: Row[] = [
  {
    slug: "BOPGSTB",
    category: "international",
    title: "Trade Balance: Goods and Services, Balance of Payments Basis",
    shortLabel: "Trade Balance",
    description:
      "Monthly exports minus imports of goods and services. Like net exports it crosses zero, so read it as a share of GDP rather than as a growth rate.",
    units: "Millions of Dollars",
    unitsShort: "Mil. $",
    mult: 1e6,
    freq: "MONTHLY",
    kind: "LEVEL_CURRENCY",
    sa: "SA",
    nominal: true,
    defl: "CPIAUCSL",
    pop: "POPTHM",
    canGrowth: false,
    notes:
      "A series that crosses zero has no meaningful growth rate. Plot it as a share of GDP instead.",
  },
  {
    slug: "EXUSEU",
    category: "international",
    title: "U.S. Dollars to Euro Spot Exchange Rate",
    shortLabel: "USD per Euro",
    description:
      "How many U.S. dollars one euro buys. A rise means the dollar has weakened against the euro.",
    units: "U.S. Dollars to One Euro",
    unitsShort: "$ per €",
    mult: 1,
    freq: "MONTHLY",
    kind: "RATIO",
    sa: "NSA",
  },
  {
    slug: "DTWEXBGS",
    category: "international",
    title: "Nominal Broad U.S. Dollar Index",
    shortLabel: "Broad Dollar Index",
    description:
      "The dollar against a trade-weighted basket of foreign currencies. It answers what a single bilateral rate cannot: whether the dollar moved, or the other currency did.",
    units: "Index Jan 2006=100",
    unitsShort: "Index 2006=100",
    mult: 1,
    freq: "DAILY",
    kind: "INDEX",
    sa: "NSA",
  },
];

// ---------------------------------------------------------------------------
// Category `housing`
// ---------------------------------------------------------------------------

const HOUSING: Row[] = [
  {
    slug: "HOUST",
    category: "housing",
    title: "New Privately-Owned Housing Units Started: Total Units",
    shortLabel: "Housing Starts",
    description:
      "Residential construction begun in a month, at an annual rate. Housing turns down early in a cycle and is one of the most reliable leading indicators.",
    units: "Thousands of Units",
    unitsShort: "Thous. units",
    mult: 1e3,
    freq: "MONTHLY",
    kind: "LEVEL_COUNT",
    sa: "SAAR",
    pop: "POPTHM",
  },
  {
    slug: "PERMIT",
    category: "housing",
    title: "New Privately-Owned Housing Units Authorized in Permit-Issuing Places: Total Units",
    shortLabel: "Building Permits",
    description:
      "Permits issued for new residential construction. Permits precede starts, so this leads housing starts by roughly a month.",
    units: "Thousands of Units",
    unitsShort: "Thous. units",
    mult: 1e3,
    freq: "MONTHLY",
    kind: "LEVEL_COUNT",
    sa: "SAAR",
    pop: "POPTHM",
  },
  {
    slug: "CSUSHPINSA",
    category: "housing",
    title: "S&P CoreLogic Case-Shiller U.S. National Home Price Index",
    shortLabel: "Case-Shiller Home Prices",
    description:
      "A repeat-sales index of single-family house prices, so it compares the same houses over time rather than whatever happened to sell this month.",
    units: "Index Jan 2000=100",
    unitsShort: "Index 2000=100",
    mult: 1,
    freq: "MONTHLY",
    kind: "INDEX",
    sa: "NSA",
  },
  {
    slug: "MSPUS",
    category: "housing",
    title: "Median Sales Price of Houses Sold for the United States",
    shortLabel: "Median Home Sale Price",
    description:
      "The middle price among houses that sold in the quarter. It shifts with the mix of what sold, which is why the repeat-sales index is the better price measure.",
    units: "Dollars",
    unitsShort: "$",
    mult: 1,
    freq: "QUARTERLY",
    kind: "LEVEL_CURRENCY",
    sa: "NSA",
    nominal: true,
    defl: "CPIAUCSL",
    agg: "AVG",
  },
];

// ---------------------------------------------------------------------------
// Category `productivity-costs`
// ---------------------------------------------------------------------------

const PRODUCTIVITY_COSTS: Row[] = [
  {
    slug: "OPHNFB",
    category: "productivity-costs",
    title: "Nonfarm Business Sector: Labor Productivity (Output per Hour)",
    shortLabel: "Output per Hour",
    description:
      "Real output divided by hours worked in the nonfarm business sector. Over long horizons, its growth rate is what raises living standards.",
    units: "Index 2017=100",
    unitsShort: "Index 2017=100",
    mult: 1,
    freq: "QUARTERLY",
    kind: "INDEX",
    sa: "SA",
  },
  {
    slug: "ULCNFB",
    category: "productivity-costs",
    title: "Nonfarm Business Sector: Unit Labor Costs",
    shortLabel: "Unit Labor Costs",
    description:
      "Labor cost per unit of output: compensation growth minus productivity growth. It is the standard link from wages to price pressure.",
    units: "Index 2017=100",
    unitsShort: "Index 2017=100",
    mult: 1,
    freq: "QUARTERLY",
    kind: "INDEX",
    sa: "SA",
  },
  {
    slug: "COMPRNFB",
    category: "productivity-costs",
    title: "Nonfarm Business Sector: Real Hourly Compensation",
    shortLabel: "Real Hourly Compensation",
    description:
      "Hourly pay including benefits, already deflated. Compare its path to output per hour to see whether pay tracked productivity.",
    units: "Index 2017=100",
    unitsShort: "Index 2017=100",
    mult: 1,
    freq: "QUARTERLY",
    kind: "INDEX",
    sa: "SA",
  },
];

// ---------------------------------------------------------------------------
// Category `consumer-business`
// ---------------------------------------------------------------------------

const CONSUMER_BUSINESS: Row[] = [
  {
    slug: "INDPRO",
    category: "consumer-business",
    title: "Industrial Production: Total Index",
    shortLabel: "Industrial Production",
    description:
      "Physical output of manufacturing, mining, and utilities. It measures quantities directly, so no deflation is needed to read it.",
    units: "Index 2017=100",
    unitsShort: "Index 2017=100",
    mult: 1,
    freq: "MONTHLY",
    kind: "INDEX",
    sa: "SA",
  },
  {
    slug: "TCU",
    category: "consumer-business",
    title: "Capacity Utilization: Total Index",
    shortLabel: "Capacity Utilization",
    description:
      "The share of industrial capacity actually in use. Sustained high readings have historically preceded price pressure in goods.",
    units: "Percent of Capacity",
    unitsShort: "Percent",
    mult: 1,
    freq: "MONTHLY",
    kind: "RATE_PERCENT",
    sa: "SA",
  },
  {
    slug: "RSAFS",
    category: "consumer-business",
    title: "Advance Retail Sales: Retail Trade and Food Services",
    shortLabel: "Retail Sales",
    description:
      "Monthly sales at retailers and food service establishments, in current dollars. Deflate it before concluding that people bought more.",
    units: "Millions of Dollars",
    unitsShort: "Mil. $",
    mult: 1e6,
    freq: "MONTHLY",
    kind: "LEVEL_CURRENCY",
    sa: "SA",
    nominal: true,
    defl: "CPIAUCSL",
    pop: "POPTHM",
  },
  {
    slug: "UMCSENT",
    category: "consumer-business",
    title: "University of Michigan: Consumer Sentiment",
    shortLabel: "Consumer Sentiment",
    description:
      "A survey index of how households feel about their finances and the economy. It is an opinion series, not a quantity, so treat its level with care.",
    units: "Index 1966:Q1=100",
    unitsShort: "Index 1966Q1=100",
    mult: 1,
    freq: "MONTHLY",
    kind: "INDEX",
    sa: "NSA",
  },
  {
    slug: "DSPI",
    category: "consumer-business",
    title: "Disposable Personal Income",
    shortLabel: "Disposable Personal Income",
    description:
      "Household income after taxes, in current dollars. It is the budget constraint consumption is spent out of.",
    units: "Billions of Dollars",
    unitsShort: "Bil. $",
    mult: 1e9,
    freq: "MONTHLY",
    kind: "LEVEL_CURRENCY",
    sa: "SAAR",
    nominal: true,
    defl: "CPIAUCSL",
    pop: "POPTHM",
  },
  {
    slug: "PSAVERT",
    category: "consumer-business",
    title: "Personal Saving Rate",
    shortLabel: "Personal Saving Rate",
    description:
      "Personal saving as a share of disposable personal income. It is already a ratio, so it needs no denominator of its own.",
    units: "Percent",
    unitsShort: "Percent",
    mult: 1,
    freq: "MONTHLY",
    kind: "RATE_PERCENT",
    sa: "SA",
  },
  {
    slug: "TOTALSA",
    category: "consumer-business",
    title: "Total Vehicle Sales",
    shortLabel: "Total Vehicle Sales",
    description:
      "Cars and light trucks sold, at an annual rate. A big-ticket durable purchase, and therefore one of the first things households postpone.",
    units: "Millions of Units",
    unitsShort: "Mil. units",
    mult: 1e6,
    freq: "MONTHLY",
    kind: "LEVEL_COUNT",
    sa: "SAAR",
    pop: "POPTHM",
  },
];

// ---------------------------------------------------------------------------
// Category `population-denominators`
// ---------------------------------------------------------------------------

const POPULATION_DENOMINATORS: Row[] = [
  {
    slug: "POPTHM",
    category: "population-denominators",
    title: "Population",
    shortLabel: "Population, Monthly",
    description:
      "Total U.S. population including armed forces overseas, monthly. This is the default denominator for per capita transforms at monthly frequency or finer.",
    units: "Thousands",
    unitsShort: "Thousands",
    mult: 1e3,
    freq: "MONTHLY",
    kind: "LEVEL_COUNT",
    sa: "NSA",
    notes:
      "POPULATION: the default per capita denominator at monthly frequency or finer. Persons per person is not a quantity, so this series cannot itself be put on a per capita basis.",
  },
  {
    slug: "CNP16OV",
    category: "population-denominators",
    title: "Population Level: Civilian Noninstitutional Population",
    shortLabel: "Civilian Noninst. Population",
    description:
      "People aged 16 and over who are not in the armed forces or an institution. It is the denominator of the participation rate and the employment-population ratio.",
    units: "Thousands of Persons",
    unitsShort: "Thous. persons",
    mult: 1e3,
    freq: "MONTHLY",
    kind: "LEVEL_COUNT",
    sa: "NSA",
    notes:
      "POPULATION: the labor market's own denominator. Use it when the numerator is a labor market count.",
  },
  {
    slug: "B230RC0Q173SBEA",
    category: "population-denominators",
    title: "Population (Midperiod)",
    shortLabel: "Population, Quarterly",
    description:
      "Midperiod population on the national accounts basis, quarterly. This is the default denominator for per capita transforms of quarterly series such as GDP.",
    units: "Thousands",
    unitsShort: "Thousands",
    mult: 1e3,
    freq: "QUARTERLY",
    kind: "LEVEL_COUNT",
    sa: "NSA",
    notes:
      "POPULATION: the default per capita denominator at quarterly frequency, on the same national accounts basis as GDP.",
  },
  {
    slug: "USREC",
    category: "population-denominators",
    title: "NBER Based Recession Indicators for the United States",
    shortLabel: "NBER Recession Indicator",
    description:
      "One during a month the NBER dates as a recession, zero otherwise. It is used only for the shaded bands behind a chart and never appears in the catalog.",
    units: "+1 or 0",
    unitsShort: "0 or 1",
    mult: 1,
    freq: "MONTHLY",
    kind: "FLAG",
    sa: "NSA",
    isPublic: false,
    notes:
      "Recession shading only. Never listed in the catalog tree; fetch it directly by slug.",
  },
];

// ---------------------------------------------------------------------------
// Section 7.3, Dr. Dash constructed series. The compute functions live in
// src/lib/series/computed.ts; this is only their catalog metadata.
// ---------------------------------------------------------------------------

const CONSTRUCTED: Row[] = [
  {
    slug: "DD_INFL_CPI",
    category: "dr-dash-constructed",
    title: "CPI Inflation Rate (Dr. Dash)",
    shortLabel: "CPI Inflation Rate",
    description:
      "The year-over-year percent change in the CPI, published as a series in its own right. No government database reports headline inflation as a series; it reports the index and leaves the growth rate to you.",
    units: "Percent",
    unitsShort: "Percent",
    mult: 1,
    freq: "MONTHLY",
    kind: "RATE_PERCENT",
    sa: "SA",
    constructed: true,
  },
  {
    slug: "DD_MISERY",
    category: "dr-dash-constructed",
    title: "Misery Index (Dr. Dash)",
    shortLabel: "Misery Index",
    description:
      "The unemployment rate plus the CPI inflation rate. Two rates that hurt households, added together because both can be bad at once.",
    units: "Percent",
    unitsShort: "Percent",
    mult: 1,
    freq: "MONTHLY",
    kind: "RATE_PERCENT",
    sa: "SA",
    constructed: true,
  },
  {
    slug: "DD_REAL_FFR",
    category: "dr-dash-constructed",
    title: "Real Federal Funds Rate (Dr. Dash)",
    shortLabel: "Real Fed Funds Rate",
    description:
      "The federal funds rate minus CPI inflation. A nominal policy rate says little on its own; what borrowers and lenders respond to is the rate net of inflation.",
    units: "Percent",
    unitsShort: "Percent",
    mult: 1,
    freq: "MONTHLY",
    kind: "RATE_PERCENT",
    sa: "SA",
    constructed: true,
  },
  {
    slug: "DD_OUTPUT_GAP",
    category: "dr-dash-constructed",
    title: "Output Gap (Dr. Dash)",
    shortLabel: "Output Gap",
    description:
      "Real GDP minus potential real GDP, as a percent of potential. Negative means the economy is producing less than it could sustain.",
    units: "Percent of Potential GDP",
    unitsShort: "Percent",
    mult: 1,
    freq: "QUARTERLY",
    kind: "RATE_PERCENT",
    sa: "SAAR",
    canGrowth: false,
    constructed: true,
    notes:
      "The gap already crosses zero by construction, so a growth rate of it has no stable meaning.",
  },
];

const ROWS: Row[] = [
  ...OUTPUT_INCOME,
  ...PRICES_INFLATION,
  ...LABOR_MARKET,
  ...MONEY_RATES,
  ...GOVERNMENT_FINANCE,
  ...INTERNATIONAL,
  ...HOUSING,
  ...PRODUCTIVITY_COSTS,
  ...CONSUMER_BUSINESS,
  ...POPULATION_DENOMINATORS,
  ...CONSTRUCTED,
];

export const SEED_SERIES: SeedSeries[] = ROWS.map(toSeedSeries);

export const SEED_SERIES_BY_SLUG: ReadonlyMap<string, SeedSeries> = new Map(
  SEED_SERIES.map((s) => [s.slug, s]),
);

/** Section 7.2: the three selectable deflators are marked with a `DEFLATOR:` note. */
export const DEFLATOR_SLUGS = SEED_SERIES.filter((s) => s.notes?.startsWith("DEFLATOR:")).map(
  (s) => s.slug,
);

/** Section 6.5.3: the per capita options are the series marked `POPULATION:`. */
export const POPULATION_SLUGS = SEED_SERIES.filter((s) => s.notes?.startsWith("POPULATION:")).map(
  (s) => s.slug,
);

/** Any seeded price index may be pointed at as a deflator by a series row. */
const DEFLATOR_TARGETS = new Set(ROWS.filter((r) => r.kind === "INDEX").map((r) => r.slug));
/** Only the `POPULATION:` series may be a default population. */
const POPULATION_TARGETS = new Set(
  ROWS.filter((r) => r.notes?.startsWith("POPULATION:")).map((r) => r.slug),
);

/**
 * Section 5.2 tells us to write the invariants as assertions in this file, so a
 * bad row cannot even be imported, let alone written to the database.
 */
export function assertSeedInvariants(): void {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const s of SEED_SERIES) {
    if (seen.has(s.slug)) problems.push(`${s.slug}: duplicate slug`);
    seen.add(s.slug);

    if (!CATEGORY_SLUGS.includes(s.categorySlug)) {
      problems.push(`${s.slug}: unknown category ${s.categorySlug}`);
    }
    for (const v of checkSeriesInvariants(s)) {
      problems.push(`${v.slug}: Section 5.2 rule ${v.rule}: ${v.message}`);
    }
    if (s.defaultDeflator !== null && !DEFLATOR_TARGETS.has(s.defaultDeflator)) {
      problems.push(`${s.slug}: defaultDeflator ${s.defaultDeflator} is not a seeded index series`);
    }
    if (s.defaultPopulation !== null && !POPULATION_TARGETS.has(s.defaultPopulation)) {
      problems.push(
        `${s.slug}: defaultPopulation ${s.defaultPopulation} is not a seeded population series`,
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(`prisma/seed/series.ts violates Section 5.2:\n  ${problems.join("\n  ")}`);
  }
}

assertSeedInvariants();
