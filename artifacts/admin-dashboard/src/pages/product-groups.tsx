import { useState, useRef, useEffect, useMemo } from "react";
import { Layers, Plus, Trash2, ChevronRight, Search, X, GripVertical, AlertCircle, Package, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useProductGroups } from "@/hooks/use-data";
import { useProducts } from "@/hooks/use-data";
import type { ProductGroup, ProductGroupItem } from "@/lib/store";
import { getSettingsDecimalPlaces } from "@/lib/currencies";

const dp = getSettingsDecimalPlaces();

const GROUP_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#06b6d4", "#64748b", "#a16207",
];

function fmt(v?: string) {
  const n = parseFloat(v ?? "0");
  return isNaN(n) ? "—" : `£${n.toFixed(dp)}`;
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {GROUP_COLORS.map(c => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
          style={{ backgroundColor: c, borderColor: c === value ? "#1e293b" : "transparent" }}
        />
      ))}
    </div>
  );
}

function NewGroupModal({ onSave, onClose }: { onSave: (data: Omit<ProductGroup, "id" | "createdAt" | "updatedAt">) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(GROUP_COLORS[0]);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), description: description.trim(), color, items: [] });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">New Product Group / Menu</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Group Name <span className="text-red-500">*</span></label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Lunch Combo, Starter Pack…"
              autoFocus
              onKeyDown={e => e.key === "Enter" && handleSave()}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Colour</label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim()}>Create Group</Button>
        </div>
      </div>
    </div>
  );
}

function ProductSearch({
  excludeIds,
  onSelect,
}: {
  excludeIds: Set<string>;
  onSelect: (productId: string, qty: number) => void;
}) {
  const { products } = useProducts();
  const [query, setQuery] = useState("");
  const [qty, setQty] = useState(1);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return products
      .filter(p => !excludeIds.has(p.id))
      .filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q) ||
        (p.barcode ?? "").toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [query, products, excludeIds]);

  const selected = products.find(p => p.id === selectedId);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handlePick = (id: string) => {
    setSelectedId(id);
    setQuery(products.find(p => p.id === id)?.name ?? "");
    setOpen(false);
  };

  const handleAdd = () => {
    if (!selectedId) return;
    onSelect(selectedId, Math.max(1, qty));
    setSelectedId(null);
    setQuery("");
    setQty(1);
  };

  return (
    <div className="flex gap-2 items-start">
      <div className="relative flex-1" ref={ref}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <Input
          value={query}
          onChange={e => { setQuery(e.target.value); setSelectedId(null); setOpen(true); }}
          onFocus={() => query && setOpen(true)}
          placeholder="Search products to add…"
          className="pl-9"
        />
        {open && filtered.length > 0 && (
          <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
            {filtered.map(p => (
              <button
                key={p.id}
                className="w-full text-left px-3 py-2 hover:bg-indigo-50 dark:hover:bg-gray-800 flex items-center gap-2"
                onClick={() => handlePick(p.id)}
              >
                <Package className="w-4 h-4 text-gray-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-xs text-gray-500">{p.sku ?? "No SKU"} · {fmt(p.price)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
        {open && query.trim() && filtered.length === 0 && (
          <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg px-3 py-4 text-sm text-center text-gray-400">
            No matching products found
          </div>
        )}
      </div>
      <div className="w-20">
        <Input
          type="number"
          min={1}
          value={qty}
          onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
          placeholder="Qty"
        />
      </div>
      <Button onClick={handleAdd} disabled={!selectedId}>
        <Plus className="w-4 h-4 mr-1" /> Add
      </Button>
    </div>
  );
}

function GroupDetail({
  group,
  onUpdate,
  onDelete,
}: {
  group: ProductGroup;
  onUpdate: (id: string, updates: Partial<ProductGroup>) => void;
  onDelete: (id: string) => void;
}) {
  const { products } = useProducts();
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(group.name);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descVal, setDescVal] = useState(group.description ?? "");
  const [editingColor, setEditingColor] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setNameVal(group.name);
    setDescVal(group.description ?? "");
  }, [group.id, group.name, group.description]);

  const getProduct = (id: string) => products.find(p => p.id === id);

  const updateItems = (items: ProductGroupItem[]) => onUpdate(group.id, { items });

  const handleQtyChange = (productId: string, qty: number) => {
    updateItems(group.items.map(it => it.productId === productId ? { ...it, quantity: Math.max(1, qty) } : it));
  };

  const handleNoteChange = (productId: string, note: string) => {
    updateItems(group.items.map(it => it.productId === productId ? { ...it, note } : it));
  };

  const handleRemoveItem = (productId: string) => {
    updateItems(group.items.filter(it => it.productId !== productId));
  };

  const handleAddItem = (productId: string, quantity: number) => {
    if (group.items.some(it => it.productId === productId)) return;
    updateItems([...group.items, { productId, quantity }]);
  };

  const excludeIds = useMemo(() => new Set(group.items.map(i => i.productId)), [group.items]);

  const totals = useMemo(() => {
    let totalQty = 0, totalPurchase = 0, totalCost = 0, totalSale = 0;
    for (const item of group.items) {
      const p = getProduct(item.productId);
      if (!p) continue;
      totalQty += item.quantity;
      totalPurchase += (parseFloat(p.purchasePrice ?? "0") || 0) * item.quantity;
      totalCost += (parseFloat(p.costPrice ?? "0") || 0) * item.quantity;
      totalSale += (parseFloat(p.price ?? "0") || 0) * item.quantity;
    }
    return { totalQty, totalPurchase, totalCost, totalSale };
  }, [group.items, products]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-start gap-3">
        <button
          className="w-8 h-8 rounded-full shrink-0 mt-0.5 border-2 border-white dark:border-gray-800 shadow"
          style={{ backgroundColor: group.color }}
          onClick={() => setEditingColor(!editingColor)}
          title="Change colour"
        />
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex gap-2 items-center">
              <Input
                value={nameVal}
                onChange={e => setNameVal(e.target.value)}
                autoFocus
                className="text-base font-semibold h-8"
                onKeyDown={e => {
                  if (e.key === "Enter") { onUpdate(group.id, { name: nameVal.trim() || group.name }); setEditingName(false); }
                  if (e.key === "Escape") setEditingName(false);
                }}
              />
              <button className="text-green-600 hover:text-green-700" onClick={() => { onUpdate(group.id, { name: nameVal.trim() || group.name }); setEditingName(false); }}>
                <Check className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button className="flex items-center gap-1 group" onClick={() => setEditingName(true)}>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 group-hover:text-indigo-600">{group.name}</h2>
              <Pencil className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100" />
            </button>
          )}
          {editingDesc ? (
            <Textarea
              value={descVal}
              onChange={e => setDescVal(e.target.value)}
              autoFocus
              rows={2}
              className="mt-1 text-sm"
              onBlur={() => { onUpdate(group.id, { description: descVal.trim() }); setEditingDesc(false); }}
              onKeyDown={e => { if (e.key === "Escape") setEditingDesc(false); }}
            />
          ) : (
            <button className="flex items-center gap-1 group text-left" onClick={() => setEditingDesc(true)}>
              <p className="text-sm text-gray-500 dark:text-gray-400 group-hover:text-indigo-500 mt-0.5">
                {group.description || <span className="italic">Add description…</span>}
              </p>
              <Pencil className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 shrink-0" />
            </button>
          )}
          {editingColor && (
            <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <ColorPicker value={group.color} onChange={c => { onUpdate(group.id, { color: c }); setEditingColor(false); }} />
            </div>
          )}
        </div>
        {confirmDelete ? (
          <div className="flex gap-2 shrink-0">
            <span className="text-sm text-red-600 self-center">Delete group?</span>
            <Button size="sm" variant="destructive" onClick={() => onDelete(group.id)}>Yes, delete</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Items table */}
      <div className="flex-1 overflow-auto">
        {group.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <Package className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No products in this group yet</p>
            <p className="text-xs mt-1">Use the search below to add products</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 z-10">
              <tr className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="text-left px-4 py-2.5 w-8">#</th>
                <th className="text-left px-3 py-2.5">Product</th>
                <th className="text-center px-3 py-2.5 w-24">Qty</th>
                <th className="text-right px-3 py-2.5 w-28">Purchase</th>
                <th className="text-right px-3 py-2.5 w-24">Cost</th>
                <th className="text-right px-3 py-2.5 w-24">Sale</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {group.items.map((item, idx) => {
                const p = getProduct(item.productId);
                if (!p) return (
                  <tr key={item.productId} className="bg-red-50 dark:bg-red-950">
                    <td className="px-4 py-2 text-gray-400">{idx + 1}</td>
                    <td className="px-3 py-2 text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" /> Product deleted (ID: {item.productId.slice(0, 8)}…)
                    </td>
                    <td colSpan={4} />
                    <td className="px-2">
                      <button className="text-gray-400 hover:text-red-500" onClick={() => handleRemoveItem(item.productId)}>
                        <X className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
                const purchase = (parseFloat(p.purchasePrice ?? "0") || 0) * item.quantity;
                const cost = (parseFloat(p.costPrice ?? "0") || 0) * item.quantity;
                const sale = (parseFloat(p.price ?? "0") || 0) * item.quantity;
                return (
                  <tr key={item.productId} className="hover:bg-indigo-50/40 dark:hover:bg-gray-800/50 group">
                    <td className="px-4 py-2.5 text-gray-400 text-xs">{idx + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-gray-900 dark:text-gray-100">{p.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5 flex gap-2">
                        {p.sku && <span>SKU: {p.sku}</span>}
                        {p.brand && <span>· {p.brand}</span>}
                      </div>
                      <input
                        className="mt-1 text-xs text-gray-400 bg-transparent border-b border-dashed border-gray-200 dark:border-gray-700 focus:outline-none focus:border-indigo-400 w-full max-w-[200px] placeholder:text-gray-300"
                        value={item.note ?? ""}
                        onChange={e => handleNoteChange(p.id, e.target.value)}
                        placeholder="Add note…"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          className="w-5 h-5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-indigo-100 hover:text-indigo-700 text-xs font-bold flex items-center justify-center"
                          onClick={() => handleQtyChange(p.id, item.quantity - 1)}
                        >−</button>
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={e => handleQtyChange(p.id, parseInt(e.target.value) || 1)}
                          className="w-10 text-center bg-transparent border-b border-gray-300 dark:border-gray-600 focus:outline-none focus:border-indigo-400 text-sm"
                        />
                        <button
                          className="w-5 h-5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-indigo-100 hover:text-indigo-700 text-xs font-bold flex items-center justify-center"
                          onClick={() => handleQtyChange(p.id, item.quantity + 1)}
                        >+</button>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-600 dark:text-gray-400">
                      {purchase > 0 ? `£${purchase.toFixed(dp)}` : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-600 dark:text-gray-400">
                      {cost > 0 ? `£${cost.toFixed(dp)}` : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-gray-900 dark:text-gray-100">
                      {sale > 0 ? `£${sale.toFixed(dp)}` : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-2 py-2.5">
                      <button
                        className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleRemoveItem(p.id)}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {group.items.length > 0 && (
              <tfoot className="bg-gray-50 dark:bg-gray-800 border-t-2 border-gray-200 dark:border-gray-700">
                <tr className="text-sm font-semibold">
                  <td className="px-4 py-2.5" />
                  <td className="px-3 py-2.5 text-gray-500">{group.items.length} product{group.items.length !== 1 ? "s" : ""}</td>
                  <td className="px-3 py-2.5 text-center text-gray-700 dark:text-gray-300">{totals.totalQty}</td>
                  <td className="px-3 py-2.5 text-right text-gray-600 dark:text-gray-400">
                    {totals.totalPurchase > 0 ? `£${totals.totalPurchase.toFixed(dp)}` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-600 dark:text-gray-400">
                    {totals.totalCost > 0 ? `£${totals.totalCost.toFixed(dp)}` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right text-indigo-600 dark:text-indigo-400 text-base">
                    {totals.totalSale > 0 ? `£${totals.totalSale.toFixed(dp)}` : "—"}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>

      {/* Add product row */}
      <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <ProductSearch excludeIds={excludeIds} onSelect={handleAddItem} />
      </div>
    </div>
  );
}

export default function ProductGroupsPage() {
  const { groups, addGroup, editGroup, removeGroup } = useProductGroups();
  const dp = getSettingsDecimalPlaces();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups.filter(g =>
      g.name.toLowerCase().includes(q) ||
      (g.description ?? "").toLowerCase().includes(q)
    );
  }, [groups, search]);

  const selectedGroup = groups.find(g => g.id === selectedId) ?? null;

  const handleCreate = (data: Omit<ProductGroup, "id" | "createdAt" | "updatedAt">) => {
    const g = addGroup(data);
    setSelectedId(g.id);
  };

  const handleDelete = (id: string) => {
    removeGroup(id);
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col">
      {/* Page header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
            <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Product Groups &amp; Menus</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Bundle products together like restaurant menus or combo packages</p>
          </div>
        </div>
        <Button onClick={() => setShowNewModal(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> New Group
        </Button>
      </div>

      {/* Two-panel body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: group list */}
        <div className="w-72 shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
          <div className="px-3 pt-3 pb-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search groups…"
                className="pl-8 h-8 text-sm"
              />
              {search && (
                <button className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" onClick={() => setSearch("")}>
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
            {filtered.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <Layers className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{search ? "No groups match" : "No groups yet"}</p>
                {!search && (
                  <button
                    className="mt-2 text-xs text-indigo-600 hover:underline"
                    onClick={() => setShowNewModal(true)}
                  >
                    Create your first group
                  </button>
                )}
              </div>
            ) : (
              filtered.map(g => {
                const isActive = selectedId === g.id;
                const totalSale = g.items.reduce((sum, item) => {
                  return sum;
                }, 0);
                return (
                  <button
                    key={g.id}
                    onClick={() => setSelectedId(isActive ? null : g.id)}
                    className={`w-full text-left rounded-lg px-3 py-2.5 transition-all border ${
                      isActive
                        ? "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700"
                        : "bg-white dark:bg-gray-900 border-transparent hover:border-gray-200 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: g.color }}
                      />
                      <span className={`font-medium text-sm truncate flex-1 ${isActive ? "text-indigo-700 dark:text-indigo-300" : "text-gray-800 dark:text-gray-200"}`}>
                        {g.name}
                      </span>
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {g.items.length}
                      </Badge>
                      {isActive && <ChevronRight className="w-3.5 h-3.5 text-indigo-500 shrink-0" />}
                    </div>
                    {g.description && (
                      <p className="text-xs text-gray-400 mt-1 pl-5.5 truncate">{g.description}</p>
                    )}
                  </button>
                );
              })
            )}
          </div>

          <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-800 shrink-0">
            <p className="text-xs text-gray-400 text-center">{groups.length} group{groups.length !== 1 ? "s" : ""} total</p>
          </div>
        </div>

        {/* Right: detail panel */}
        <div className="flex-1 overflow-hidden">
          {selectedGroup ? (
            <GroupDetail
              group={selectedGroup}
              onUpdate={editGroup}
              onDelete={handleDelete}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <Layers className="w-8 h-8 opacity-40" />
              </div>
              <div className="text-center">
                <p className="font-medium text-gray-500">Select a group to view and edit its products</p>
                <p className="text-sm mt-1">
                  {groups.length === 0
                    ? <>Click <button className="text-indigo-600 hover:underline" onClick={() => setShowNewModal(true)}>New Group</button> to get started</>
                    : "Choose a group from the left panel"
                  }
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {showNewModal && (
        <NewGroupModal
          onSave={handleCreate}
          onClose={() => setShowNewModal(false)}
        />
      )}
    </div>
  );
}
