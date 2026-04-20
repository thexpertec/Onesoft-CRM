import { useState, useMemo, useEffect, useCallback } from "react";
import { Product, ProductVariant, getBrands, getProductCategories, getUnits, getProductDepartments, getAttributes, generateEan13 } from "@/lib/store";
import { getSettingsCurrencySymbol, getSettingsDecimalPlaces } from "@/lib/currencies";
import { useToast } from "@/hooks/use-toast";
import { useBarcodeLookup } from "@/hooks/use-barcode-lookup";
import { BarcodePreview } from "@/components/barcode-preview";
import BarcodeScanner from "@/components/barcode-scanner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, Package, Camera, Search, CheckCircle, XCircle, Loader2, Wand2, Printer, Layers, ImageIcon } from "lucide-react";
import { printBarcodeLabels } from "@/lib/print-barcode";
import { MediaPickerDialog } from "@/components/media-picker-dialog";


type FormFields = {
  name: string; localName: string; model: string; sku: string; barcode: string; brand: string;
  category: string; subcategory: string; department: string; unit: string;
  purchasePrice: string; costPrice: string; price: string; wholesalePrice: string;
  clubcardPrice: string; websitePrice: string; websitePriceWas: string;
  commissionPct: string; openingStock: string; stockAlertValue: string;
  status: string; condition: string; description: string;
};

const toForm = (p: Product): FormFields => ({
  name:            p.name ?? "",
  localName:       p.localName ?? "",
  model:           (p as Record<string, unknown>).model as string ?? "",
  sku:             p.sku ?? "",
  barcode:         p.barcode ?? "",
  brand:           p.brand ?? "",
  category:        p.category ?? "",
  subcategory:     p.subcategory ?? "",
  department:      p.department ?? "",
  unit:            p.unit ?? "",
  purchasePrice:   p.purchasePrice ?? "",
  costPrice:       p.costPrice ?? "",
  price:           p.price ?? "",
  wholesalePrice:  p.wholesalePrice ?? "",
  clubcardPrice:   p.clubcardPrice ?? "",
  websitePrice:    p.websitePrice ?? "",
  websitePriceWas: p.websitePriceWas ?? "",
  commissionPct:   p.commissionPct ?? "",
  openingStock:    p.openingStock ?? "",
  stockAlertValue: p.stockAlertValue ?? "",
  status:          p.status ?? "Active",
  condition:       p.condition ?? "",
  description:     p.description ?? "",
});

const Divider = ({ label }: { label: string }) => (
  <div className="flex items-center gap-3 pt-1">
    <div className="h-px flex-1 bg-border" />
    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground shrink-0">{label}</span>
    <div className="h-px flex-1 bg-border" />
  </div>
);

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <label className="text-[12px] font-semibold text-foreground">{label}</label>
    {children}
    {hint && <p className="text-[10px] text-muted-foreground leading-tight">{hint}</p>}
  </div>
);

const NativeSelect = ({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) => (
  <select value={value} onChange={e => onChange(e.target.value)}
    className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
    {children}
  </select>
);

interface Props {
  product: Product | null;
  open: boolean;
  onClose: () => void;
  editProduct: (id: string, updates: Partial<Product>) => void;
}

export function ProductEditSheet({ product, open, onClose, editProduct }: Props) {
  const { toast } = useToast();
  const sym = useMemo(() => getSettingsCurrencySymbol(), []);
  const dp  = getSettingsDecimalPlaces();

  const [form, setForm] = useState<FormFields>(product ? toForm(product) : {} as FormFields);
  const [clubcardBogo, setClubcardBogo] = useState<boolean>(product?.clubcardBogo ?? false);
  const [saving, setSaving] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [pickerVariantId, setPickerVariantId] = useState<string | null>(null);

  const allAttrs = useMemo(() => getAttributes().filter(a => a.values.trim() && a.active !== false), []);
  const [selectedAttrName, setSelectedAttrName] = useState<string>(product?.productAttributes?.[0] ?? "");
  const [variants, setVariants] = useState<ProductVariant[]>(product?.variants ?? []);
  const [selectedValues, setSelectedValues] = useState<Set<string>>(
    () => new Set((product?.variants ?? []).map(v => Object.values(v.attributes)[0] ?? "").filter(Boolean))
  );

  const { loading: lookupLoading, found, result: lookupResult, lookup, reset: resetLookup } = useBarcodeLookup();

  useEffect(() => {
    if (product) {
      setForm(toForm(product));
      setClubcardBogo(product.clubcardBogo ?? false);
      resetLookup();
      setSelectedAttrName(product.productAttributes?.[0] ?? "");
      setVariants(product.variants ?? []);
      setSelectedValues(new Set((product.variants ?? []).map(v => Object.values(v.attributes)[0] ?? "").filter(Boolean)));
    }
  }, [product?.id]);

  // All values for the currently selected attribute
  const attrValues = useMemo(() => {
    if (!selectedAttrName) return [];
    const attr = allAttrs.find(a => a.name === selectedAttrName);
    return attr ? [...new Set(attr.values.split(",").map(v => v.trim()).filter(Boolean))] : [];
  }, [selectedAttrName, allAttrs]);

  // Select / deselect an attribute type
  const handleSelectAttr = useCallback((name: string) => {
    const next = selectedAttrName === name ? "" : name;
    setSelectedAttrName(next);
    if (!next) {
      setSelectedValues(new Set());
      setVariants([]);
    } else {
      // Switching attribute: keep only variants that belong to this attribute
      setVariants(prev => {
        const kept = prev.filter(v => Object.keys(v.attributes)[0] === next);
        setSelectedValues(new Set(kept.map(v => Object.values(v.attributes)[0] ?? "").filter(Boolean)));
        return kept;
      });
    }
  }, [selectedAttrName]);

  // Toggle an individual attribute value on/off
  const toggleValue = useCallback((val: string) => {
    setSelectedValues(prev => {
      const next = new Set(prev);
      if (next.has(val)) {
        next.delete(val);
        setVariants(vs => vs.filter(v => Object.values(v.attributes)[0] !== val));
      } else {
        next.add(val);
        setVariants(vs => {
          if (vs.find(v => Object.values(v.attributes)[0] === val)) return vs;
          return [...vs, { id: crypto.randomUUID(), attributes: { [selectedAttrName]: val }, price: "", image: "" }];
        });
      }
      return next;
    });
  }, [selectedAttrName]);

  // Select all / clear all values for current attribute
  const selectAllValues = useCallback(() => {
    setSelectedValues(new Set(attrValues));
    setVariants(prev => {
      const map = new Map(prev.map(v => [Object.values(v.attributes)[0] ?? "", v]));
      return attrValues.map(val =>
        map.get(val) ?? { id: crypto.randomUUID(), attributes: { [selectedAttrName]: val }, price: "", image: "" }
      );
    });
  }, [attrValues, selectedAttrName]);

  const clearAllValues = useCallback(() => {
    setSelectedValues(new Set());
    setVariants([]);
  }, []);

  const selectAttr = handleSelectAttr; // keep compat alias (unused externally)

  const patchVariantPrice = (id: string, price: string) =>
    setVariants(prev => prev.map(v => v.id === id ? { ...v, price } : v));

  const patchVariantImage = (id: string, image: string) =>
    setVariants(prev => prev.map(v => v.id === id ? { ...v, image } : v));

  const patch = (key: keyof FormFields, value: string) => setForm(p => ({ ...p, [key]: value }));

  const handleBarcodeLookup = async (code?: string) => {
    const barcode = (code ?? form.barcode ?? "").trim();
    if (!barcode) return;
    const res = await lookup(barcode);
    if (res) {
      setForm(p => ({
        ...p,
        name:     res.name     || p.name,
        brand:    res.brand    || p.brand,
        category: res.category || p.category,
        description: res.description || p.description,
      }));
      toast({ title: "Product found", description: `Filled from barcode: ${barcode}` });
    } else {
      toast({ title: "Not found", description: `No data for barcode: ${barcode}`, variant: "destructive" });
    }
  };

  const handleScan = (code: string) => {
    setScanOpen(false);
    patch("barcode", code);
    resetLookup();
    handleBarcodeLookup(code);
  };

  const handlePrintBarcode = () => {
    const barcode = (form.barcode || product?.barcode || generateEan13()).trim();
    printBarcodeLabels([{
      name: form.name || product?.name || "Product",
      localName: form.localName || undefined,
      barcode,
      sku: form.sku || undefined,
      price: form.price || undefined,
      brand: form.brand || undefined,
    }], 3, sym);
  };

  const brandOptions    = useMemo(() => getBrands().map(b => b.name), []);
  const categoryOptions = useMemo(() => {
    return getProductCategories().filter(c => !c.parentId).map(c => c.name);
  }, []);
  const unitOptions       = useMemo(() => getUnits().map(u => u.symbol ? `${u.name} (${u.symbol})` : u.name), []);
  const departmentOptions = useMemo(() => getProductDepartments().map(d => d.name), []);
  const subCatOptions     = useMemo(() => {
    const allCats = getProductCategories();
    const parent  = allCats.find(c => !c.parentId && c.name === form.category);
    return parent ? allCats.filter(c => c.parentId === parent.id).map(c => c.name) : [];
  }, [form.category]);

  const retailProfit = (() => {
    const cost = parseFloat(form.costPrice); const retail = parseFloat(form.price);
    return !isNaN(cost) && !isNaN(retail) ? retail - cost : null;
  })();
  const wsProfit = (() => {
    const cost = parseFloat(form.costPrice); const ws = parseFloat(form.wholesalePrice);
    return !isNaN(cost) && !isNaN(ws) ? ws - cost : null;
  })();
  const commissionAmt = (() => {
    const retail = parseFloat(form.price); const pct = parseFloat(form.commissionPct);
    return !isNaN(retail) && retail > 0 && !isNaN(pct) && pct > 0 ? (retail * pct / 100).toFixed(dp) : null;
  })();

  const ProfitBadge = ({ profit, label }: { profit: number | null; label: string }) => (
    <div className="space-y-1">
      <label className="text-[12px] font-semibold text-muted-foreground">{label}</label>
      <div className={`h-9 flex items-center justify-center px-2 rounded-md border border-dashed text-[12px] font-bold tabular-nums
        ${profit === null ? "border-border text-muted-foreground/30" :
          profit > 0 ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300" :
          profit < 0 ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 text-red-600" :
          "border-border text-muted-foreground"}`}>
        {profit !== null
          ? <>{profit > 0 ? "+" : ""}{sym}{profit.toFixed(dp)}{profit !== 0 && parseFloat(form.costPrice) > 0 ? <span className="text-[10px] ml-1 opacity-70">{((profit / parseFloat(form.costPrice)) * 100).toFixed(0)}%</span> : null}</>
          : "—"}
      </div>
      <p className="text-[10px] text-muted-foreground leading-tight">{label === "Retail Profit" ? "Retail − Cost" : "WS − Cost"}</p>
    </div>
  );

  const handleSave = () => {
    if (!product) return;
    if (!form.name.trim()) { toast({ title: "Product name is required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      editProduct(product.id, {
        name:              form.name,
        localName:         form.localName || undefined,
        sku:               form.sku,
        barcode:           form.barcode || undefined,
        brand:             form.brand,
        category:          form.category,
        subcategory:       form.subcategory || undefined,
        department:        form.department || undefined,
        unit:              form.unit,
        purchasePrice:     form.purchasePrice,
        costPrice:         form.costPrice,
        price:             form.price,
        wholesalePrice:    form.wholesalePrice,
        clubcardPrice:     form.clubcardPrice || undefined,
        clubcardBogo:      clubcardBogo || undefined,
        websitePrice:      form.websitePrice || undefined,
        websitePriceWas:   form.websitePriceWas || undefined,
        commissionPct:     form.commissionPct || undefined,
        openingStock:      form.openingStock || undefined,
        stockAlertValue:   form.stockAlertValue || undefined,
        status:            (form.status as Product["status"]) || "Active",
        condition:         (form.condition as Product["condition"]) || undefined,
        description:       form.description,
        productAttributes: selectedAttrName ? [selectedAttrName] : undefined,
        variants:          variants.length ? variants : undefined,
      });
      toast({ title: "Product updated", description: `"${form.name}" saved successfully.` });
      onClose();
    } catch (err: unknown) {
      toast({ title: "Cannot update product", description: err instanceof Error ? err.message : "An error occurred.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  if (!product) return null;

  return (
    <>
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-5 bg-gradient-to-r from-blue-600 to-indigo-600 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
            <Package size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <SheetHeader className="p-0">
              <SheetTitle className="text-[16px] font-bold text-white leading-snug text-left">Edit Product</SheetTitle>
            </SheetHeader>
            <p className="text-[12px] text-blue-100 truncate mt-0.5">
              {form.name?.trim() || product.name}
            </p>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          <Field label="Product Name *">
            <Input autoFocus placeholder="e.g. Oak Dining Table" value={form.name}
              onChange={e => patch("name", e.target.value)} className="h-10 text-[15px] font-medium" />
          </Field>

          <Field label="Local Name" hint="Optional alternate or local language name">
            <Input placeholder="e.g. مقامی نام / 本地名称" value={form.localName}
              onChange={e => patch("localName", e.target.value)} className="h-9 text-sm" />
          </Field>

          <Divider label="Identity" />

          {/* SKU + Barcode — flex row: SKU fixed width, Barcode takes remaining space */}
          <div className="flex gap-3 items-start">
            <div className="w-36 shrink-0 space-y-1">
              <label className="text-[12px] font-semibold text-foreground">SKU</label>
              <Input value={form.sku} onChange={e => patch("sku", e.target.value)}
                placeholder="ODT-001" className="h-9 text-sm font-mono" />
            </div>

            {/* ── Barcode field with scan + lookup ── */}
            <div className="flex-1 min-w-0 space-y-1">
              <label className="text-[12px] font-semibold text-foreground">Barcode / QR</label>
              <div className="flex gap-1.5">
                <Input
                  value={form.barcode}
                  onChange={e => { patch("barcode", e.target.value); resetLookup(); }}
                  onKeyDown={e => { if (e.key === "Enter") handleBarcodeLookup(); }}
                  placeholder="Scan, type, or generate…"
                  className="h-9 text-sm font-mono flex-1 min-w-0"
                />
                <Button size="sm" variant="outline" className="h-9 px-2 shrink-0" title="Scan with camera"
                  onClick={() => setScanOpen(true)}>
                  <Camera size={14} />
                </Button>
                <Button size="sm" variant="outline" className="h-9 px-2 shrink-0" title="Lookup product info"
                  onClick={() => handleBarcodeLookup()} disabled={!(form.barcode ?? "").trim() || lookupLoading}>
                  {lookupLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                </Button>
                <Button size="sm" variant="outline" className="h-9 px-2 shrink-0" title="Auto-generate EAN-13"
                  onClick={() => { patch("barcode", generateEan13()); resetLookup(); }}>
                  <Wand2 size={14} />
                </Button>
                <Button size="sm" variant="outline" className="h-9 px-2 shrink-0" title="Print barcode label"
                  onClick={handlePrintBarcode}>
                  <Printer size={14} />
                </Button>
              </div>
              {found === true && lookupResult && (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                  <CheckCircle size={12} />
                  <span>Found: {lookupResult.name || "—"} · Brand: {lookupResult.brand || "—"} · Category: {lookupResult.category || "—"}</span>
                </div>
              )}
              {found === false && (
                <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                  <XCircle size={12} />
                  <span>No product data found for this barcode</span>
                </div>
              )}
              {(form.barcode ?? "").trim() && (
                <div className="rounded-md border border-border bg-muted/30 px-2 py-1">
                  <BarcodePreview value={form.barcode ?? ""} />
                </div>
              )}
            </div>
          </div>

          {/* Identity fields — 2-column grid gives each field ~50% of the form width */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Brand">
              {brandOptions.length > 0 ? (
                <NativeSelect value={form.brand} onChange={v => patch("brand", v)}>
                  <option value="">— select —</option>
                  {brandOptions.map(o => <option key={o} value={o}>{o}</option>)}
                </NativeSelect>
              ) : (
                <Input value={form.brand} onChange={e => patch("brand", e.target.value)}
                  placeholder="Brand name" className="h-9 text-sm" />
              )}
            </Field>
            <Field label="Category">
              {categoryOptions.length > 0 ? (
                <NativeSelect value={form.category} onChange={v => { patch("category", v); patch("subcategory", ""); }}>
                  <option value="">— select —</option>
                  {categoryOptions.map(o => <option key={o} value={o}>{o}</option>)}
                </NativeSelect>
              ) : (
                <Input value={form.category} onChange={e => { patch("category", e.target.value); patch("subcategory", ""); }}
                  placeholder="Category" className="h-9 text-sm" />
              )}
            </Field>
            <Field label="Subcategory">
              {subCatOptions.length > 0 ? (
                <NativeSelect value={form.subcategory} onChange={v => patch("subcategory", v)}>
                  <option value="">— select —</option>
                  {subCatOptions.map(o => <option key={o} value={o}>{o}</option>)}
                </NativeSelect>
              ) : (
                <Input value={form.subcategory} onChange={e => patch("subcategory", e.target.value)}
                  placeholder="Subcategory" className="h-9 text-sm" />
              )}
            </Field>
            <Field label="Department">
              {departmentOptions.length > 0 ? (
                <NativeSelect value={form.department} onChange={v => patch("department", v)}>
                  <option value="">— select —</option>
                  {departmentOptions.map(o => <option key={o} value={o}>{o}</option>)}
                </NativeSelect>
              ) : (
                <Input value={form.department} onChange={e => patch("department", e.target.value)}
                  placeholder="e.g. Electronics" className="h-9 text-sm" />
              )}
            </Field>
            <Field label="Model" hint="Model number / reference">
              <Input value={form.model} onChange={e => patch("model", e.target.value)}
                placeholder="e.g. XPS-15-9530" className="h-9 text-sm" />
            </Field>
            <Field label="Unit">
              {unitOptions.length > 0 ? (
                <NativeSelect value={form.unit} onChange={v => patch("unit", v)}>
                  <option value="">— select —</option>
                  {unitOptions.map(o => <option key={o} value={o}>{o}</option>)}
                </NativeSelect>
              ) : (
                <Input value={form.unit} onChange={e => patch("unit", e.target.value)}
                  placeholder="pcs / kg / m²" className="h-9 text-sm" />
              )}
            </Field>
          </div>

          <Divider label="Status & Condition" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-foreground">Status</label>
              <div className="flex gap-2">
                {(["Active","Inactive","Draft"] as const).map(s => (
                  <button key={s} type="button" onClick={() => patch("status", s)}
                    className={`flex-1 h-9 rounded-lg text-[13px] font-semibold transition-all border ${
                      form.status === s
                        ? s === "Active"   ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                        : s === "Inactive" ? "bg-amber-500 border-amber-500 text-white shadow-sm"
                        :                   "bg-slate-500 border-slate-500 text-white shadow-sm"
                        : "bg-background border-border text-muted-foreground hover:border-gray-400 hover:text-foreground"
                    }`}>{s}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-foreground">Condition <span className="text-muted-foreground font-normal text-[11px]">(optional)</span></label>
              <div className="flex gap-1.5">
                {(["New","Used","Fresh","Refurbished","Damaged"] as const).map(c => (
                  <button key={c} type="button" onClick={() => patch("condition", form.condition === c ? "" : c)}
                    className={`flex-1 h-9 rounded-lg text-[10px] font-semibold transition-all border ${
                      form.condition === c
                        ? c === "New"         ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                        : c === "Used"        ? "bg-amber-500 border-amber-500 text-white shadow-sm"
                        : c === "Fresh"       ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                        : c === "Refurbished" ? "bg-violet-600 border-violet-600 text-white shadow-sm"
                        :                       "bg-red-500 border-red-500 text-white shadow-sm"
                        : "bg-background border-border text-muted-foreground hover:border-gray-400 hover:text-foreground"
                    }`}>{c}</button>
                ))}
              </div>
            </div>
          </div>

          <Divider label="Pricing" />

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field label={`Purchase (${sym})`} hint="Supplier cost">
              <Input type="number" min="0" step="0.01" value={form.purchasePrice}
                onChange={e => patch("purchasePrice", e.target.value)}
                placeholder="0.00" className="h-9 text-sm tabular-nums" />
            </Field>
            <Field label={`Cost (${sym})`} hint="Incl. overheads">
              <Input type="number" min="0" step="0.01" value={form.costPrice}
                onChange={e => patch("costPrice", e.target.value)}
                placeholder="0.00" className="h-9 text-sm tabular-nums" />
            </Field>
            <Field label={`Retail (${sym})`} hint="Sale price">
              <Input type="number" min="0" step="0.01" value={form.price}
                onChange={e => patch("price", e.target.value)}
                placeholder="0.00" className="h-9 text-sm tabular-nums" />
            </Field>
            <ProfitBadge profit={retailProfit} label="Retail Profit" />
            <Field label={`Wholesale (${sym})`} hint="Bulk / trade">
              <Input type="number" min="0" step="0.01" value={form.wholesalePrice}
                onChange={e => patch("wholesalePrice", e.target.value)}
                placeholder="0.00" className="h-9 text-sm tabular-nums" />
            </Field>
            <ProfitBadge profit={wsProfit} label="WS Profit" />
            <Field label={`Clubcard (${sym})`} hint="Member price">
              <Input type="number" min="0" step="0.01" value={form.clubcardPrice}
                onChange={e => patch("clubcardPrice", e.target.value)}
                placeholder="0.00" className="h-9 text-sm tabular-nums" />
            </Field>
            <div className="space-y-1 col-span-2">
              <button
                type="button"
                onClick={() => setClubcardBogo(v => !v)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[12px] font-semibold transition-all w-full justify-between
                  ${clubcardBogo
                    ? "border-teal-400 bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300"
                    : "border-input bg-background text-muted-foreground hover:border-teal-300 hover:text-teal-600"
                  }`}>
                <span>Buy 1 Get 1 Free <span className="text-[10px] font-bold uppercase tracking-wider opacity-60 ml-1">Clubcard Option 2</span></span>
                <span className={`w-8 h-4 rounded-full relative inline-block transition-colors ${clubcardBogo ? "bg-teal-500" : "bg-muted"}`}>
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all ${clubcardBogo ? "left-4" : "left-0.5"}`} />
                </span>
              </button>
              {clubcardBogo && (
                <p className="text-[10px] text-teal-600 dark:text-teal-400 leading-tight">
                  Clubcard members get every 2nd unit free (Buy 1 Get 1 Free). Shown on website and applied at POS.
                </p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-[12px] font-semibold text-foreground">Commission</label>
              <div className="relative">
                <Input type="number" min="0" max="100" step="0.1"
                  value={form.commissionPct} onChange={e => patch("commissionPct", e.target.value)}
                  placeholder="0" className="h-9 text-sm pr-6 tabular-nums" />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-muted-foreground pointer-events-none">%</span>
              </div>
              {commissionAmt
                ? <p className="text-[10px] text-violet-600 dark:text-violet-400 font-medium leading-tight">{sym}{commissionAmt}/sale</p>
                : <p className="text-[10px] text-muted-foreground leading-tight">Agent's cut</p>}
            </div>
          </div>

          <Divider label="Website Pricing" />

          <div className="grid grid-cols-2 gap-3">
            <Field label={`Website Price (${sym})`} hint="Online selling price">
              <Input type="number" min="0" step="0.01" value={form.websitePrice}
                onChange={e => patch("websitePrice", e.target.value)}
                placeholder="0.00" className="h-9 text-sm tabular-nums" />
            </Field>
            <Field label={`Was Price (${sym})`} hint="Crossed-out price">
              <Input type="number" min="0" step="0.01" value={form.websitePriceWas}
                onChange={e => patch("websitePriceWas", e.target.value)}
                placeholder="0.00" className="h-9 text-sm tabular-nums" />
            </Field>
          </div>

          <Divider label="Variants" />

          {allAttrs.length === 0 ? (
            <p className="text-[11px] text-muted-foreground text-center py-2">
              No attributes with values yet — go to <strong>Attributes</strong> and add comma-separated values.
            </p>
          ) : (
            <div className="space-y-3">
              {/* ── Attribute type selector ── */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Select one attribute</label>
                <div className="flex flex-wrap gap-2">
                  {allAttrs.map(a => {
                    const active = selectedAttrName === a.name;
                    return (
                      <button key={a.id} type="button" onClick={() => handleSelectAttr(a.name)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-medium border transition-all ${
                          active
                            ? "bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-600/20"
                            : "bg-background border-border text-muted-foreground hover:border-blue-400 hover:text-blue-600"
                        }`}>
                        <Layers size={11} />
                        {a.name}
                        <span className="opacity-60 text-[10px]">({a.values.split(",").map(v=>v.trim()).filter(Boolean).length})</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Value chips — shown when an attribute is selected ── */}
              {selectedAttrName && attrValues.length > 0 && (
                <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {selectedAttrName} values
                      <span className="ml-1.5 text-[10px] font-normal normal-case">
                        ({selectedValues.size} of {attrValues.length} selected)
                      </span>
                    </span>
                    <div className="flex items-center gap-3 text-[11px]">
                      <button type="button" onClick={selectAllValues}
                        className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                        Select all
                      </button>
                      <button type="button" onClick={clearAllValues}
                        className="text-muted-foreground hover:text-foreground hover:underline">
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {attrValues.map(val => {
                      const active = selectedValues.has(val);
                      return (
                        <button key={val} type="button" onClick={() => toggleValue(val)}
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-medium border transition-all active:scale-95 ${
                            active
                              ? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 shadow-sm"
                              : "bg-background border-border text-muted-foreground hover:border-blue-300 hover:text-blue-600 dark:hover:border-blue-600 dark:hover:text-blue-400"
                          }`}>
                          {active && <span className="mr-1 text-[10px]">✓</span>}
                          {val}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {variants.length > 0 && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="flex bg-muted/50 border-b border-border px-3 py-2 gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <span className="flex-1">Name</span>
                    <span className="w-[82px] shrink-0 text-right">Price ({sym})</span>
                    <span className="w-[90px] shrink-0">Image</span>
                  </div>
                  <div className="divide-y divide-border max-h-72 overflow-y-auto">
                    {variants.map(v => {
                      const label = Object.values(v.attributes)[0] ?? "—";
                      return (
                        <div key={v.id} className="flex items-center px-3 py-1.5 gap-2 hover:bg-muted/30 transition-colors">
                          <span className="flex-1 text-[12px] font-medium px-2 py-0.5 rounded-full text-center truncate text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/50">
                            {label}
                          </span>
                          <Input
                            type="number" min="0" step="0.01"
                            value={v.price}
                            onChange={e => patchVariantPrice(v.id, e.target.value)}
                            placeholder={form.price || "0.00"}
                            className="h-7 w-[82px] shrink-0 text-xs tabular-nums text-right px-2"
                          />
                          <div className="flex items-center gap-1.5 w-[90px] shrink-0">
                            <button type="button"
                              onClick={() => setPickerVariantId(v.id)}
                              className="flex items-center gap-1.5 h-7 px-2 rounded border border-dashed border-border bg-muted/40 hover:bg-blue-50 hover:border-blue-400 dark:hover:bg-blue-950/30 dark:hover:border-blue-600 transition-colors text-[10px] text-muted-foreground hover:text-blue-600 w-full">
                              {v.image ? (
                                <img src={v.image} alt={label}
                                  className="w-5 h-5 rounded object-cover border border-border shrink-0" />
                              ) : (
                                <ImageIcon size={11} className="shrink-0 opacity-50" />
                              )}
                              <span className="truncate">{v.image ? "Change" : "Image…"}</span>
                            </button>
                            {v.image && (
                              <button type="button" onClick={() => patchVariantImage(v.id, "")}
                                className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-red-500 transition-colors shrink-0">
                                <ImageIcon size={9} className="opacity-40" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedAttrName && variants.length === 0 && (
                <p className="text-[11px] text-muted-foreground text-center py-1">
                  This attribute has no values defined yet.
                </p>
              )}
            </div>
          )}

          <Divider label="Stock & Notes" />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Opening Stock" hint="Initial qty">
              <Input type="number" min="0" step="1" value={form.openingStock}
                onChange={e => patch("openingStock", e.target.value)}
                placeholder="0" className="h-9 text-sm tabular-nums" />
            </Field>
            <Field label="Alert Level" hint="Low-stock trigger">
              <Input type="number" min="0" step="1" value={form.stockAlertValue}
                onChange={e => patch("stockAlertValue", e.target.value)}
                placeholder="0" className="h-9 text-sm tabular-nums" />
            </Field>
          </div>

          <div className="space-y-1">
            <label className="text-[12px] font-semibold text-foreground">Description</label>
            <textarea value={form.description} onChange={e => patch("description", e.target.value)}
              placeholder="Optional product description, features, specifications…" rows={3}
              className="w-full px-3 py-2.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          </div>

        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-border bg-muted/20 shrink-0">
          <Button variant="outline" onClick={onClose} className="h-10 px-6 text-[13px]">Cancel</Button>
          <Button onClick={handleSave} disabled={saving}
            className="flex-1 h-10 font-semibold text-[13px] bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white border-0 shadow-sm gap-2">
            <Save size={15} /> {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>

    <BarcodeScanner
      open={scanOpen}
      onClose={() => setScanOpen(false)}
      onScan={handleScan}
      title="Scan Product Barcode"
      hint="Point the camera at the product's barcode to auto-fill product details"
    />

    <MediaPickerDialog
      open={pickerVariantId !== null}
      onClose={() => setPickerVariantId(null)}
      onSelect={url => {
        if (pickerVariantId) patchVariantImage(pickerVariantId, url);
        setPickerVariantId(null);
      }}
      currentUrl={pickerVariantId ? (variants.find(v => v.id === pickerVariantId)?.image ?? "") : ""}
      title="Select Variant Image"
    />
    </>
  );
}
