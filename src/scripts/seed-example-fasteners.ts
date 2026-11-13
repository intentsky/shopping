// apps/medusa/src/scripts/seed.ts
// Medusa seed script — creates regions, product categories, and seed products.
//
// Run with:
//   bun run seed
//   (which executes: medusa exec ./src/scripts/seed.ts)
//
// This script is idempotent — running it multiple times will not create
// duplicate records. It checks for existing records before creating new ones.
//
// What it creates:
//   Phase 3.2 — 5 Regions:
//     CN  (China, CNY)
//     EU  (Europe shared, EUR)
//     DE  (Germany, EUR explicit)
//     US  (Americas, USD)
//     INTL (International fallback, USD)
//
//   Phase 3.3 — 5 Product Categories:
//     bolts, nuts, screws, washers, wrenches
//
//   Phase 3.3 — ~20 Seed Products (4 per category):
//     Bolts:   Hexagon Head Bolts, Carriage Bolts, Anchor Bolts, U-Bolts
//     Nuts:    Hexagon Nuts, Nylon Lock Nuts, Flange Nuts, Cap Nuts
//     Screws:  Self-Tapping Screws, Machine Screws, Set Screws, Wood Screws
//     Washers: Flat Washers, Spring Washers, Lock Washers, Square Slant Washers
//     Wrenches:Box End Wrenches, Hex Socket Wrench Set
//
//   Plus 3 CATALOGUE-PRICE products (M8 bolt / nut / washer, boxed) — the
//   only ones with a price, and therefore the only ones /shop lists. See
//   CATALOGUE_PRICE_NOTE at the end of PRODUCT_SEEDS.
//
// Everything else: NO public prices. Price is null for unauthenticated users,
// the storefront renders "price on request", and price lists are created
// manually in admin after quote approval.
//
// Reference: ai/todo.md Phase 3 §3.2, §3.3

import type { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { createProductsWorkflow } from "@medusajs/medusa/core-flows";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RegionSeed {
	name: string;
	currency_code: string;
	countries: string[];
}

interface CategorySeed {
	name: string;
	handle: string;
	description: string;
	metadata?: Record<string, string>;
}

interface VariantPriceSeed {
	/**
	 * Medusa v2 amounts are DECIMAL in the currency's own unit — 12.5 is
	 * $12.50, not 12.5 cents. The storefront converts to cents once, in
	 * `@intentsky/shopping`'s `toCents`.
	 */
	amount: number;
	currency_code: string;
}

interface ProductVariantSeed {
	title: string;
	sku: string;
	inventory_quantity: number;
	manage_inventory: boolean;
	options: Record<string, string>;
	/**
	 * Present only on the catalogue-price products below. A variant with prices
	 * shows up on /shop and can be ordered at the listed price; one without
	 * stays quote-only on /products. Nothing else distinguishes the two.
	 */
	prices?: VariantPriceSeed[];
}

interface ProductSeed {
	title: string;
	handle: string;
	subtitle?: string;
	description: string;
	status: "published" | "draft";
	category_handle: string;
	tags?: string[];
	options: Array<{ title: string; values: string[] }>;
	variants: ProductVariantSeed[];
	metadata?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Region seeds — Phase 3.2
// ---------------------------------------------------------------------------

const REGION_SEEDS: RegionSeed[] = [
	{
		name: "China",
		currency_code: "cny",
		countries: ["cn"],
	},
	{
		name: "Europe",
		currency_code: "eur",
		countries: [
			"at",
			"be",
			"bg",
			"hr",
			"cy",
			"cz",
			"dk",
			"ee",
			"fi",
			"fr",
			"gr",
			"hu",
			"ie",
			"lv",
			"lt",
			"lu",
			"mt",
			"nl",
			"pl",
			"pt",
			"ro",
			"sk",
			"si",
			"es",
			"se",
		],
	},
	{
		name: "Germany",
		currency_code: "eur",
		countries: ["de"],
	},
	{
		name: "Americas",
		currency_code: "usd",
		countries: ["us", "ca", "mx", "br", "ar", "cl", "co", "pe", "ve"],
	},
	{
		name: "International",
		currency_code: "usd",
		// All remaining countries fall into this region
		countries: [
			"au",
			"nz",
			"jp",
			"kr",
			"sg",
			"my",
			"th",
			"vn",
			"in",
			"za",
			"ng",
			"eg",
			"sa",
			"ae",
			"tr",
			"ua",
			"ru",
			"gb",
			"ch",
			"no",
			"is",
			"il",
			"pk",
			"bd",
			"id",
			"ph",
		],
	},
];

// ---------------------------------------------------------------------------
// Category seeds — Phase 3.3
// ---------------------------------------------------------------------------

const CATEGORY_SEEDS: CategorySeed[] = [
	{
		name: "Bolts",
		handle: "bolts",
		description:
			"High-strength hexagon head bolts, carriage bolts, anchor bolts, and U-bolts to DIN, ISO, and ASTM standards. Available M4–M48, property classes 4.8 through 12.9.",
		metadata: {
			icon: "🔩",
			color: "#6366f1",
		},
	},
	{
		name: "Nuts",
		handle: "nuts",
		description:
			"Full range of metric hexagon nuts, nylon insert lock nuts, flange nuts, and cap nuts. DIN 934, DIN 985, DIN 6923, and DIN 1587 specifications.",
		metadata: {
			icon: "⚙️",
			color: "#f59e0b",
		},
	},
	{
		name: "Screws",
		handle: "screws",
		description:
			"Self-tapping screws, machine screws, socket set screws, and wood screws. Pozidriv, Torx, and hex drive options across full metric range.",
		metadata: {
			icon: "🪛",
			color: "#10b981",
		},
	},
	{
		name: "Washers",
		handle: "washers",
		description:
			"Flat washers, spring (lock) washers, internal tooth lock washers, and square slant washers. DIN 125, DIN 127, DIN 128, and DIN 434.",
		metadata: {
			icon: "🔘",
			color: "#0ea5e9",
		},
	},
	{
		name: "Wrenches",
		handle: "wrenches",
		description:
			"Professional-grade box end wrenches and hexagon socket (Allen) key sets. Chrome-vanadium steel, metric sizes 4–32 mm.",
		metadata: {
			icon: "🔧",
			color: "#ef4444",
		},
	},
];

// ---------------------------------------------------------------------------
// Product seeds — Phase 3.3
// ---------------------------------------------------------------------------

const PRODUCT_SEEDS: ProductSeed[] = [
	// ── Bolts ──────────────────────────────────────────────────────────────────

	{
		title: "Hexagon Head Bolts — DIN 931/933",
		handle: "hex-bolt-m10-din933",
		subtitle: "M4–M36 | Property Class 8.8 | Zinc Plated",
		description:
			"High-quality hexagon head bolts manufactured to DIN 931 (partial thread) and DIN 933 (full thread) specifications. Carbon steel, property class 8.8, bright zinc-plated finish. Available in full-thread and partial-thread variants across M4–M36 diameter range. Also available in property classes 4.8, 10.9, and 12.9; contact us for pricing on stainless A2/A4 and hot-dip galvanised.",
		status: "published",
		category_handle: "bolts",
		tags: ["DIN 931", "DIN 933", "ISO 4014", "ISO 4017", "hex bolt", "8.8"],
		options: [
			{
				title: "Size",
				values: [
					"M4",
					"M5",
					"M6",
					"M8",
					"M10",
					"M12",
					"M16",
					"M20",
					"M24",
					"M30",
					"M36",
				],
			},
			{
				title: "Length",
				values: [
					"20mm",
					"25mm",
					"30mm",
					"40mm",
					"50mm",
					"60mm",
					"80mm",
					"100mm",
					"120mm",
					"150mm",
					"200mm",
				],
			},
			{
				title: "Finish",
				values: [
					"Zinc Plated",
					"Hot-Dip Galvanised",
					"Stainless A2",
					"Stainless A4",
					"Plain",
				],
			},
		],
		variants: [
			{
				title: "M10 × 50mm — Zinc Plated",
				sku: "HB-DIN933-M10-50-ZP",
				inventory_quantity: 50000,
				manage_inventory: false,
				options: { Size: "M10", Length: "50mm", Finish: "Zinc Plated" },
			},
			{
				title: "M12 × 60mm — Zinc Plated",
				sku: "HB-DIN933-M12-60-ZP",
				inventory_quantity: 50000,
				manage_inventory: false,
				options: { Size: "M12", Length: "60mm", Finish: "Zinc Plated" },
			},
			{
				title: "M16 × 80mm — Hot-Dip Galvanised",
				sku: "HB-DIN931-M16-80-HDG",
				inventory_quantity: 50000,
				manage_inventory: false,
				options: { Size: "M16", Length: "80mm", Finish: "Hot-Dip Galvanised" },
			},
		],
		metadata: {
			standard: "DIN 931 / DIN 933 / ISO 4014 / ISO 4017",
			grade: "4.8, 8.8, 10.9, 12.9",
			material: "Carbon steel, Stainless A2, Stainless A4",
			size_range: "M4–M36",
			moq: "100 pcs",
		},
	},

	{
		title: "Carriage Bolts — DIN 603",
		handle: "carriage-bolt-din603-m10",
		subtitle: "M6–M20 | Property Class 4.6 | Zinc Plated",
		description:
			"Round-head square-neck carriage bolts to DIN 603 specification. The square neck locks into timber or square-punched holes to prevent rotation during tightening. Ideal for timber frame construction, playground equipment, and agricultural machinery. Full-thread design.",
		status: "published",
		category_handle: "bolts",
		tags: ["DIN 603", "carriage bolt", "round head", "timber bolt"],
		options: [
			{
				title: "Size",
				values: ["M6", "M8", "M10", "M12", "M16", "M20"],
			},
			{
				title: "Length",
				values: [
					"30mm",
					"40mm",
					"50mm",
					"60mm",
					"80mm",
					"100mm",
					"120mm",
					"150mm",
					"200mm",
				],
			},
			{
				title: "Finish",
				values: ["Zinc Plated", "Hot-Dip Galvanised", "Plain"],
			},
		],
		variants: [
			{
				title: "M10 × 60mm — Zinc Plated",
				sku: "CB-DIN603-M10-60-ZP",
				inventory_quantity: 50000,
				manage_inventory: false,
				options: { Size: "M10", Length: "60mm", Finish: "Zinc Plated" },
			},
			{
				title: "M12 × 80mm — Hot-Dip Galvanised",
				sku: "CB-DIN603-M12-80-HDG",
				inventory_quantity: 50000,
				manage_inventory: false,
				options: { Size: "M12", Length: "80mm", Finish: "Hot-Dip Galvanised" },
			},
		],
		metadata: {
			standard: "DIN 603",
			grade: "4.6",
			material: "Carbon steel",
			size_range: "M6–M20",
			moq: "100 pcs",
		},
	},

	{
		title: "Foundation / Anchor Bolts — L-Type & J-Type",
		handle: "anchor-bolt-l-type-m20",
		subtitle: "M12–M48 | Carbon Steel / HDG | Cast-in-Place",
		description:
			"Cast-in-place foundation anchor bolts in L-type and J-type configurations. Manufactured to ASTM F1554 Grade 36 and ISO 898-1 specifications. Used for column base plates, machinery bases, structural steel connections, and bridge abutments. Custom embedment lengths and thread projections available on request.",
		status: "published",
		category_handle: "bolts",
		tags: [
			"anchor bolt",
			"foundation bolt",
			"ASTM F1554",
			"cast-in-place",
			"L-bolt",
			"J-bolt",
		],
		options: [
			{
				title: "Type",
				values: ["L-Type", "J-Type"],
			},
			{
				title: "Size",
				values: ["M12", "M16", "M20", "M24", "M30", "M36", "M42", "M48"],
			},
			{
				title: "Finish",
				values: [
					"Plain (Self-Colour)",
					"Hot-Dip Galvanised",
					"Epoxy Powder Coated",
				],
			},
		],
		variants: [
			{
				title: "L-Type M20 — Plain",
				sku: "AB-L-M20-PLAIN",
				inventory_quantity: 5000,
				manage_inventory: false,
				options: { Type: "L-Type", Size: "M20", Finish: "Plain (Self-Colour)" },
			},
			{
				title: "J-Type M24 — Hot-Dip Galvanised",
				sku: "AB-J-M24-HDG",
				inventory_quantity: 5000,
				manage_inventory: false,
				options: { Type: "J-Type", Size: "M24", Finish: "Hot-Dip Galvanised" },
			},
		],
		metadata: {
			standard: "ASTM F1554 Gr.36 / ISO 898-1",
			material: "Carbon steel, Alloy steel",
			size_range: "M12–M48",
			moq: "50 pcs (custom lengths by inquiry)",
		},
	},

	{
		title: "U-Bolts — Round Bend",
		handle: "u-bolt-m10-100mm",
		subtitle: "M6–M20 | Various Spans | Zinc Plated or HDG",
		description:
			"Round-bend U-bolts for pipe clamping, vehicle chassis, agricultural, and structural applications. Supplied with two hexagon nuts (DIN 934) and two flat washers (DIN 125). Custom spans available on request.",
		status: "published",
		category_handle: "bolts",
		tags: ["U-bolt", "pipe clamp", "round bend"],
		options: [
			{
				title: "Thread Size",
				values: ["M6", "M8", "M10", "M12", "M16", "M20"],
			},
			{
				title: "Inner Span",
				values: [
					"25mm",
					"32mm",
					"40mm",
					"50mm",
					"60mm",
					"76mm",
					"89mm",
					"100mm",
					"114mm",
				],
			},
			{
				title: "Finish",
				values: ["Zinc Plated", "Hot-Dip Galvanised", "Plain"],
			},
		],
		variants: [
			{
				title: "M10 × 100mm span — Zinc Plated",
				sku: "UB-M10-100-ZP",
				inventory_quantity: 10000,
				manage_inventory: false,
				options: {
					"Thread Size": "M10",
					"Inner Span": "100mm",
					Finish: "Zinc Plated",
				},
			},
			{
				title: "M12 × 114mm span — Hot-Dip Galvanised",
				sku: "UB-M12-114-HDG",
				inventory_quantity: 10000,
				manage_inventory: false,
				options: {
					"Thread Size": "M12",
					"Inner Span": "114mm",
					Finish: "Hot-Dip Galvanised",
				},
			},
		],
		metadata: {
			standard: "Custom / DIN equivalent",
			material: "Carbon steel",
			size_range: "M6–M20",
			moq: "50 sets",
		},
	},

	// ── Nuts ───────────────────────────────────────────────────────────────────

	{
		title: "Hexagon Nuts — DIN 934",
		handle: "hex-nut-din934-m10",
		subtitle: "M3–M36 | Property Class 8 | Zinc Plated",
		description:
			"Standard hexagon nuts to DIN 934 / ISO 4032 specification. Carbon steel, property class 8, bright zinc-plated. The standard pairing for DIN 931/933 hex bolts. Also available in property classes 5 and 10, and stainless A2 / A4.",
		status: "published",
		category_handle: "nuts",
		tags: ["DIN 934", "ISO 4032", "hex nut", "class 8"],
		options: [
			{
				title: "Size",
				values: [
					"M3",
					"M4",
					"M5",
					"M6",
					"M8",
					"M10",
					"M12",
					"M16",
					"M20",
					"M24",
					"M30",
					"M36",
				],
			},
			{
				title: "Finish",
				values: [
					"Zinc Plated",
					"Hot-Dip Galvanised",
					"Stainless A2",
					"Stainless A4",
					"Plain",
				],
			},
		],
		variants: [
			{
				title: "M10 — Zinc Plated",
				sku: "HN-DIN934-M10-ZP",
				inventory_quantity: 100000,
				manage_inventory: false,
				options: { Size: "M10", Finish: "Zinc Plated" },
			},
			{
				title: "M12 — Zinc Plated",
				sku: "HN-DIN934-M12-ZP",
				inventory_quantity: 100000,
				manage_inventory: false,
				options: { Size: "M12", Finish: "Zinc Plated" },
			},
			{
				title: "M10 — Stainless A2",
				sku: "HN-DIN934-M10-A2",
				inventory_quantity: 50000,
				manage_inventory: false,
				options: { Size: "M10", Finish: "Stainless A2" },
			},
		],
		metadata: {
			standard: "DIN 934 / ISO 4032",
			grade: "5, 8, 10",
			material: "Carbon steel, Stainless A2, Stainless A4",
			size_range: "M3–M36",
			moq: "100 pcs",
		},
	},

	{
		title: "Nylon Insert Lock Nuts — DIN 985",
		handle: "nylon-insert-nut-din985-m10",
		subtitle: "M3–M24 | Property Class 8 | Zinc Plated",
		description:
			"Nylon insert prevailing torque lock nuts (nylock) to DIN 985 / ISO 10512. The nylon insert creates friction on the bolt threads to resist loosening under vibration. Single-use — do not reuse in safety-critical applications. Operating temperature: −30°C to +120°C.",
		status: "published",
		category_handle: "nuts",
		tags: ["DIN 985", "ISO 10512", "lock nut", "nylon insert", "nylock"],
		options: [
			{
				title: "Size",
				values: [
					"M3",
					"M4",
					"M5",
					"M6",
					"M8",
					"M10",
					"M12",
					"M16",
					"M20",
					"M24",
				],
			},
			{
				title: "Finish",
				values: ["Zinc Plated", "Stainless A2", "Plain"],
			},
		],
		variants: [
			{
				title: "M10 — Zinc Plated",
				sku: "NIN-DIN985-M10-ZP",
				inventory_quantity: 100000,
				manage_inventory: false,
				options: { Size: "M10", Finish: "Zinc Plated" },
			},
			{
				title: "M12 — Stainless A2",
				sku: "NIN-DIN985-M12-A2",
				inventory_quantity: 50000,
				manage_inventory: false,
				options: { Size: "M12", Finish: "Stainless A2" },
			},
		],
		metadata: {
			standard: "DIN 985 / ISO 10512",
			grade: "6, 8, 10",
			material: "Carbon steel + nylon insert, Stainless A2 + nylon insert",
			size_range: "M3–M24",
			moq: "100 pcs",
		},
	},

	{
		title: "Flange Nuts — DIN 6923",
		handle: "flange-nut-din6923-m10",
		subtitle: "M5–M20 | Property Class 8 | Zinc Plated",
		description:
			"Hexagon flange nuts with a serrated bearing face to DIN 6923. The integral flange distributes the clamping load over a wider area, eliminating the need for a separate washer in most applications. The serrations on the flange underside provide additional anti-loosening resistance.",
		status: "published",
		category_handle: "nuts",
		tags: ["DIN 6923", "flange nut", "serrated flange"],
		options: [
			{
				title: "Size",
				values: ["M5", "M6", "M8", "M10", "M12", "M16", "M20"],
			},
			{
				title: "Finish",
				values: ["Zinc Plated", "Plain"],
			},
		],
		variants: [
			{
				title: "M10 — Zinc Plated",
				sku: "FN-DIN6923-M10-ZP",
				inventory_quantity: 50000,
				manage_inventory: false,
				options: { Size: "M10", Finish: "Zinc Plated" },
			},
		],
		metadata: {
			standard: "DIN 6923",
			grade: "8",
			material: "Carbon steel",
			size_range: "M5–M20",
			moq: "100 pcs",
		},
	},

	{
		title: "Cap Nuts (Dome Nuts) — DIN 1587",
		handle: "cap-nut-din1587-m10",
		subtitle: "M4–M20 | Property Class 6 | Zinc Plated",
		description:
			"Hexagon cap nuts (dome nuts) to DIN 1587. The closed top protects the bolt thread end from contamination and provides a decorative finished appearance. Commonly used in furniture, playground equipment, public installations, and any application where bolt end exposure is undesirable.",
		status: "published",
		category_handle: "nuts",
		tags: ["DIN 1587", "cap nut", "dome nut", "acorn nut"],
		options: [
			{
				title: "Size",
				values: ["M4", "M5", "M6", "M8", "M10", "M12", "M16", "M20"],
			},
			{
				title: "Finish",
				values: ["Zinc Plated", "Stainless A2", "Chrome Plated", "Plain"],
			},
		],
		variants: [
			{
				title: "M10 — Zinc Plated",
				sku: "CN-DIN1587-M10-ZP",
				inventory_quantity: 30000,
				manage_inventory: false,
				options: { Size: "M10", Finish: "Zinc Plated" },
			},
			{
				title: "M10 — Stainless A2",
				sku: "CN-DIN1587-M10-A2",
				inventory_quantity: 20000,
				manage_inventory: false,
				options: { Size: "M10", Finish: "Stainless A2" },
			},
		],
		metadata: {
			standard: "DIN 1587",
			grade: "6",
			material: "Carbon steel, Stainless A2",
			size_range: "M4–M20",
			moq: "100 pcs",
		},
	},

	// ── Screws ─────────────────────────────────────────────────────────────────

	{
		title: "Self-Tapping Screws — DIN 7981 / DIN 7982",
		handle: "self-tapping-screw-din7981-4x20",
		subtitle: "2.2–6.3mm | Pan Head or Countersunk | Zinc Plated",
		description:
			"Sheet metal self-tapping screws for thin metal, plastics, and light assemblies. DIN 7981 (pan head, Pozidriv) and DIN 7982 (countersunk, Pozidriv). Form C thread (pointed tip) cuts its own thread on first installation. No pre-tapping required.",
		status: "published",
		category_handle: "screws",
		tags: [
			"DIN 7981",
			"DIN 7982",
			"self-tapping",
			"sheet metal screw",
			"TEK screw",
		],
		options: [
			{
				title: "Diameter",
				values: [
					"2.2mm",
					"2.9mm",
					"3.5mm",
					"3.9mm",
					"4.2mm",
					"4.8mm",
					"5.5mm",
					"6.3mm",
				],
			},
			{
				title: "Length",
				values: [
					"9.5mm",
					"13mm",
					"16mm",
					"19mm",
					"25mm",
					"32mm",
					"38mm",
					"50mm",
				],
			},
			{
				title: "Head Type",
				values: ["Pan Head (DIN 7981)", "Countersunk (DIN 7982)"],
			},
		],
		variants: [
			{
				title: "4.2mm × 19mm — Pan Head",
				sku: "STS-DIN7981-4.2-19-ZP",
				inventory_quantity: 200000,
				manage_inventory: false,
				options: {
					Diameter: "4.2mm",
					Length: "19mm",
					"Head Type": "Pan Head (DIN 7981)",
				},
			},
			{
				title: "4.8mm × 25mm — Countersunk",
				sku: "STS-DIN7982-4.8-25-ZP",
				inventory_quantity: 200000,
				manage_inventory: false,
				options: {
					Diameter: "4.8mm",
					Length: "25mm",
					"Head Type": "Countersunk (DIN 7982)",
				},
			},
		],
		metadata: {
			standard: "DIN 7981 / DIN 7982",
			drive: "Pozidriv PZ2 / PZ3",
			material: "Carbon steel, Stainless A2",
			size_range: "2.2–6.3mm diameter",
			moq: "500 pcs",
		},
	},

	{
		title: "Machine Screws — DIN 84 Slotted / ISO 1207",
		handle: "machine-screw-din84-m4x20",
		subtitle: "M2–M10 | Cheese Head | Zinc Plated",
		description:
			"Slotted cheese head machine screws to DIN 84 / ISO 1207. For use in pre-tapped holes or with hex nuts. Fully threaded. Also available in cross-recessed (Pozidriv, DIN 7985) and countersunk (DIN 963) head styles — contact us with your specification.",
		status: "published",
		category_handle: "screws",
		tags: ["DIN 84", "ISO 1207", "machine screw", "cheese head", "M3", "M4"],
		options: [
			{
				title: "Size",
				values: ["M2", "M2.5", "M3", "M4", "M5", "M6", "M8", "M10"],
			},
			{
				title: "Length",
				values: [
					"5mm",
					"8mm",
					"10mm",
					"12mm",
					"16mm",
					"20mm",
					"25mm",
					"30mm",
					"40mm",
					"50mm",
				],
			},
			{
				title: "Finish",
				values: ["Zinc Plated", "Stainless A2", "Plain"],
			},
		],
		variants: [
			{
				title: "M4 × 20mm — Zinc Plated",
				sku: "MS-DIN84-M4-20-ZP",
				inventory_quantity: 100000,
				manage_inventory: false,
				options: { Size: "M4", Length: "20mm", Finish: "Zinc Plated" },
			},
			{
				title: "M5 × 25mm — Stainless A2",
				sku: "MS-DIN84-M5-25-A2",
				inventory_quantity: 50000,
				manage_inventory: false,
				options: { Size: "M5", Length: "25mm", Finish: "Stainless A2" },
			},
		],
		metadata: {
			standard: "DIN 84 / ISO 1207",
			drive: "Slotted",
			material: "Carbon steel, Stainless A2",
			size_range: "M2–M10",
			moq: "200 pcs",
		},
	},

	{
		title: "Socket Set Screws (Grub Screws) — DIN 913",
		handle: "set-screw-din913-m6x10",
		subtitle: "M3–M20 | Flat Point | Black Oxide",
		description:
			"Full-dog and flat-point socket set screws (grub screws) to DIN 913 / ISO 4026. Hexagon socket drive. Property class 45H. Used for locking hubs, pulleys, and collars onto shafts. Available in cup point (DIN 916), cone point (DIN 914), and dog point (DIN 915) — contact us for alternatives.",
		status: "published",
		category_handle: "screws",
		tags: [
			"DIN 913",
			"ISO 4026",
			"grub screw",
			"set screw",
			"socket set screw",
		],
		options: [
			{
				title: "Size",
				values: ["M3", "M4", "M5", "M6", "M8", "M10", "M12", "M16", "M20"],
			},
			{
				title: "Length",
				values: [
					"3mm",
					"4mm",
					"5mm",
					"6mm",
					"8mm",
					"10mm",
					"12mm",
					"16mm",
					"20mm",
					"25mm",
					"30mm",
				],
			},
		],
		variants: [
			{
				title: "M6 × 10mm — Black Oxide",
				sku: "SS-DIN913-M6-10-BLK",
				inventory_quantity: 50000,
				manage_inventory: false,
				options: { Size: "M6", Length: "10mm" },
			},
			{
				title: "M8 × 12mm — Black Oxide",
				sku: "SS-DIN913-M8-12-BLK",
				inventory_quantity: 50000,
				manage_inventory: false,
				options: { Size: "M8", Length: "12mm" },
			},
		],
		metadata: {
			standard: "DIN 913 / ISO 4026",
			drive: "Hexagon socket (Allen)",
			grade: "45H",
			material: "Alloy steel, black oxide finish",
			size_range: "M3–M20",
			moq: "200 pcs",
		},
	},

	{
		title: "Wood Screws — PZ Countersunk",
		handle: "wood-screw-pz2-4x40",
		subtitle: "3.5–6mm | Countersunk | Yellow Zinc / A2 Stainless",
		description:
			"Pozidriv countersunk twin-start wood screws. Coarse-thread for softwood; also available in fine-thread for hardwood applications. Twin-start thread allows faster driving with reduced cam-out. Bugle-head profile prevents surface breakout in MDF and sheet timber.",
		status: "published",
		category_handle: "screws",
		tags: ["wood screw", "countersunk", "Pozidriv", "PZ2", "twin-start"],
		options: [
			{
				title: "Diameter",
				values: ["3.5mm", "4.0mm", "4.5mm", "5.0mm", "6.0mm"],
			},
			{
				title: "Length",
				values: [
					"20mm",
					"25mm",
					"30mm",
					"35mm",
					"40mm",
					"50mm",
					"60mm",
					"70mm",
					"80mm",
					"100mm",
				],
			},
			{
				title: "Finish",
				values: [
					"Yellow Zinc (Interior)",
					"Green ACQ-Rated (Exterior)",
					"Stainless A2",
				],
			},
		],
		variants: [
			{
				title: "4.0mm × 40mm — Yellow Zinc",
				sku: "WS-PZ2-4.0-40-YZ",
				inventory_quantity: 500000,
				manage_inventory: false,
				options: {
					Diameter: "4.0mm",
					Length: "40mm",
					Finish: "Yellow Zinc (Interior)",
				},
			},
			{
				title: "5.0mm × 60mm — ACQ-Rated",
				sku: "WS-PZ2-5.0-60-ACQ",
				inventory_quantity: 200000,
				manage_inventory: false,
				options: {
					Diameter: "5.0mm",
					Length: "60mm",
					Finish: "Green ACQ-Rated (Exterior)",
				},
			},
			{
				title: "4.0mm × 40mm — Stainless A2",
				sku: "WS-PZ2-4.0-40-A2",
				inventory_quantity: 100000,
				manage_inventory: false,
				options: { Diameter: "4.0mm", Length: "40mm", Finish: "Stainless A2" },
			},
		],
		metadata: {
			standard: "EN 14566 / proprietary",
			drive: "Pozidriv PZ2 / PZ3",
			material: "Carbon steel, Stainless A2",
			size_range: "3.5–6mm × 20–100mm",
			moq: "500 pcs",
		},
	},

	// ── Washers ────────────────────────────────────────────────────────────────

	{
		title: "Flat Washers — DIN 125A",
		handle: "flat-washer-din125-m10",
		subtitle: "M3–M36 | Normal Series | Zinc Plated",
		description:
			"Plain flat washers to DIN 125A / ISO 7089, normal series. Used under bolt heads and nuts to distribute clamping load and protect the workpiece surface. Available in narrow (DIN 125A) and wide (DIN 9021) series.",
		status: "published",
		category_handle: "washers",
		tags: ["DIN 125", "ISO 7089", "flat washer", "plain washer"],
		options: [
			{
				title: "Size",
				values: [
					"M3",
					"M4",
					"M5",
					"M6",
					"M8",
					"M10",
					"M12",
					"M16",
					"M20",
					"M24",
					"M30",
					"M36",
				],
			},
			{
				title: "Finish",
				values: [
					"Zinc Plated",
					"Hot-Dip Galvanised",
					"Stainless A2",
					"Stainless A4",
					"Plain",
				],
			},
		],
		variants: [
			{
				title: "M10 — Zinc Plated",
				sku: "FW-DIN125-M10-ZP",
				inventory_quantity: 500000,
				manage_inventory: false,
				options: { Size: "M10", Finish: "Zinc Plated" },
			},
			{
				title: "M12 — Stainless A2",
				sku: "FW-DIN125-M12-A2",
				inventory_quantity: 100000,
				manage_inventory: false,
				options: { Size: "M12", Finish: "Stainless A2" },
			},
		],
		metadata: {
			standard: "DIN 125A / ISO 7089",
			material: "Carbon steel, Stainless A2, Stainless A4",
			size_range: "M3–M36",
			moq: "500 pcs",
		},
	},

	{
		title: "Spring (Lock) Washers — DIN 127B",
		handle: "spring-washer-din127-m10",
		subtitle: "M3–M36 | Split Ring | Zinc Plated",
		description:
			"Split ring spring washers to DIN 127B / ISO 7090. The single split in the ring creates a spring action that resists bolt loosening under vibration. Used as a simple, low-cost anti-loosening measure for non-critical joints. Note: for highly dynamic loads, consider a nylon insert nut (DIN 985) or Nord-Lock system instead.",
		status: "published",
		category_handle: "washers",
		tags: [
			"DIN 127",
			"ISO 7090",
			"spring washer",
			"lock washer",
			"split washer",
		],
		options: [
			{
				title: "Size",
				values: [
					"M3",
					"M4",
					"M5",
					"M6",
					"M8",
					"M10",
					"M12",
					"M16",
					"M20",
					"M24",
					"M30",
					"M36",
				],
			},
			{
				title: "Finish",
				values: ["Zinc Plated", "Stainless A2", "Plain"],
			},
		],
		variants: [
			{
				title: "M10 — Zinc Plated",
				sku: "SW-DIN127-M10-ZP",
				inventory_quantity: 500000,
				manage_inventory: false,
				options: { Size: "M10", Finish: "Zinc Plated" },
			},
		],
		metadata: {
			standard: "DIN 127B / ISO 7090",
			material: "Spring steel, Stainless A2",
			size_range: "M3–M36",
			moq: "500 pcs",
		},
	},

	{
		title: "Internal Tooth Lock Washers — DIN 6797A",
		handle: "lock-washer-din128-m10",
		subtitle: "M3–M20 | Internal Serrations | Zinc Plated",
		description:
			"Internal tooth lock washers to DIN 6797A. The internal serrations bite into both the workpiece surface and the underside of the bolt head or nut, creating a positive mechanical lock. Lower profile than spring washers — preferred where head clearance is limited.",
		status: "published",
		category_handle: "washers",
		tags: [
			"DIN 6797",
			"DIN 128",
			"lock washer",
			"tooth washer",
			"internal tooth",
		],
		options: [
			{
				title: "Size",
				values: ["M3", "M4", "M5", "M6", "M8", "M10", "M12", "M16", "M20"],
			},
			{
				title: "Finish",
				values: ["Zinc Plated", "Plain"],
			},
		],
		variants: [
			{
				title: "M10 — Zinc Plated",
				sku: "LW-DIN6797-M10-ZP",
				inventory_quantity: 200000,
				manage_inventory: false,
				options: { Size: "M10", Finish: "Zinc Plated" },
			},
		],
		metadata: {
			standard: "DIN 6797A / DIN 128",
			material: "Spring steel",
			size_range: "M3–M20",
			moq: "500 pcs",
		},
	},

	{
		title: "Square Slant Washers — DIN 434 / DIN 435",
		handle: "square-washer-din434-m10",
		subtitle: "M10–M36 | 8% / 14% Taper | Hot-Dip Galvanised",
		description:
			"Square taper washers (oblique washers) for use with I-beams and structural sections where the flange has a slope. DIN 434 (8° taper for wide-flange beams) and DIN 435 (14° taper for narrow-flange beams). Ensures the bolt bears squarely on the flange surface, preventing fatigue from bending loads.",
		status: "published",
		category_handle: "washers",
		tags: [
			"DIN 434",
			"DIN 435",
			"square washer",
			"taper washer",
			"I-beam",
			"structural",
		],
		options: [
			{
				title: "Size",
				values: ["M10", "M12", "M16", "M20", "M24", "M30", "M36"],
			},
			{
				title: "Type",
				values: ["DIN 434 (8% taper)", "DIN 435 (14% taper)"],
			},
			{
				title: "Finish",
				values: ["Hot-Dip Galvanised", "Plain"],
			},
		],
		variants: [
			{
				title: "M16 DIN 434 — Hot-Dip Galvanised",
				sku: "QW-DIN434-M16-HDG",
				inventory_quantity: 20000,
				manage_inventory: false,
				options: {
					Size: "M16",
					Type: "DIN 434 (8% taper)",
					Finish: "Hot-Dip Galvanised",
				},
			},
			{
				title: "M20 DIN 435 — Hot-Dip Galvanised",
				sku: "QW-DIN435-M20-HDG",
				inventory_quantity: 20000,
				manage_inventory: false,
				options: {
					Size: "M20",
					Type: "DIN 435 (14% taper)",
					Finish: "Hot-Dip Galvanised",
				},
			},
		],
		metadata: {
			standard: "DIN 434 / DIN 435",
			material: "Carbon steel",
			size_range: "M10–M36",
			moq: "50 pcs",
		},
	},

	// ── Wrenches ───────────────────────────────────────────────────────────────

	{
		title: "Box End Wrench Set — 8–19mm",
		handle: "box-end-wrench-set-8-19mm",
		subtitle: "6-Piece | Chrome-Vanadium | Mirror Polish",
		description:
			"Professional 6-piece box end (ring) wrench set in chrome-vanadium steel with mirror-polished finish. Double-offset 15° angle for knuckle clearance. Metric sizes: 8, 10, 12, 13, 17, and 19mm. 12-point box end for versatile engagement angles. Suitable for automotive, engineering, and maintenance applications.",
		status: "published",
		category_handle: "wrenches",
		tags: [
			"box end wrench",
			"ring spanner",
			"chrome-vanadium",
			"metric",
			"tool set",
		],
		options: [
			{
				title: "Set Composition",
				values: [
					"6pc: 8-10-12-13-17-19mm",
					"8pc: 6-8-10-12-13-14-17-19mm",
					"12pc: 6-7-8-9-10-11-12-13-14-17-19-22mm",
				],
			},
			{
				title: "Finish",
				values: ["Chrome Polished", "Matte / Satin"],
			},
		],
		variants: [
			{
				title: "6pc Set — Chrome Polished",
				sku: "WR-BOX-6PC-CR",
				inventory_quantity: 1000,
				manage_inventory: false,
				options: {
					"Set Composition": "6pc: 8-10-12-13-17-19mm",
					Finish: "Chrome Polished",
				},
			},
			{
				title: "12pc Set — Chrome Polished",
				sku: "WR-BOX-12PC-CR",
				inventory_quantity: 500,
				manage_inventory: false,
				options: {
					"Set Composition": "12pc: 6-7-8-9-10-11-12-13-14-17-19-22mm",
					Finish: "Chrome Polished",
				},
			},
		],
		metadata: {
			standard: "DIN 838 / ISO 7738",
			material: "Chrome-vanadium steel (Cr-V)",
			size_range: "6–22mm",
			moq: "10 sets",
		},
	},

	{
		title: "Hexagon Socket (Allen) Wrench Set",
		handle: "hex-socket-wrench-set-allen",
		subtitle: "9-Piece | Long Arm | Chrome-Vanadium",
		description:
			"Long-arm hexagon socket wrench (Allen key) set in chrome-vanadium steel. The long arm provides high torque for tight fasteners; the short arm allows fast rotation for low-resistance driving. Metric sizes: 1.5, 2, 2.5, 3, 4, 5, 6, 8, and 10mm. Ball-end option available for angular access (up to 25° offset).",
		status: "published",
		category_handle: "wrenches",
		tags: [
			"Allen key",
			"hex key",
			"socket wrench",
			"Allen wrench",
			"chrome-vanadium",
		],
		options: [
			{
				title: "Set Size",
				values: ["9pc: 1.5–10mm", "10pc: 1.5–12mm"],
			},
			{
				title: "Tip Type",
				values: ["Standard Hex", "Ball-End Hex"],
			},
		],
		variants: [
			{
				title: "9pc Standard — 1.5–10mm",
				sku: "WR-ALLEN-9PC-STD",
				inventory_quantity: 2000,
				manage_inventory: false,
				options: { "Set Size": "9pc: 1.5–10mm", "Tip Type": "Standard Hex" },
			},
			{
				title: "9pc Ball-End — 1.5–10mm",
				sku: "WR-ALLEN-9PC-BALL",
				inventory_quantity: 1000,
				manage_inventory: false,
				options: { "Set Size": "9pc: 1.5–10mm", "Tip Type": "Ball-End Hex" },
			},
		],
		metadata: {
			standard: "DIN 911 / ISO 2936",
			material: "Chrome-vanadium steel (Cr-V)",
			size_range: "1.5–12mm",
			moq: "10 sets",
		},
	},

	// ─────────────────────────────────────────────────────────────────────────
	// CATALOGUE_PRICE_NOTE — the /shop stock.
	//
	// Everything above is quote-only: no variant carries a price, so the
	// storefront renders "price on request" and every CTA funnels into the
	// finder. These three DO carry prices, which is the only thing that puts a
	// product on /shop — that page filters on `price_cents !== null` from
	// /api/shopping/products. Remove the prices in admin and the product drops
	// back to the quote catalogue with no code change.
	//
	// Priced in all three seeded currencies so any region calculates them.
	// `pack_size` is the lot the price is quoted per, and it is what the
	// quantity steppers on the PDP, in the cart drawer and in the finder now
	// step by (see aerial-solid `orderRulesOf`).
	// ─────────────────────────────────────────────────────────────────────────

	{
		title: "Hexagon Head Bolt M8×40 — DIN 933, Zinc Plated",
		handle: "shop-hex-bolt-m8-40-din933-zp",
		subtitle: "Class 8.8 | Zinc Plated | Box of 100",
		description:
			"Stock hexagon head bolt, fully threaded to DIN 933, property class 8.8, zinc plated. Sold by the box of 100 at the listed price — no quote needed. For other sizes, finishes or bulk volumes, request a quote.",
		status: "published",
		category_handle: "bolts",
		tags: ["DIN 933", "hex bolt", "M8", "in stock"],
		options: [
			{ title: "Size", values: ["M8 × 40mm"] },
			{ title: "Finish", values: ["Zinc Plated"] },
		],
		variants: [
			{
				title: "M8 × 40mm — Zinc Plated — Box of 100",
				sku: "SHOP-HB-DIN933-M8-40-ZP-100",
				inventory_quantity: 4000,
				manage_inventory: true,
				options: { Size: "M8 × 40mm", Finish: "Zinc Plated" },
				prices: [
					{ amount: 11.9, currency_code: "usd" },
					{ amount: 10.9, currency_code: "eur" },
					{ amount: 85, currency_code: "cny" },
				],
			},
		],
		metadata: {
			standard: "DIN 933 / ISO 4017",
			grade: "8.8",
			material: "Carbon steel",
			finish: "Zinc Plated",
			pack_size: "100",
			moq: "100",
			stock_state: "in",
			lead_days: "3",
		},
	},

	{
		title: "Hexagon Nut M8 — DIN 934, Stainless A2",
		handle: "shop-hex-nut-m8-din934-a2",
		subtitle: "A2-70 | Stainless | Box of 200",
		description:
			"Stock hexagon nut to DIN 934 in A2 stainless, property class 70. Sold by the box of 200 at the listed price. Pairs with the M8 stock bolt.",
		status: "published",
		category_handle: "nuts",
		tags: ["DIN 934", "hex nut", "M8", "stainless", "in stock"],
		options: [
			{ title: "Size", values: ["M8"] },
			{ title: "Material", values: ["Stainless A2"] },
		],
		variants: [
			{
				title: "M8 — Stainless A2 — Box of 200",
				sku: "SHOP-HN-DIN934-M8-A2-200",
				inventory_quantity: 6000,
				manage_inventory: true,
				options: { Size: "M8", Material: "Stainless A2" },
				prices: [
					{ amount: 14.5, currency_code: "usd" },
					{ amount: 13.2, currency_code: "eur" },
					{ amount: 104, currency_code: "cny" },
				],
			},
		],
		metadata: {
			standard: "DIN 934 / ISO 4032",
			grade: "A2-70",
			material: "Stainless A2",
			finish: "Plain",
			pack_size: "200",
			moq: "200",
			stock_state: "in",
			lead_days: "3",
		},
	},

	{
		title: "Flat Washer M8 — DIN 125A, Zinc Plated",
		handle: "shop-flat-washer-m8-din125a-zp",
		subtitle: "Form A | Zinc Plated | Box of 500",
		description:
			"Stock flat washer to DIN 125 form A, zinc plated carbon steel. Sold by the box of 500 at the listed price.",
		status: "published",
		category_handle: "washers",
		tags: ["DIN 125", "flat washer", "M8", "in stock"],
		options: [
			{ title: "Size", values: ["M8 (8.4mm)"] },
			{ title: "Finish", values: ["Zinc Plated"] },
		],
		variants: [
			{
				title: "M8 — Zinc Plated — Box of 500",
				sku: "SHOP-FW-DIN125A-M8-ZP-500",
				inventory_quantity: 12000,
				manage_inventory: true,
				options: { Size: "M8 (8.4mm)", Finish: "Zinc Plated" },
				prices: [
					{ amount: 9.4, currency_code: "usd" },
					{ amount: 8.6, currency_code: "eur" },
					{ amount: 67, currency_code: "cny" },
				],
			},
		],
		metadata: {
			standard: "DIN 125A / ISO 7089",
			material: "Carbon steel",
			finish: "Zinc Plated",
			pack_size: "500",
			moq: "500",
			stock_state: "in",
			lead_days: "3",
		},
	},
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg: string): void {
	console.info(`[seed] ${msg}`);
}

function logSkip(entity: string, identifier: string): void {
	console.info(
		`[seed]   ↷ Skipping ${entity} "${identifier}" — already exists`,
	);
}

function logCreate(entity: string, identifier: string): void {
	console.info(`[seed]   ✓ Created ${entity} "${identifier}"`);
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

export default async function seed({ container }: ExecArgs): Promise<void> {
	log("Starting ZLFasteners seed script…");
	log("─".repeat(60));

	const regionService = container.resolve(Modules.REGION);
	const salesChannelService = container.resolve(Modules.SALES_CHANNEL);
	const productService = container.resolve(Modules.PRODUCT);

	// ── 1. Ensure default sales channel exists ──────────────────────────────
	log("Step 1: Sales channel");
	const existingChannels = await salesChannelService.listSalesChannels({});
	let defaultChannel = existingChannels[0];

	if (!defaultChannel) {
		defaultChannel = await salesChannelService.createSalesChannels({
			name: "ZL Fasteners Online Store",
			description: "Primary B2B/B2C sales channel for zlfasteners.com",
			is_disabled: false,
		});
		logCreate("Sales channel", "ZL Fasteners Online Store");
	} else {
		logSkip("Sales channel", defaultChannel.name);
	}

	// ── 2. Create Regions ───────────────────────────────────────────────────
	log("Step 2: Regions");

	const existingRegions = await regionService.listRegions({});
	const existingRegionNames = new Set(
		existingRegions.map((r: { name: string }) => r.name),
	);

	for (const regionSeed of REGION_SEEDS) {
		if (existingRegionNames.has(regionSeed.name)) {
			logSkip("Region", regionSeed.name);
			continue;
		}

		await regionService.createRegions({
			name: regionSeed.name,
			currency_code: regionSeed.currency_code,
			countries: regionSeed.countries,
		});

		logCreate(
			"Region",
			`${regionSeed.name} (${regionSeed.currency_code.toUpperCase()})`,
		);
	}

	// ── 3. Create Product Categories ────────────────────────────────────────
	log("Step 3: Product categories");

	const existingCategories = await productService.listProductCategories({});
	const existingCategoryHandles = new Set(
		existingCategories.map((c: { handle: string }) => c.handle),
	);

	const categoryIdMap: Record<string, string> = {};

	// Build map for existing categories
	for (const cat of existingCategories) {
		categoryIdMap[cat.handle] = cat.id;
	}

	for (const categorySeed of CATEGORY_SEEDS) {
		if (existingCategoryHandles.has(categorySeed.handle)) {
			logSkip("Category", categorySeed.handle);
			continue;
		}

		const created = await productService.createProductCategories({
			name: categorySeed.name,
			handle: categorySeed.handle,
			description: categorySeed.description,
			is_active: true,
			is_internal: false,
			metadata: categorySeed.metadata ?? {},
		});

		categoryIdMap[categorySeed.handle] = created.id;
		logCreate("Category", `${categorySeed.name} (${categorySeed.handle})`);
	}

	// ── 4. Create Products ──────────────────────────────────────────────────
	log("Step 4: Products");

	const existingProducts = await productService.listProducts({});
	const existingProductHandles = new Set(
		existingProducts.map((p: { handle: string }) => p.handle),
	);

	for (const productSeed of PRODUCT_SEEDS) {
		if (existingProductHandles.has(productSeed.handle)) {
			logSkip("Product", productSeed.handle);
			continue;
		}

		const categoryId = categoryIdMap[productSeed.category_handle];
		if (!categoryId) {
			console.warn(
				`[seed]   ⚠ Category "${productSeed.category_handle}" not found for product "${productSeed.handle}" — skipping`,
			);
			continue;
		}

		// Build options for the product
		const options = productSeed.options.map((opt) => ({
			title: opt.title,
			values: opt.values,
		}));

		// Build variants
		// NOTE: Medusa v2 expects variants with prices to be added separately
		// via price lists. Here we create variants with NO prices (price-on-request).
		// Most variants carry no price at all: the catalogue is quote-only and
		// price visibility is gated behind the RFQ. The handful that DO carry
		// `prices` are the /shop stock — see CATALOGUE_PRICE_NOTE below.
		const variants = productSeed.variants.map((v) => ({
			title: v.title,
			sku: v.sku,
			manage_inventory: v.manage_inventory,
			inventory_quantity: v.inventory_quantity,
			options: v.options,
			...(v.prices ? { prices: v.prices } : {}),
		}));

		// Products are created through the core workflow rather than the product
		// module service: category and sales-channel assignment are cross-module
		// links that only the workflow can write (CreateProductDTO has no
		// `categories` / `sales_channels`), and the workflow rolls the product back
		// if a variant fails.
		await createProductsWorkflow(container).run({
			input: {
				products: [
					{
						title: productSeed.title,
						handle: productSeed.handle,
						subtitle: productSeed.subtitle,
						description: productSeed.description,
						status: productSeed.status,
						category_ids: [categoryId],
						sales_channels: [{ id: defaultChannel.id }],
						options,
						variants,
						metadata: productSeed.metadata ?? {},
					},
				],
			},
		});

		logCreate(
			"Product",
			`${productSeed.title} (${productSeed.variants.length} variant${productSeed.variants.length !== 1 ? "s" : ""})`,
		);
	}

	// ── Done ─────────────────────────────────────────────────────────────────
	log("─".repeat(60));
	log("Seed complete.");
	log("");
	log("Next steps:");
	log("  1. Run `medusa db:migrate` if you haven't already");
	log("  2. Open Medusa Admin → Regions and verify 5 regions exist");
	log("  3. Open Medusa Admin → Products and verify 21 products exist");
	log("     (3 of them priced — those are the ones /shop lists)");
	log("  4. Upload product images via Medusa Admin → Products → Media");
	log("  5. Create a Publishable API key in Settings → Publishable API Keys");
	log(
		"     then add it to apps/storefront/.env as VITE_MEDUSA_PUBLISHABLE_KEY",
	);
}
