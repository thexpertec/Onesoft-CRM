import { cn } from "@/lib/utils";

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
