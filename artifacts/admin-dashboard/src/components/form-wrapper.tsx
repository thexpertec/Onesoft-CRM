import { useState } from "react";
import { PanelRight, Maximize2, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { getSettings } from "@/lib/store";

// ── Shared "dialog or side-panel" wrapper ────────────────────────────────────
interface FormWrapperProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "dialog" | "sheet";
  /** Sizing/layout classes for the DialogContent (width, max-width, max-height, flex).
   *  Defaults to "w-[min(98vw,920px)] max-w-none". */
  dialogClass?: string;
  children: React.ReactNode;
}

export function FormWrapper({ open, onOpenChange, mode, dialogClass, children }: FormWrapperProps) {
  if (mode === "sheet") {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-[min(98vw,880px)] max-w-none flex flex-col p-0 overflow-hidden [&>button:last-of-type]:hidden"
        >
          {children}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          (dialogClass ?? "w-[min(98vw,920px)] max-w-none") +
          " p-0 overflow-hidden gap-0 [&>button:last-of-type]:hidden"
        }
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

// ── Toggle + Close button group ───────────────────────────────────────────────
interface FormModeToggleProps {
  mode: "dialog" | "sheet";
  onToggle: () => void;
  onClose: () => void;
  className?: string;
}

export function FormModeToggle({ mode, onToggle, onClose, className = "" }: FormModeToggleProps) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={onToggle}
        title={mode === "dialog" ? "Switch to side panel" : "Switch to dialog"}
        className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
      >
        {mode === "dialog" ? <PanelRight size={14} /> : <Maximize2 size={14} />}
      </button>
      <button
        type="button"
        onClick={onClose}
        title="Close"
        className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ── Hook: persist preference in localStorage ──────────────────────────────────
// Priority: per-module localStorage key → global setting (crmFormMode) → "dialog"
export function useFormMode(storageKey = "os-form-mode"): ["dialog" | "sheet", () => void] {
  const [mode, setMode] = useState<"dialog" | "sheet">(() => {
    const perModule = localStorage.getItem(storageKey) as "dialog" | "sheet" | null;
    if (perModule === "dialog" || perModule === "sheet") return perModule;
    return getSettings().crmFormMode ?? "dialog";
  });
  const toggle = () => {
    const next = mode === "dialog" ? "sheet" : "dialog";
    setMode(next);
    try { localStorage.setItem(storageKey, next); } catch { /* quota */ }
  };
  return [mode, toggle];
}

// ── CRM_FORM_MODE_KEYS: all per-module localStorage keys ─────────────────────
export const CRM_FORM_MODE_KEYS = [
  "os-form-mode",
  "shareholders-form-mode",
  "rp-form-mode",
  "suppliers-form-mode",
  "customers-form-mode",
  "agents-form-mode",
  "staff-form-mode",
];
