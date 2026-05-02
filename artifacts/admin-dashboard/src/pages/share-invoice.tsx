import React, { useState, useEffect } from "react";
import { useParams } from "wouter";
import {
  getInvoices, getSettings, getBankAccounts,
  Invoice, SaleItem, PaymentRecord, InvoiceDoc,
} from "@/lib/store";
import { getSettingsCurrencySymbol, getSettingsDecimalPlaces } from "@/lib/currencies";
import { printFullInvoice } from "@/lib/print-invoice-full";
import { Printer, Link2, Check, AlertTriangle, FileText } from "lucide-react";
import logoUrl from "@assets/Onesoft_Logo_1775302706939.png";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  if (!iso) return "—";
  try { return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }); }
  catch { return iso; }
}

function fmtDateShort(iso: string): string {
  if (!iso) return "—";
  try { return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

const lineTotal = (item: SaleItem): number => {
  const q = parseFloat(item.qty) || 0;
  const p = parseFloat(item.unitPrice) || 0;
  const d = parseFloat(item.discount) || 0;
  if (item.discountType === "amt") return Math.max(0, q * p - d);
  return q * p * (1 - d / 100);
};

function computeTotals(inv: Invoice) {
  const subtotal    = inv.items.reduce((s, i) => s + (parseFloat(i.qty)||0) * (parseFloat(i.unitPrice)||0), 0);
  const discountAmt = inv.items.reduce((s, i) => {
    const q = parseFloat(i.qty) || 0;
    const p = parseFloat(i.unitPrice) || 0;
    const d = parseFloat(i.discount) || 0;
    if (i.discountType === "amt") return s + Math.min(d, q * p);
    return s + q * p * (d / 100);
  }, 0);
  const afterDisc = subtotal - discountAmt;
  const tax       = afterDisc * (parseFloat(inv.taxRate) || 0) / 100;
  const shipping  = parseFloat(inv.shippingFee) || 0;
  const handling  = parseFloat(inv.handlingFee) || 0;
  const total     = afterDisc + tax + shipping + handling;
  const paid      = parseFloat(inv.amountPaid) || 0;
  const balance   = Math.max(0, total - paid);
  return { subtotal, discountAmt, afterDisc, tax, shipping, handling, total, paid, balance };
}

// Parse bank detail text blocks into structured entries
interface BankEntry { name: string; acName: string; acNo: string; sort: string; iban: string; swift: string; extra: string[] }
function parseBankText(text: string): BankEntry[] {
  if (!text?.trim()) return [];
  return text.split(/\n{2,}|---+/).map(b => b.trim()).filter(Boolean).map(block => {
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    const e: BankEntry = { name:"", acName:"", acNo:"", sort:"", iban:"", swift:"", extra:[] };
    const val = (l: string) => l.split(/:\s*(.+)/)[1]?.trim() ?? "";
    lines.forEach((l, i) => {
      const ll = l.toLowerCase();
      if (i === 0 && !ll.includes(":"))       { e.name   = l; }
      else if (ll.includes("account name"))   { e.acName = val(l); }
      else if (ll.includes("account no") || ll.includes("acc no") || ll.includes("account number")) { e.acNo = val(l); }
      else if (ll.includes("sort"))           { e.sort   = val(l); }
      else if (ll.startsWith("iban"))         { e.iban   = val(l); }
      else if (ll.startsWith("swift") || ll.startsWith("bic")) { e.swift = val(l); }
      else if (ll.includes("bank"))           { e.name   = e.name || val(l) || l; }
      else                                    { e.extra.push(l); }
    });
    return e;
  });
}

// ─── Status badge colours ─────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  Draft:     { bg: "#f1f5f9", text: "#475569",  border: "#cbd5e1" },
  Sent:      { bg: "#eff6ff", text: "#1d4ed8",  border: "#bfdbfe" },
  Paid:      { bg: "#f0fdf4", text: "#15803d",  border: "#86efac" },
  Partial:   { bg: "#fffbeb", text: "#92400e",  border: "#fde68a" },
  Overdue:   { bg: "#fef2f2", text: "#dc2626",  border: "#fca5a5" },
  Cancelled: { bg: "#f9fafb", text: "#6b7280",  border: "#e5e7eb" },
};

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "24px" }}>
      <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"14px" }}>
        <div style={{ width:"4px", height:"16px", background:"#0f2447", borderRadius:"2px", flexShrink:0 }} />
        <span style={{ fontSize:"10px", fontWeight:800, textTransform:"uppercase", letterSpacing:"1.4px", color:"#0f2447" }}>{title}</span>
        <div style={{ flex:1, height:"1.5px", background:"#e2e8f0" }} />
      </div>
      {children}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ShareInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const inv = getInvoices().find(i => i.id === id);
    if (inv) setInvoice(inv);
    else setNotFound(true);
  }, [id]);

  const settings = getSettings();
  const sym = getSettingsCurrencySymbol();
  const dp  = getSettingsDecimalPlaces();
  const fmt = (n: number) => `${sym}${n.toFixed(dp)}`;

  const handlePrint = () => {
    if (!invoice) return;
    try { printFullInvoice(invoice, settings); } catch { /* blocked */ }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  // ── Not found ────────────────────────────────────────────────────────────
  if (notFound) return (
    <div style={{ minHeight:"100vh", background:"#f1f5f9", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"system-ui, sans-serif" }}>
      <div style={{ textAlign:"center", padding:"40px" }}>
        <AlertTriangle size={48} style={{ color:"#f59e0b", margin:"0 auto 16px" }} />
        <h2 style={{ fontSize:"20px", fontWeight:700, color:"#0f172a", marginBottom:"8px" }}>Invoice Not Found</h2>
        <p style={{ fontSize:"14px", color:"#64748b" }}>This invoice link may be invalid or the data is no longer available.</p>
      </div>
    </div>
  );

  if (!invoice) return (
    <div style={{ minHeight:"100vh", background:"#f1f5f9", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ width:"32px", height:"32px", border:"3px solid #2563eb", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  const inv = invoice;
  const totals = computeTotals(inv);
  const statusStyle = STATUS_COLOR[inv.status] ?? STATUS_COLOR.Draft;
  const isSale = (inv.invoiceType ?? "sale") === "sale";
  const payHistory: PaymentRecord[] = inv.paymentHistory ?? [];

  // Bank details
  const bankText = inv.bankDetails || settings.bankDetails || "";
  const bankEntries = parseBankText(bankText);

  // Terms & conditions docs
  const docsToRender: Array<{ title: string; content: string }> = [];
  if (inv.invoiceDocs?.length) {
    inv.invoiceDocs.forEach((d: InvoiceDoc) => { if (d.content) docsToRender.push(d); });
  } else {
    if (inv.paymentTerms) docsToRender.push({ title: "Payment Terms", content: inv.paymentTerms });
    if ((settings as Record<string, unknown>).invoiceTerms) docsToRender.push({ title: "Payment Terms", content: (settings as Record<string, unknown>).invoiceTerms as string });
    if (inv.agreement)   docsToRender.push({ title: "Agreement & T&C", content: inv.agreement });
    if (inv.notes)       docsToRender.push({ title: "Additional Notes", content: inv.notes });
  }

  const logoHtml = settings.logoBase64 ? settings.logoBase64 : null;
  const billToName = inv.customer || "—";

  return (
    <div style={{ minHeight:"100vh", background:"#f1f5f9", fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" }}>

      {/* ── Fixed Toolbar ─────────────────────────────────────────────────── */}
      <div style={{
        position:"fixed", top:0, left:0, right:0, zIndex:200,
        background:"#0f2447", color:"#fff",
        display:"flex", alignItems:"center", gap:"10px",
        padding:"10px 20px", boxShadow:"0 2px 16px rgba(0,0,0,0.3)",
      }}>
        {logoHtml
          ? <img src={logoHtml} alt="Logo" style={{ height:"24px", objectFit:"contain", filter:"brightness(0) invert(1)", flexShrink:0 }} />
          : <FileText size={18} style={{ color:"#60a5fa", flexShrink:0 }} />
        }
        <div style={{ flex:1, overflow:"hidden" }}>
          <div style={{ fontSize:"13px", fontWeight:700, color:"#fff", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
            {inv.invoiceTitle || (isSale ? "Tax Invoice" : "Purchase Invoice")}
          </div>
          <div style={{ fontSize:"11px", color:"#94a3b8" }}>{inv.invoiceNumber} · {inv.customer}</div>
        </div>
        <button
          onClick={handleCopy}
          style={{
            flexShrink:0, display:"flex", alignItems:"center", gap:"6px",
            padding:"7px 16px", borderRadius:"8px", border:"none", cursor:"pointer",
            background:"rgba(255,255,255,0.12)", color:"#fff",
            fontSize:"12px", fontWeight:700, transition:"opacity 0.15s",
          }}
          title="Copy shareable link"
        >
          {copied ? <Check size={13}/> : <Link2 size={13}/>}
          {copied ? "Copied!" : "Copy Link"}
        </button>
        <button
          onClick={handlePrint}
          style={{
            flexShrink:0, display:"flex", alignItems:"center", gap:"6px",
            padding:"7px 18px", borderRadius:"8px", border:"none", cursor:"pointer",
            background:"#fff", color:"#1e40af",
            fontSize:"12px", fontWeight:700, transition:"opacity 0.15s",
          }}
        >
          <Printer size={13}/> Print PDF
        </button>
      </div>

      {/* ── Invoice Document ───────────────────────────────────────────────── */}
      <div style={{ maxWidth:"860px", margin:"72px auto 60px", background:"#fff", borderRadius:"14px", boxShadow:"0 4px 40px rgba(0,0,0,0.1)", overflow:"hidden" }}>

        {/* Header Band */}
        <div style={{ background:"#0f2447", color:"#fff", padding:"24px 32px", display:"flex", justifyContent:"space-between", alignItems:"center", gap:"20px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"14px" }}>
            {logoHtml
              ? <img src={logoHtml} alt="Logo" style={{ height:"42px", maxWidth:"130px", objectFit:"contain", filter:"brightness(0) invert(1)" }} />
              : <span style={{ fontSize:"20px", fontWeight:900, color:"#fff", letterSpacing:"-0.5px" }}>{settings.companyName || "Company"}</span>
            }
            {settings.companyTagline && (
              <span style={{ fontSize:"11px", color:"#94a3b8", borderLeft:"1px solid rgba(255,255,255,0.15)", paddingLeft:"12px" }}>
                {settings.companyTagline}
              </span>
            )}
          </div>
          <div style={{ textAlign:"right", flexShrink:0 }}>
            <div style={{ fontSize:"22px", fontWeight:900, color:"#fff", letterSpacing:"2px", textTransform:"uppercase", lineHeight:1 }}>
              {inv.invoiceTitle || (isSale ? "Tax Invoice" : "Purchase Invoice")}
            </div>
            <div style={{ fontSize:"12px", fontWeight:700, color:"#60a5fa", marginTop:"4px", letterSpacing:"0.4px" }}>
              {inv.invoiceNumber}
            </div>
          </div>
        </div>

        {/* Bill To + Meta Strip */}
        <div style={{ display:"flex", borderBottom:"2px solid #e2e8f0" }}>
          {/* Bill To */}
          <div style={{ flex:1, padding:"18px 24px 18px 32px", borderRight:"1.5px solid #e2e8f0" }}>
            <div style={{ fontSize:"8px", fontWeight:800, textTransform:"uppercase", letterSpacing:"1.5px", color:"#94a3b8", marginBottom:"6px" }}>
              {isSale ? "Bill To" : "Supplier"}
            </div>
            <div style={{ fontSize:"16px", fontWeight:800, color:"#0f172a", marginBottom:"4px", lineHeight:1.2 }}>{billToName}</div>
            {inv.buyerPhone && <div style={{ fontSize:"12px", color:"#475569", marginBottom:"2px" }}>{inv.buyerPhone}</div>}
            {inv.buyerEmail && <div style={{ fontSize:"12px", color:"#475569", marginBottom:"2px" }}>{inv.buyerEmail}</div>}
            {inv.buyerAddress && <div style={{ fontSize:"12px", color:"#475569", marginBottom:"2px", whiteSpace:"pre-line" }}>{inv.buyerAddress}</div>}
            {inv.buyerTown && <div style={{ fontSize:"12px", color:"#475569" }}>{inv.buyerTown}</div>}
            {inv.agentName && (
              <div style={{ marginTop:"6px", fontSize:"11px", color:"#64748b" }}>
                <span style={{ fontWeight:600 }}>Sales Officer:</span> {inv.agentName}
              </div>
            )}
          </div>

          {/* Meta strip */}
          <div style={{ width:"200px", flexShrink:0, padding:"18px 32px 18px 20px", display:"flex", flexDirection:"column", justifyContent:"center", gap:"7px" }}>
            {(
              [
                ["Invoice Date", fmtDateShort(inv.invoiceDate)],
                ["Due Date",     fmtDateShort(inv.dueDate)],
                ...(inv.paymentMethod  ? [["Payment Via", inv.paymentMethod]]  : []),
                ...(inv.shippingMethod ? [["Shipping",    inv.shippingMethod]] : []),
              ] as [string, string][]
            ).map(([label, val]) => (
              <div key={label} style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:"8px", fontSize:"12px" }}>
                <span style={{ color:"#94a3b8", whiteSpace:"nowrap" }}>{label}</span>
                <span style={{ fontWeight:700, color: label === "Due Date" && inv.status === "Overdue" ? "#dc2626" : "#1e293b", textAlign:"right" }}>{val}</span>
              </div>
            ))}
            <div style={{ marginTop:"6px", alignSelf:"flex-end" }}>
              <span style={{
                display:"inline-block", padding:"4px 12px", borderRadius:"20px",
                fontSize:"10px", fontWeight:800, letterSpacing:"0.8px", textTransform:"uppercase",
                background: statusStyle.bg, color: statusStyle.text, border: `1.5px solid ${statusStyle.border}`,
              }}>
                {inv.status}
              </span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding:"24px 32px 28px" }}>

          {/* Items & Services */}
          <Section title="Items &amp; Services">
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"13px" }}>
                <thead>
                  <tr style={{ background:"#0f2447" }}>
                    {["#", "Description", "Qty", "Unit Price", "Disc.", "Total"].map((h, i) => (
                      <th key={h} style={{
                        padding:"8px 10px", fontSize:"9px", fontWeight:800, textTransform:"uppercase",
                        letterSpacing:"0.8px", color:"#94a3b8", whiteSpace:"nowrap",
                        textAlign: i === 0 ? "center" : i >= 2 ? "right" : "left",
                        width: i === 0 ? "32px" : i === 4 ? "54px" : i === 5 ? "80px" : "auto",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inv.items.map((item, i) => {
                    const lt   = lineTotal(item);
                    const disc = parseFloat(item.discount) || 0;
                    return (
                      <tr key={item.id} style={{ borderBottom:"1px solid #f1f5f9", background: i % 2 === 1 ? "#f8fafc" : "#fff" }}>
                        <td style={{ padding:"9px 10px", textAlign:"center", fontSize:"11px", color:"#94a3b8", fontWeight:600 }}>{i+1}</td>
                        <td style={{ padding:"9px 10px" }}>
                          <div style={{ fontWeight:700, color:"#0f172a", fontSize:"13px" }}>
                            {item.localName?.trim() || item.productName || "—"}
                          </div>
                          {item.sku   && <div style={{ fontSize:"10px", color:"#94a3b8", marginTop:"2px" }}>SKU: {item.sku}</div>}
                          {item.notes && <div style={{ fontSize:"10px", color:"#94a3b8", marginTop:"2px" }}>{item.notes}</div>}
                        </td>
                        <td style={{ padding:"9px 10px", textAlign:"right", color:"#475569" }}>{parseFloat(item.qty)||0}</td>
                        <td style={{ padding:"9px 10px", textAlign:"right", color:"#475569" }}>{fmt(parseFloat(item.unitPrice)||0)}</td>
                        <td style={{ padding:"9px 10px", textAlign:"right" }}>
                          {disc > 0
                            ? <span style={{ display:"inline-block", background:"#fef3c7", color:"#92400e", fontSize:"10px", fontWeight:700, padding:"1px 5px", borderRadius:"3px" }}>
                                {item.discountType === "amt" ? fmt(disc) : `${disc.toFixed(1)}%`}
                              </span>
                            : <span style={{ color:"#d1d5db" }}>—</span>
                          }
                        </td>
                        <td style={{ padding:"9px 10px", textAlign:"right", fontWeight:700, color:"#0f172a" }}>
                          {lt > 0 ? fmt(lt) : <span style={{ color:"#d1d5db" }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop:"2px solid #e2e8f0" }}>
                    <td colSpan={6} style={{ padding:0 }}>
                      {/* Totals block */}
                      <div style={{ display:"flex", justifyContent:"flex-end", marginTop:"12px" }}>
                        <div style={{ minWidth:"240px", maxWidth:"280px", width:"100%" }}>
                          {[
                            { label:"Subtotal",     val:totals.subtotal,    show: true,                        style:{} },
                            { label:"Discount",     val:-totals.discountAmt, show: totals.discountAmt > 0,     style:{ color:"#dc2626" } },
                            { label:"After Discount",val:totals.afterDisc,  show: totals.discountAmt > 0,     style:{} },
                            { label:`VAT / Tax (${inv.taxRate}%)`, val:totals.tax, show: totals.tax > 0,      style:{} },
                            { label:"Shipping",     val:totals.shipping,    show: totals.shipping > 0,         style:{} },
                            { label:"Handling",     val:totals.handling,    show: totals.handling > 0,         style:{} },
                          ].filter(r => r.show).map(r => (
                            <div key={r.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"5px 10px", fontSize:"12px", borderBottom:"1px solid #f1f5f9" }}>
                              <span style={{ color:"#64748b" }}>{r.label}</span>
                              <span style={{ fontWeight:600, color:"#1e293b", ...r.style }}>
                                {r.val < 0 ? `-${fmt(-r.val)}` : fmt(r.val)}
                              </span>
                            </div>
                          ))}

                          {/* Grand Total */}
                          <div style={{ background:"#0f2447", color:"#fff", padding:"10px 14px", borderRadius:"6px", marginTop:"8px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                            <span style={{ fontSize:"11px", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.8px", color:"#94a3b8" }}>Total</span>
                            <span style={{ fontSize:"17px", fontWeight:900 }}>{fmt(totals.total)}</span>
                          </div>

                          {/* Amount Paid */}
                          {totals.paid > 0 && (
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 14px", fontSize:"12px", color:"#475569", marginTop:"4px" }}>
                              <span>Amount Paid</span>
                              <span style={{ fontWeight:700, color:"#15803d" }}>−{fmt(totals.paid)}</span>
                            </div>
                          )}

                          {/* Balance Due or Fully Paid */}
                          {inv.status === "Paid"
                            ? <div style={{ background:"#f0fdf4", border:"1.5px solid #86efac", color:"#15803d", padding:"8px 14px", borderRadius:"6px", marginTop:"4px", textAlign:"center", fontSize:"12px", fontWeight:800 }}>
                                ✓ FULLY PAID
                              </div>
                            : totals.balance > 0
                              ? <div style={{ background:"linear-gradient(135deg,#fef3c7,#fde68a)", border:"1.5px solid #fbbf24", color:"#78350f", padding:"8px 14px", borderRadius:"6px", marginTop:"4px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                                  <span style={{ fontSize:"12px", fontWeight:700 }}>Balance Due</span>
                                  <span style={{ fontSize:"16px", fontWeight:900 }}>{fmt(totals.balance)}</span>
                                </div>
                              : null
                          }
                        </div>
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Section>

          {/* Payment History */}
          {payHistory.length > 0 && (
            <Section title="Payment History">
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"12px" }}>
                  <thead>
                    <tr style={{ background:"#334155" }}>
                      {["Date", "Method", "Reference / Note", "Amount"].map((h, i) => (
                        <th key={h} style={{
                          padding:"8px 12px", fontSize:"9px", fontWeight:800, textTransform:"uppercase",
                          letterSpacing:"0.8px", color:"#94a3b8", textAlign: i === 3 ? "right" : "left",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payHistory.map((r, i) => (
                      <tr key={r.id} style={{ borderBottom:"1px solid #f1f5f9", background: i % 2 === 1 ? "#f8fafc" : "#fff" }}>
                        <td style={{ padding:"9px 12px", whiteSpace:"nowrap", color:"#475569" }}>{fmtDateShort(r.date)}</td>
                        <td style={{ padding:"9px 12px", fontWeight:600, color:"#1e293b" }}>{r.method}</td>
                        <td style={{ padding:"9px 12px", color:"#64748b" }}>{r.note || "—"}</td>
                        <td style={{ padding:"9px 12px", textAlign:"right", fontWeight:700, color:"#15803d" }}>{fmt(parseFloat(r.amount)||0)}</td>
                      </tr>
                    ))}
                    <tr style={{ background:"#f0fdf4", borderTop:"2px solid #86efac" }}>
                      <td colSpan={3} style={{ padding:"9px 12px", fontSize:"11px", fontWeight:700, color:"#166534", textTransform:"uppercase", letterSpacing:"0.05em" }}>Total Paid</td>
                      <td style={{ padding:"9px 12px", textAlign:"right", fontWeight:800, color:"#15803d", fontSize:"14px" }}>
                        {fmt(payHistory.reduce((s, r) => s + (parseFloat(r.amount)||0), 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Bank Details */}
          {bankEntries.length > 0 && (
            <Section title="Bank / Payment Details">
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"12px" }}>
                  <thead>
                    <tr style={{ background:"#1e3a5f" }}>
                      {(["Bank", bankEntries.some(b=>b.acName)&&"Account Name", bankEntries.some(b=>b.acNo)&&"Account No.", bankEntries.some(b=>b.sort)&&"Sort Code", bankEntries.some(b=>b.iban)&&"IBAN", bankEntries.some(b=>b.swift)&&"SWIFT/BIC"] as (string|false)[]).filter(Boolean).map(h => (
                        <th key={h as string} style={{ padding:"8px 10px", fontSize:"9px", fontWeight:800, textTransform:"uppercase", letterSpacing:"0.8px", color:"#93c5fd", textAlign:"left" }}>{h as string}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bankEntries.map((b, i) => (
                      <tr key={i} style={{ borderBottom:"1px solid #f1f5f9", background: i % 2 === 1 ? "#f8fafc" : "#fff" }}>
                        <td style={{ padding:"9px 10px", fontWeight:700, color:"#1e3a8a" }}>{b.name || `Bank ${i+1}`}</td>
                        {bankEntries.some(x=>x.acName) && <td style={{ padding:"9px 10px" }}>{b.acName || "—"}</td>}
                        {bankEntries.some(x=>x.acNo)   && <td style={{ padding:"9px 10px", fontFamily:"monospace", fontSize:"11px" }}>{b.acNo || "—"}</td>}
                        {bankEntries.some(x=>x.sort)   && <td style={{ padding:"9px 10px", fontFamily:"monospace", fontSize:"11px" }}>{b.sort || "—"}</td>}
                        {bankEntries.some(x=>x.iban)   && <td style={{ padding:"9px 10px", fontFamily:"monospace", fontSize:"10px" }}>{b.iban || "—"}</td>}
                        {bankEntries.some(x=>x.swift)  && <td style={{ padding:"9px 10px", fontFamily:"monospace", fontSize:"11px" }}>{b.swift || "—"}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {bankEntries.some(b => b.extra.length > 0) && (
                  <div style={{ marginTop:"8px", fontSize:"11px", color:"#475569" }}>
                    {bankEntries.flatMap(b => b.extra).map((l, i) => <div key={i}>{l}</div>)}
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Fallback: plain bank text */}
          {bankEntries.length === 0 && bankText && (
            <Section title="Bank / Payment Details">
              <div style={{ fontSize:"12px", color:"#1e3a5f", background:"#f0f7ff", border:"1.5px solid #bfdbfe", borderRadius:"8px", padding:"14px 18px", lineHeight:1.7, whiteSpace:"pre-line" }}>
                {bankText}
              </div>
            </Section>
          )}

          {/* Terms & Conditions / Notes */}
          {docsToRender.length > 0 && (
            <Section title="Terms &amp; Conditions">
              <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
                {docsToRender.map((doc, i) => (
                  <div key={i}>
                    <div style={{ fontSize:"10px", fontWeight:800, textTransform:"uppercase", letterSpacing:"1px", color:"#0f2447", marginBottom:"8px", paddingLeft:"10px", borderLeft:"3px solid #0f2447" }}>
                      {doc.title}
                    </div>
                    <div
                      style={{ fontSize:"12px", color:"#374151", background:"#f8fafc", border:"1.5px solid #e5e7eb", borderRadius:"8px", padding:"14px 18px", lineHeight:"1.7" }}
                      dangerouslySetInnerHTML={{ __html: doc.content.startsWith("<") ? doc.content : `<p>${doc.content.replace(/\n/g, "<br/>")}</p>` }}
                    />
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Invoice Footer text */}
          {inv.invoiceFooter && (
            <div style={{ marginTop:"8px", fontSize:"11px", color:"#64748b", fontStyle:"italic", textAlign:"center", padding:"0 8px" }}>
              {inv.invoiceFooter}
            </div>
          )}
        </div>

        {/* Footer Band */}
        <div style={{ background:"#0f2447", color:"#94a3b8", padding:"16px 32px", textAlign:"center", fontSize:"11px", lineHeight:1.8 }}>
          <div style={{ fontSize:"13px", fontWeight:700, color:"#e2e8f0", marginBottom:"3px" }}>{settings.companyName}</div>
          {[settings.addressHull, settings.phoneHull, settings.emailHull, settings.website, settings.vatNumber ? `VAT: ${settings.vatNumber}` : ""]
            .filter(Boolean).join("  ·  ") && (
            <div style={{ color:"#64748b", marginBottom:"2px" }}>
              {[settings.addressHull, settings.phoneHull, settings.emailHull, settings.website, settings.vatNumber ? `VAT: ${settings.vatNumber}` : ""].filter(Boolean).join("  ·  ")}
            </div>
          )}
          <div style={{ fontSize:"10px", color:"#334155", marginTop:"6px", paddingTop:"6px", borderTop:"1px solid #1e3a5f" }}>
            This is a computer-generated document. No handwritten signature is required.
          </div>
        </div>
      </div>
    </div>
  );
}
