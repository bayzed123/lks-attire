/**
 * Courier integrations. Steadfast is the primary partner (full API); Pathao and RedX accept a manually
 * entered tracking ID today and can be upgraded to their APIs later without changing the order pipeline.
 */
import type { Env } from "../env";

export type Courier = "Steadfast" | "Pathao" | "RedX";
export type OrderStatus = "pending" | "confirmed" | "packed" | "shipped" | "delivered" | "returned" | "cancelled";

export interface ConsignmentOrder {
  order_no: string;
  customer_name: string;
  customer_phone: string;
  area: string;
  upazila: string;
  district: string;
  total: number;
  payment_status: string;
  customer_note: string | null;
}

export interface ConsignmentResult {
  consignmentId: string;
  trackingId: string;
}

const STEADFAST_BASE = "https://portal.packzy.com/api/v1";

export function steadfastConfigured(env: Env): boolean {
  return Boolean(env.STEADFAST_API_KEY && env.STEADFAST_SECRET_KEY);
}

export async function steadfastCreate(env: Env, order: ConsignmentOrder): Promise<ConsignmentResult> {
  const res = await fetch(`${STEADFAST_BASE}/create_order`, {
    method: "POST",
    headers: { "Api-Key": env.STEADFAST_API_KEY!, "Secret-Key": env.STEADFAST_SECRET_KEY!, "content-type": "application/json" },
    body: JSON.stringify({
      invoice: order.order_no,
      recipient_name: order.customer_name,
      recipient_phone: order.customer_phone,
      recipient_address: `${order.area}, ${order.upazila}, ${order.district}`.slice(0, 250),
      cod_amount: order.payment_status === "paid" ? 0 : order.total,
      note: order.customer_note ?? "",
    }),
  });
  const data = (await res.json()) as { status?: number; message?: string; consignment?: { consignment_id: number; tracking_code: string } };
  if (data.status !== 200 || !data.consignment) throw new Error(`Steadfast: ${data.message ?? `HTTP ${res.status}`}`);
  return { consignmentId: String(data.consignment.consignment_id), trackingId: data.consignment.tracking_code };
}

/** Maps Steadfast delivery statuses to our order pipeline (null = informational only). */
export function mapSteadfastStatus(s: string): OrderStatus | null {
  switch (s) {
    case "delivered":
    case "partial_delivered":
      return "delivered";
    case "cancelled":
      return "returned"; // parcel came back to the merchant
    case "in_review":
    case "pending":
    case "hold":
    case "unknown":
    default:
      return null;
  }
}

export function trackingUrl(courier: Courier | null, trackingId: string | null): string | null {
  if (!courier || !trackingId) return null;
  const id = encodeURIComponent(trackingId);
  switch (courier) {
    case "Steadfast":
      return `https://steadfast.com.bd/t/${id}`;
    case "Pathao":
      return `https://merchant.pathao.com/tracking?consignment_id=${id}`;
    case "RedX":
      return `https://redx.com.bd/track-parcel/?trackingId=${id}`;
  }
}

export async function createConsignment(env: Env, courier: Courier, order: ConsignmentOrder): Promise<ConsignmentResult | null> {
  if (courier === "Steadfast" && steadfastConfigured(env)) return steadfastCreate(env, order);
  return null; // Pathao / RedX: staff enter the tracking ID from the courier's merchant panel.
}
