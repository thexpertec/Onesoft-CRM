import { cn } from "@/lib/utils";

const PAYMENT_STYLE: Record<string, string> = {
  Paid:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  Partial: "bg-amber-50 text-amber-700 border-amber-200",
  Unpaid:  "bg-red-50 text-red-600 border-red-200",
};

export type PayStatus = "Paid" | "Partial" | "Unpaid";

/** Derive payment status the same way as the admin portal. */
export function derivePayStatus(amountPaid: string | undefined, total: number): PayStatus {
  const paid = parseFloat(amountPaid ?? "0") || 0;
  if (total <= 0) return "Paid";
  if (paid >= total - 0.005) return "Paid";
  if (paid > 0) return "Partial";
  return "Unpaid";
}

export function PaymentBadge({ status }: { status: PayStatus }) {
  const style = PAYMENT_STYLE[status] ?? "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11.5px] font-medium border", style)}>
      {status}
    </span>
  );
}

const ORDER_STAGE_STYLE: Record<string, string> = {
  Placed:     "bg-gray-100 text-gray-600 border-gray-200",
  Confirmed:  "bg-indigo-50 text-indigo-700 border-indigo-200",
  Processing: "bg-amber-50 text-amber-700 border-amber-200",
  Shipped:    "bg-blue-50 text-blue-700 border-blue-200",
  Delivered:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  Cancelled:  "bg-red-50 text-red-600 border-red-200",
  Refunded:   "bg-orange-50 text-orange-600 border-orange-200",
};

/** Derive the current pipeline stage from status + deliveryStatus — matches admin logic exactly. */
export function deriveOrderStage(status: string, deliveryStatus?: string): string {
  if (status === "Cancelled") return "Cancelled";
  if (status === "Refunded")  return "Refunded";
  if (status === "Draft")     return "Placed";
  const ds = deliveryStatus ?? "Pending";
  if (ds === "Delivered")  return "Delivered";
  if (ds === "Shipped")    return "Shipped";
  if (ds === "Processing") return "Processing";
  return "Confirmed";
}

export function OrderStageBadge({ status, deliveryStatus }: { status: string; deliveryStatus?: string }) {
  const stage = deriveOrderStage(status, deliveryStatus);
  const style = ORDER_STAGE_STYLE[stage] ?? "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11.5px] font-medium border", style)}>
      {stage}
    </span>
  );
}

const STATUS_STYLE: Record<string, string> = {
  Completed:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  Confirmed:  "bg-blue-50 text-blue-700 border-blue-200",
  Draft:      "bg-gray-100 text-gray-600 border-gray-200",
  Cancelled:  "bg-red-50 text-red-600 border-red-200",
  Returned:   "bg-orange-50 text-orange-600 border-orange-200",
};

const DELIVERY_STYLE: Record<string, string> = {
  Delivered:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  Shipped:    "bg-blue-50 text-blue-700 border-blue-200",
  Processing: "bg-amber-50 text-amber-700 border-amber-200",
  Pending:    "bg-gray-100 text-gray-600 border-gray-200",
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLE[status] ?? "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11.5px] font-medium border", style)}>
      {status}
    </span>
  );
}

export function DeliveryBadge({ status }: { status?: string }) {
  if (!status) return null;
  const style = DELIVERY_STYLE[status] ?? "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11.5px] font-medium border", style)}>
      {status}
    </span>
  );
}
