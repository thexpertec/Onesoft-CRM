import { useState, useMemo, useCallback, useRef } from "react";
import { format } from "date-fns";
import { Calculator, Plus, Trash2, Printer, FileSpreadsheet, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useProducts } from "@/hooks/use-data";
import { getCustomers, getSettings } from "@/lib/store";
import { getSettingsCurrencySymbol } from "@/lib/currencies";
import { downloadExcel } from "@/lib/export-excel";

// ── Types ──────────────────────────────────────────────────────────────────────
type RowType = "size" | "qty";
type SizeUnit = "in" | "ft" | "cm" | "m";

type CalcRow = {
  id: string;
  productId: string;
  productName: string;
  rowType: RowType;
  height: string;
  width: string;
  sizeUnit: SizeUnit;
  qty: string;
  unit: string;
  rate: string;
  description: string;
};

function makeId() { return Math.random().toString(36).slice(2, 10); }

function makeInvoiceNumber() {
  const now = new Date();
  const yymm = format(now, "yyyyMM");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `CINV-${yymm}-${rand}`;
}

function blankRow(): CalcRow {
  return {
    id: makeId(), productId: "", productName: "", rowType: "qty",
    height: "", width: "", sizeUnit: "ft",
    qty: "1", unit: "", rate: "", description: "",
  };
}

const SIZE_UNIT_LABELS: Record<SizeUnit, string> = { in: "inches", ft: "feet", cm: "cm", m: "meters" };

// ── Calculations ───────────────────────────────────────────────────────────────
function rowArea(row: CalcRow): number {
  if (row.rowType !== "size") return 0;
  const h = parseFloat(row.height) || 0;
  const w = parseFloat(row.width) || 0;
  return h * w;
}

function rowAmount(row: CalcRow): number {
  const rate = parseFloat(row.rate) || 0;
  if (row.rowType === "size") return rowArea(row) * rate;
  return (parseFloat(row.qty) || 0) * rate;
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function CalcInvoicePage() {
  const { products } = useProducts();
  const sym = getSettingsCurrencySymbol();
  const settings = useMemo(() => getSettings(), []);
  const customers = useMemo(() => getCustomers(), []);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [invoiceNumber, setInvoiceNumber] = useState(makeInvoiceNumber);
  const [invoiceDate,   setInvoiceDate]   = useState(format(new Date(), "yyyy-MM-dd"));
  const [dueDate,       setDueDate]       = useState("");
  const [customerId,    setCustomerId]    = useState("");
  const [custName,      setCustName]      = useState("");
  const [custAddress,   setCustAddress]   = useState("");
  const [custPhone,     setCustPhone]     = useState("");
  const [custEmail,     setCustEmail]     = useState("");
  const [rows,          setRows]          = useState<CalcRow[]>([blankRow()]);
  const [labourDesc,    setLabourDesc]    = useState("Labour Charges");
  const [labourAmt,     setLabourAmt]     = useState("");
  const [otherDesc,     setOtherDesc]     = useState("Other Charges");
  const [otherAmt,      setOtherAmt]      = useState("");
  const [taxRate,       setTaxRate]       = useState("");
  const [paymentTerms,  setPaymentTerms]  = useState("Due on receipt");
  const [notes,         setNotes]         = useState("");
  const [showPreview,   setShowPreview]   = useState(true);

  const printRef = useRef<HTMLDivElement>(null);

  // ── Derived totals ──────────────────────────────────────────────────────────
  const rowsTotal    = useMemo(() => rows.reduce((s, r) => s + rowAmount(r), 0), [rows]);
  const labourTotal  = parseFloat(labourAmt) || 0;
  const otherTotal   = parseFloat(otherAmt)  || 0;
  const subtotal     = rowsTotal + labourTotal + otherTotal;
  const taxAmount    = subtotal * ((parseFloat(taxRate) || 0) / 100);
  const grandTotal   = subtotal + taxAmount;

  // ── Customer selection ──────────────────────────────────────────────────────
  const handleCustomerChange = useCallback((cid: string) => {
    setCustomerId(cid);
    if (cid === "__manual__") { setCustName(""); setCustAddress(""); setCustPhone(""); setCustEmail(""); return; }
    const cust = customers.find(c => c.id === cid);
    if (cust) {
      setCustName(cust.name);
      setCustAddress([cust.address, cust.city, cust.country].filter(Boolean).join(", "));
      setCustPhone(cust.phone ?? "");
      setCustEmail(cust.email ?? "");
    }
  }, [customers]);

  // ── Row helpers ─────────────────────────────────────────────────────────────
  const updateRow = useCallback((id: string, patch: Partial<CalcRow>) => {
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
  }, []);

  const selectProduct = useCallback((rowId: string, productId: string) => {
    const prod = products.find(p => p.id === productId);
    if (!prod) { updateRow(rowId, { productId: "", productName: "" }); return; }
    updateRow(rowId, {
      productId: prod.id,
      productName: prod.name,
      rate: prod.price ?? "",
      unit: prod.unit ?? "",
    });
  }, [products, updateRow]);

  const addRow = () => setRows(rs => [...rs, blankRow()]);
  const removeRow = (id: string) => setRows(rs => rs.filter(r => r.id !== id));

  // ── Reset ───────────────────────────────────────────────────────────────────
  const resetForm = () => {
    setInvoiceNumber(makeInvoiceNumber());
    setInvoiceDate(format(new Date(), "yyyy-MM-dd"));
    setDueDate(""); setCustomerId(""); setCustName(""); setCustAddress("");
    setCustPhone(""); setCustEmail(""); setRows([blankRow()]);
    setLabourDesc("Labour Charges"); setLabourAmt("");
    setOtherDesc("Other Charges"); setOtherAmt("");
    setTaxRate(""); setPaymentTerms("Due on receipt"); setNotes("");
  };

  // ── Print ───────────────────────────────────────────────────────────────────
  const handlePrint = () => window.print();

  // ── Excel Export ────────────────────────────────────────────────────────────
  const handleExcel = () => {
    type ExRow = { Item: string; Description: string; Type: string; Dimensions: string; Qty: string; Rate: string; Amount: string };
    const data: ExRow[] = rows.map(r => ({
      Item: r.productName || r.description || "—",
      Description: r.description,
      Type: r.rowType === "size" ? "Size-based" : "Quantity-based",
      Dimensions: r.rowType === "size" ? `${r.height} × ${r.width} ${SIZE_UNIT_LABELS[r.sizeUnit]} = ${rowArea(r).toFixed(2)} sq ${r.sizeUnit}` : `${r.qty} ${r.unit}`,
      Rate: `${sym}${parseFloat(r.rate || "0").toFixed(2)}`,
      Amount: `${sym}${rowAmount(r).toFixed(2)}`,
    }));
    if (labourTotal > 0) data.push({ Item: labourDesc, Description: "", Type: "Additional", Dimensions: "", Rate: "", Amount: `${sym}${labourTotal.toFixed(2)}` });
    if (otherTotal  > 0) data.push({ Item: otherDesc,  Description: "", Type: "Additional", Dimensions: "", Rate: "", Amount: `${sym}${otherTotal.toFixed(2)}`  });
    data.push(
      { Item: "Subtotal", Description: "", Type: "", Dimensions: "", Rate: "", Amount: `${sym}${subtotal.toFixed(2)}` },
      { Item: taxRate ? `Tax (${taxRate}%)` : "Tax", Description: "", Type: "", Dimensions: "", Rate: "", Amount: `${sym}${taxAmount.toFixed(2)}` },
      { Item: "TOTAL", Description: "", Type: "", Dimensions: "", Rate: "", Amount: `${sym}${grandTotal.toFixed(2)}` },
    );
    downloadExcel(data, `Invoice-${invoiceNumber}`);
  };

  // ── Shared input styles ──────────────────────────────────────────────────────
  const inp = "h-8 text-[12px] px-2";
  const lbl = "text-[11px] font-semibold text-muted-foreground uppercase tracking-wide";

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-background shrink-0 print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
            <Calculator size={16} className="text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h1 className="text-[16px] font-bold">Calculation Invoice</h1>
            <p className="text-[12px] text-muted-foreground">Size & quantity based invoicing</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground text-[12px]" onClick={resetForm}>
            <RotateCcw size={13} /> Reset
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-[12px]" onClick={() => setShowPreview(p => !p)}>
            {showPreview ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {showPreview ? "Hide Preview" : "Show Preview"}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-[12px]" onClick={handleExcel}>
            <FileSpreadsheet size={13} /> Export Excel
          </Button>
          <Button size="sm" className="gap-1.5 text-[12px] bg-violet-600 hover:bg-violet-700 text-white" onClick={handlePrint}>
            <Printer size={13} /> Print / PDF
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className={`flex-1 overflow-auto flex gap-0 print:block`}>

        {/* ── Left: Form ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 print:hidden min-w-0" style={{ maxWidth: showPreview ? "55%" : "100%" }}>

          {/* Invoice Details */}
          <section className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h2 className="text-[13px] font-bold uppercase tracking-widest text-muted-foreground border-b pb-2">Invoice Details</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label className={lbl}>Invoice No.</Label>
                <Input className={inp} value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className={lbl}>Invoice Date</Label>
                <Input type="date" className={inp} value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className={lbl}>Due Date</Label>
                <Input type="date" className={inp} value={dueDate} onChange={e => setDueDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className={lbl}>Payment Terms</Label>
              <Select value={paymentTerms} onValueChange={setPaymentTerms}>
                <SelectTrigger className={`${inp} w-full`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Due on receipt", "Net 7", "Net 15", "Net 30", "Net 60", "Net 90", "50% Advance"].map(t => (
                    <SelectItem key={t} value={t} className="text-[12px]">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          {/* Customer Details */}
          <section className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h2 className="text-[13px] font-bold uppercase tracking-widest text-muted-foreground border-b pb-2">Client / Customer</h2>
            {customers.length > 0 && (
              <div className="space-y-1">
                <Label className={lbl}>Select from customers</Label>
                <Select value={customerId} onValueChange={handleCustomerChange}>
                  <SelectTrigger className={`${inp} w-full`}><SelectValue placeholder="Choose customer…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__manual__" className="text-[12px] italic">Enter manually</SelectItem>
                    {customers.map(c => (
                      <SelectItem key={c.id} value={c.id} className="text-[12px]">{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label className={lbl}>Name</Label>
                <Input className={inp} placeholder="Client name" value={custName} onChange={e => setCustName(e.target.value)} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className={lbl}>Address</Label>
                <Textarea className="text-[12px] px-2 py-1.5 min-h-[60px] resize-none" placeholder="Street, City, Country" value={custAddress} onChange={e => setCustAddress(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className={lbl}>Phone</Label>
                <Input className={inp} placeholder="+44 000 000 0000" value={custPhone} onChange={e => setCustPhone(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className={lbl}>Email</Label>
                <Input className={inp} placeholder="client@example.com" value={custEmail} onChange={e => setCustEmail(e.target.value)} />
              </div>
            </div>
          </section>

          {/* Line Items */}
          <section className="bg-card rounded-xl border border-border p-5 space-y-3">
            <h2 className="text-[13px] font-bold uppercase tracking-widest text-muted-foreground border-b pb-2">Line Items</h2>

            {rows.map((row, idx) => (
              <div key={row.id} className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Item {idx + 1}</span>
                  <div className="flex items-center gap-2">
                    {/* Type toggle */}
                    <div className="flex rounded-md overflow-hidden border text-[11px] font-semibold">
                      <button
                        onClick={() => updateRow(row.id, { rowType: "size" })}
                        className={`px-2.5 py-1 transition-colors ${row.rowType === "size" ? "bg-violet-600 text-white" : "text-muted-foreground hover:bg-muted"}`}>
                        Size-based
                      </button>
                      <button
                        onClick={() => updateRow(row.id, { rowType: "qty" })}
                        className={`px-2.5 py-1 transition-colors ${row.rowType === "qty" ? "bg-violet-600 text-white" : "text-muted-foreground hover:bg-muted"}`}>
                        Qty-based
                      </button>
                    </div>
                    {rows.length > 1 && (
                      <button onClick={() => removeRow(row.id)} className="p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Row 1: Product & Description */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className={lbl}>Product</Label>
                    <Select value={row.productId} onValueChange={pid => selectProduct(row.id, pid)}>
                      <SelectTrigger className={`${inp} w-full`}><SelectValue placeholder="Select product…" /></SelectTrigger>
                      <SelectContent>
                        {products.map(p => (
                          <SelectItem key={p.id} value={p.id} className="text-[12px]">{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className={lbl}>Item Name / Description</Label>
                    <Input className={inp} placeholder="e.g. White Sheet, Glass Panel…"
                      value={row.productName || row.description}
                      onChange={e => updateRow(row.id, { productName: e.target.value, description: e.target.value })} />
                  </div>
                </div>

                {/* Row 2: Dimensions or Qty + Rate + Amount */}
                {row.rowType === "size" ? (
                  <div className="grid grid-cols-6 gap-2 items-end">
                    <div className="col-span-1 space-y-1">
                      <Label className={lbl}>Height</Label>
                      <Input className={inp} type="number" min="0" step="0.01" placeholder="0"
                        value={row.height} onChange={e => updateRow(row.id, { height: e.target.value })} />
                    </div>
                    <div className="col-span-1 space-y-1">
                      <Label className={lbl}>Width</Label>
                      <Input className={inp} type="number" min="0" step="0.01" placeholder="0"
                        value={row.width} onChange={e => updateRow(row.id, { width: e.target.value })} />
                    </div>
                    <div className="col-span-1 space-y-1">
                      <Label className={lbl}>Unit</Label>
                      <Select value={row.sizeUnit} onValueChange={v => updateRow(row.id, { sizeUnit: v as SizeUnit })}>
                        <SelectTrigger className={`${inp} w-full`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(["in","ft","cm","m"] as SizeUnit[]).map(u => (
                            <SelectItem key={u} value={u} className="text-[12px]">{u}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-1 space-y-1">
                      <Label className={lbl}>Area</Label>
                      <div className={`${inp} flex items-center bg-muted/60 rounded-md border px-2 font-mono`}>
                        {rowArea(row).toFixed(2)} sq {row.sizeUnit}
                      </div>
                    </div>
                    <div className="col-span-1 space-y-1">
                      <Label className={lbl}>Rate / sq {row.sizeUnit}</Label>
                      <Input className={inp} type="number" min="0" step="0.01" placeholder="0.00"
                        value={row.rate} onChange={e => updateRow(row.id, { rate: e.target.value })} />
                    </div>
                    <div className="col-span-1 space-y-1">
                      <Label className={lbl}>Amount</Label>
                      <div className={`${inp} flex items-center bg-violet-50 dark:bg-violet-950/30 rounded-md border border-violet-200 dark:border-violet-800 px-2 font-bold text-violet-700 dark:text-violet-400 font-mono`}>
                        {sym}{rowAmount(row).toFixed(2)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2 items-end">
                    <div className="space-y-1">
                      <Label className={lbl}>Quantity</Label>
                      <Input className={inp} type="number" min="0" step="0.01" placeholder="1"
                        value={row.qty} onChange={e => updateRow(row.id, { qty: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className={lbl}>Unit</Label>
                      <Input className={inp} placeholder="pcs, m², etc."
                        value={row.unit} onChange={e => updateRow(row.id, { unit: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className={lbl}>Unit Rate</Label>
                      <Input className={inp} type="number" min="0" step="0.01" placeholder="0.00"
                        value={row.rate} onChange={e => updateRow(row.id, { rate: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className={lbl}>Amount</Label>
                      <div className={`${inp} flex items-center bg-violet-50 dark:bg-violet-950/30 rounded-md border border-violet-200 dark:border-violet-800 px-2 font-bold text-violet-700 dark:text-violet-400 font-mono`}>
                        {sym}{rowAmount(row).toFixed(2)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            <Button variant="outline" size="sm" className="gap-1.5 text-[12px] w-full" onClick={addRow}>
              <Plus size={13} /> Add Line Item
            </Button>
          </section>

          {/* Additional Charges */}
          <section className="bg-card rounded-xl border border-border p-5 space-y-3">
            <h2 className="text-[13px] font-bold uppercase tracking-widest text-muted-foreground border-b pb-2">Additional Charges</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className={lbl}>Labour — Description</Label>
                <Input className={inp} placeholder="e.g. Sheet Cutting Labour" value={labourDesc} onChange={e => setLabourDesc(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className={lbl}>Labour Amount ({sym})</Label>
                <Input className={inp} type="number" min="0" step="0.01" placeholder="0.00" value={labourAmt} onChange={e => setLabourAmt(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className={lbl}>Other — Description</Label>
                <Input className={inp} placeholder="e.g. Power Supply, Delivery" value={otherDesc} onChange={e => setOtherDesc(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className={lbl}>Other Amount ({sym})</Label>
                <Input className={inp} type="number" min="0" step="0.01" placeholder="0.00" value={otherAmt} onChange={e => setOtherAmt(e.target.value)} />
              </div>
            </div>
          </section>

          {/* Totals & Tax */}
          <section className="bg-card rounded-xl border border-border p-5 space-y-3">
            <h2 className="text-[13px] font-bold uppercase tracking-widest text-muted-foreground border-b pb-2">Tax & Totals</h2>
            <div className="grid grid-cols-2 gap-4 items-end">
              <div className="space-y-1">
                <Label className={lbl}>Tax Rate (%)</Label>
                <Input className={inp} type="number" min="0" max="100" step="0.1" placeholder="e.g. 20 for VAT"
                  value={taxRate} onChange={e => setTaxRate(e.target.value)} />
              </div>
              <div className="space-y-2 text-right text-[13px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Items subtotal</span>
                  <span className="font-mono">{sym}{rowsTotal.toFixed(2)}</span>
                </div>
                {labourTotal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{labourDesc}</span><span className="font-mono">{sym}{labourTotal.toFixed(2)}</span></div>}
                {otherTotal  > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{otherDesc}</span><span className="font-mono">{sym}{otherTotal.toFixed(2)}</span></div>}
                <div className="flex justify-between border-t pt-1">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-mono font-semibold">{sym}{subtotal.toFixed(2)}</span>
                </div>
                {(parseFloat(taxRate) || 0) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax ({taxRate}%)</span>
                    <span className="font-mono">{sym}{taxAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t-2 pt-1 text-[15px]">
                  <span className="font-bold">Total</span>
                  <span className="font-bold font-mono text-violet-700 dark:text-violet-400">{sym}{grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Notes */}
          <section className="bg-card rounded-xl border border-border p-5 space-y-2">
            <h2 className="text-[13px] font-bold uppercase tracking-widest text-muted-foreground border-b pb-2">Notes</h2>
            <Textarea className="text-[12px] px-2 py-1.5 min-h-[80px] resize-none" placeholder="Any additional notes or instructions for the client…" value={notes} onChange={e => setNotes(e.target.value)} />
          </section>
        </div>

        {/* ── Right: Invoice Preview ── */}
        {showPreview && (
          <div className="flex-shrink-0 overflow-y-auto border-l bg-gray-100 dark:bg-zinc-900 p-6 print:p-0 print:bg-white"
               style={{ width: "45%", minWidth: 360 }}>
            <div ref={printRef} id="calc-invoice-preview"
                 className="bg-white text-zinc-900 rounded-xl shadow-lg overflow-hidden print:shadow-none print:rounded-none"
                 style={{ fontFamily: "'Segoe UI', sans-serif" }}>

              {/* Invoice top bar */}
              <div style={{ background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)", padding: "28px 32px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>
                      {settings.companyName || "Onesoft"}
                    </div>
                    {settings.address && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 4 }}>{settings.address}</div>}
                    {settings.phone && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>{settings.phone}</div>}
                    {settings.email && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>{settings.email}</div>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: "rgba(255,255,255,0.25)", letterSpacing: 2 }}>INVOICE</div>
                    <div style={{ fontSize: 13, color: "#fff", fontWeight: 700, marginTop: 4 }}>{invoiceNumber}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
                      {invoiceDate ? format(new Date(invoiceDate), "d MMMM yyyy") : "—"}
                    </div>
                    {dueDate && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>Due: {format(new Date(dueDate), "d MMMM yyyy")}</div>}
                  </div>
                </div>
              </div>

              {/* Bill to */}
              {(custName || custAddress || custPhone || custEmail) && (
                <div style={{ padding: "20px 32px", borderBottom: "1px solid #f0f0f0", background: "#fafafa" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>Bill To</div>
                  {custName    && <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{custName}</div>}
                  {custAddress && <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{custAddress}</div>}
                  {custPhone   && <div style={{ fontSize: 11, color: "#777", marginTop: 2 }}>📞 {custPhone}</div>}
                  {custEmail   && <div style={{ fontSize: 11, color: "#777" }}>✉ {custEmail}</div>}
                </div>
              )}

              {/* Items table */}
              <div style={{ padding: "24px 32px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#f5f3ff" }}>
                      <th style={{ textAlign: "left",  padding: "8px 10px", fontWeight: 700, fontSize: 10, color: "#7c3aed", textTransform: "uppercase", letterSpacing: 1.5, borderRadius: "6px 0 0 6px" }}>#</th>
                      <th style={{ textAlign: "left",  padding: "8px 10px", fontWeight: 700, fontSize: 10, color: "#7c3aed", textTransform: "uppercase", letterSpacing: 1.5 }}>Item</th>
                      <th style={{ textAlign: "center",padding: "8px 10px", fontWeight: 700, fontSize: 10, color: "#7c3aed", textTransform: "uppercase", letterSpacing: 1.5 }}>Dimensions / Qty</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 700, fontSize: 10, color: "#7c3aed", textTransform: "uppercase", letterSpacing: 1.5 }}>Rate</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 700, fontSize: 10, color: "#7c3aed", textTransform: "uppercase", letterSpacing: 1.5, borderRadius: "0 6px 6px 0" }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={row.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                        <td style={{ padding: "9px 10px", color: "#aaa" }}>{i + 1}</td>
                        <td style={{ padding: "9px 10px", fontWeight: 600 }}>
                          {row.productName || row.description || <span style={{ color: "#ccc", fontStyle: "italic" }}>—</span>}
                        </td>
                        <td style={{ padding: "9px 10px", textAlign: "center", color: "#555" }}>
                          {row.rowType === "size"
                            ? `${row.height || "0"} × ${row.width || "0"} ${row.sizeUnit} = ${rowArea(row).toFixed(2)} sq ${row.sizeUnit}`
                            : `${row.qty || "0"} ${row.unit}`}
                        </td>
                        <td style={{ padding: "9px 10px", textAlign: "right", color: "#555" }}>
                          {sym}{parseFloat(row.rate || "0").toFixed(2)}
                        </td>
                        <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 700 }}>
                          {sym}{rowAmount(row).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    {labourTotal > 0 && (
                      <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                        <td style={{ padding: "9px 10px", color: "#aaa" }}>—</td>
                        <td style={{ padding: "9px 10px", fontStyle: "italic", color: "#555" }}>{labourDesc}</td>
                        <td style={{ padding: "9px 10px" }}></td>
                        <td style={{ padding: "9px 10px" }}></td>
                        <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 700 }}>{sym}{labourTotal.toFixed(2)}</td>
                      </tr>
                    )}
                    {otherTotal > 0 && (
                      <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                        <td style={{ padding: "9px 10px", color: "#aaa" }}>—</td>
                        <td style={{ padding: "9px 10px", fontStyle: "italic", color: "#555" }}>{otherDesc}</td>
                        <td style={{ padding: "9px 10px" }}></td>
                        <td style={{ padding: "9px 10px" }}></td>
                        <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 700 }}>{sym}{otherTotal.toFixed(2)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* Totals block */}
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: "2px solid #f0f0f0" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", width: 220, fontSize: 12, color: "#555" }}>
                      <span>Subtotal</span>
                      <span style={{ fontFamily: "monospace" }}>{sym}{subtotal.toFixed(2)}</span>
                    </div>
                    {(parseFloat(taxRate) || 0) > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", width: 220, fontSize: 12, color: "#555" }}>
                        <span>Tax ({taxRate}%)</span>
                        <span style={{ fontFamily: "monospace" }}>{sym}{taxAmount.toFixed(2)}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", width: 220, fontSize: 15, fontWeight: 800, color: "#7c3aed", marginTop: 4, paddingTop: 8, borderTop: "2px solid #7c3aed" }}>
                      <span>TOTAL</span>
                      <span style={{ fontFamily: "monospace" }}>{sym}{grandTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Payment terms + Notes */}
                <div style={{ marginTop: 28, padding: "14px 16px", background: "#f5f3ff", borderRadius: 8, borderLeft: "3px solid #7c3aed" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>Payment Terms</div>
                  <div style={{ fontSize: 12, color: "#555" }}>{paymentTerms}</div>
                </div>
                {notes && (
                  <div style={{ marginTop: 12, padding: "12px 16px", background: "#fafafa", borderRadius: 8, border: "1px solid #eee" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>Notes</div>
                    <div style={{ fontSize: 12, color: "#555", whiteSpace: "pre-wrap" }}>{notes}</div>
                  </div>
                )}

                {/* Footer */}
                <div style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid #f0f0f0", textAlign: "center", fontSize: 10, color: "#bbb" }}>
                  Generated by {settings.companyName || "Onesoft"} · {settings.website || "onesoft.co.uk"}
                </div>
              </div>
            </div>

            {/* Print / Export buttons below preview (non-print) */}
            <div className="flex gap-2 mt-4 print:hidden">
              <Button variant="outline" size="sm" className="gap-1.5 text-[12px] flex-1" onClick={handleExcel}>
                <FileSpreadsheet size={13} /> Export Excel
              </Button>
              <Button size="sm" className="gap-1.5 text-[12px] flex-1 bg-violet-600 hover:bg-violet-700 text-white" onClick={handlePrint}>
                <Printer size={13} /> Print / Save PDF
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Print-only: full preview */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #calc-invoice-preview, #calc-invoice-preview * { visibility: visible !important; }
          #calc-invoice-preview { position: fixed !important; inset: 0 !important; margin: 0 !important; padding: 0 !important; width: 100% !important; max-width: 100% !important; box-shadow: none !important; border-radius: 0 !important; }
        }
      `}</style>
    </div>
  );
}
