import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

interface BarcodePreviewProps {
  value: string;
  className?: string;
}

export function BarcodePreview({ value, className = "" }: BarcodePreviewProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !value?.trim()) return;
    try {
      JsBarcode(svgRef.current, value.trim(), {
        format: "AUTO",
        width: 1.6,
        height: 42,
        displayValue: true,
        fontSize: 10,
        margin: 6,
        background: "transparent",
        lineColor: "currentColor",
      });
    } catch {
      if (svgRef.current) svgRef.current.innerHTML = "";
    }
  }, [value]);

  if (!value?.trim()) return null;

  return (
    <div className={`flex justify-center py-2 ${className}`}>
      <svg ref={svgRef} className="text-foreground" />
    </div>
  );
}
