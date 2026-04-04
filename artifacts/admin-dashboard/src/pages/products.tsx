import { Package } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function ProductsPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Package className="w-6 h-6 text-primary" /> Products & Services
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Manage your product and service catalogue.
        </p>
      </div>

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
          <Package className="w-16 h-16 opacity-15" />
          <div className="text-center space-y-1">
            <p className="text-base font-medium text-foreground">Coming Soon</p>
            <p className="text-sm">
              The Products &amp; Services module is under construction.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
