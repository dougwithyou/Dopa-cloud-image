// Definición de planes. Este archivo no importa nada para que también lo pueda
// usar scripts/stripe-setup.ts (Node con --experimental-strip-types).
// Precios confirmados: Entry $4.99 · Medium $17.99 · High $49.99 (USD/mes).

export const PLAN_IDS = ["entry", "medium", "high"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const TRIAL_DAYS = 30;

const GB = 1024 ** 3;
const TB = 1024 ** 4;

export interface Plan {
  id: PlanId;
  name: string;
  /** Precio mensual en centavos de USD. */
  priceCents: number;
  currency: "usd";
  storageBytes: number;
  /** null = clientes ilimitados */
  clientLimit: number | null;
  /** lookup_key del precio en Stripe (lo crea scripts/stripe-setup.ts). */
  lookupKey: string;
  /** Id fijo del producto en Stripe. */
  stripeProductId: string;
  highlights: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  entry: {
    id: "entry",
    name: "Entry",
    priceCents: 499,
    currency: "usd",
    storageBytes: 25 * GB,
    clientLimit: 3,
    lookupKey: "hidopa_entry_monthly_v1",
    stripeProductId: "hidopa_cloud_entry",
    highlights: ["25 GB de almacenamiento", "Hasta 3 clientes", "Portal privado por cliente"],
  },
  medium: {
    id: "medium",
    name: "Medium",
    priceCents: 1799,
    currency: "usd",
    storageBytes: 250 * GB,
    clientLimit: null,
    lookupKey: "hidopa_medium_monthly_v1",
    stripeProductId: "hidopa_cloud_medium",
    highlights: ["250 GB de almacenamiento", "Clientes ilimitados", "Portal privado por cliente"],
  },
  high: {
    id: "high",
    name: "High",
    priceCents: 4999,
    currency: "usd",
    storageBytes: 1 * TB,
    clientLimit: null,
    lookupKey: "hidopa_high_monthly_v1",
    stripeProductId: "hidopa_cloud_high",
    highlights: ["1 TB de almacenamiento", "Clientes ilimitados", "Ideal para agencias"],
  },
};

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

export function formatPrice(plan: Plan): string {
  return `$${(plan.priceCents / 100).toFixed(2)}`;
}
