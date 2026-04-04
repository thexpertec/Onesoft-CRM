import { useState, useMemo, useCallback } from "react";
import { Image as ImageIcon, Search, X, Package, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getProducts } from "@/lib/store";
import { useLocation } from "wouter";

type MediaItem = {
  src: string;
  productId: string;
  productName: string;
  productSku: string;
  type: "thumbnail" | "additional";
  index?: number;
};

export default function MediaLibraryPage() {
  const [search,     setSearch]     = useState("");
  const [typeFilter, setTypeFilter] = useState<"All" | "thumbnail" | "additional">("All");
  const [lightbox,   setLightbox]   = useState<{ item: MediaItem; idx: number } | null>(null);
  const [, navigate] = useLocation();

  const products = useMemo(() => getProducts(), []);

  const mediaItems = useMemo<MediaItem[]>(() => {
    const items: MediaItem[] = [];
    for (const p of products) {
      if (p.thumbnail) {
        items.push({ src: p.thumbnail, productId: p.id, productName: p.name, productSku: p.sku, type: "thumbnail" });
      }
      for (let i = 0; i < (p.images?.length ?? 0); i++) {
        items.push({ src: p.images![i], productId: p.id, productName: p.name, productSku: p.sku, type: "additional", index: i + 1 });
      }
    }
    return items;
  }, [products]);

  const filtered = useMemo<MediaItem[]>(() => {
    let items = mediaItems;
    if (typeFilter !== "All") items = items.filter(i => i.type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(i => i.productName.toLowerCase().includes(q) || (i.productSku ?? "").toLowerCase().includes(q));
    }
    return items;
  }, [mediaItems, typeFilter, search]);

  const stats = useMemo(() => ({
    total:      mediaItems.length,
    thumbnails: mediaItems.filter(i => i.type === "thumbnail").length,
    additional: mediaItems.filter(i => i.type === "additional").length,
    products:   new Set(mediaItems.map(i => i.productId)).size,
  }), [mediaItems]);

  const openLightbox = useCallback((item: MediaItem, idx: number) => setLightbox({ item, idx }), []);

  const lbNavigate = useCallback((dir: -1 | 1) => {
    if (!lightbox) return;
    const next = lightbox.idx + dir;
    if (next >= 0 && next < filtered.length) setLightbox({ item: filtered[next], idx: next });
  }, [lightbox, filtered]);

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ImageIcon size={22} className="text-zinc-500" /> Media Library
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">All product images · thumbnails & additional photos</p>
        </div>
      </div>

      {/* KPI pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          { label: "All Images", filter: "All"        as const, count: stats.total,      color: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",                          ring: "ring-gray-400"    },
          { label: "Thumbnails", filter: "thumbnail"  as const, count: stats.thumbnails, color: "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300",                    ring: "ring-amber-400"   },
          { label: "Additional", filter: "additional" as const, count: stats.additional, color: "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300",                        ring: "ring-blue-500"    },
        ]).map(p => {
          const isActive = typeFilter === p.filter;
          return (
            <button key={p.label} aria-pressed={isActive}
              onClick={() => setTypeFilter(prev => prev === p.filter && p.filter !== "All" ? "All" : p.filter)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all hover:scale-[1.04] ${p.color} ${isActive ? `ring-2 ring-offset-1 ${p.ring} shadow-sm font-bold` : "ring-0 opacity-80 hover:opacity-100"}`}>
              {p.label}: <span>{p.count}</span>
              {isActive && p.filter !== "All" && <span className="ml-0.5 opacity-60 text-[10px]">×</span>}
            </button>
          );
        })}
        <span className="text-xs text-zinc-400 ml-2">{stats.products} product{stats.products !== 1 ? "s" : ""} with images</span>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input placeholder="Search by product name or SKU…" className="pl-8 h-8 text-[13px]"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <ImageIcon size={48} className="opacity-15" />
          <p className="text-sm font-medium">
            {mediaItems.length === 0
              ? "No images yet."
              : "No images match your search."}
          </p>
          {mediaItems.length === 0 && (
            <p className="text-xs text-center max-w-xs">
              Open any product row, click the <strong>camera icon</strong> in the action column, and upload a thumbnail or additional photos.
            </p>
          )}
        </div>
      ) : (
        <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-3 [column-gap:0.75rem]">
          {filtered.map((item, i) => (
            <div key={`${item.productId}-${item.type}-${item.index ?? 0}`}
              className="break-inside-avoid mb-3 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 shadow-sm hover:shadow-md transition-all group cursor-pointer bg-white dark:bg-zinc-900"
              onClick={() => openLightbox(item, i)}>
              <img src={item.src} alt={item.productName} className="w-full object-cover" loading="lazy" />
              <div className="px-2.5 py-1.5 flex items-center justify-between gap-1">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 truncate">{item.productName}</p>
                  <p className="text-[10px] text-zinc-400 truncate">{item.productSku || "—"}</p>
                </div>
                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${item.type === "thumbnail" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"}`}>
                  {item.type === "thumbnail" ? "Thumb" : `#${item.index}`}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}>
          {/* Prev */}
          {lightbox.idx > 0 && (
            <button onClick={e => { e.stopPropagation(); lbNavigate(-1); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10">
              <ChevronLeft size={24} />
            </button>
          )}
          {/* Next */}
          {lightbox.idx < filtered.length - 1 && (
            <button onClick={e => { e.stopPropagation(); lbNavigate(1); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10">
              <ChevronRight size={24} />
            </button>
          )}

          <div className="relative max-w-3xl w-full bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <img src={lightbox.item.src} alt={lightbox.item.productName}
              className="w-full max-h-[65vh] object-contain bg-zinc-100 dark:bg-zinc-800" />
            <div className="px-5 py-3 flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-sm">{lightbox.item.productName}</p>
                <p className="text-xs text-muted-foreground">
                  {lightbox.item.productSku && <span className="mr-2">SKU: {lightbox.item.productSku}</span>}
                  {lightbox.item.type === "thumbnail" ? "Thumbnail" : `Additional image #${lightbox.item.index}`}
                  <span className="ml-2 text-zinc-400">{lightbox.idx + 1} / {filtered.length}</span>
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => { navigate("/products"); setLightbox(null); }}
                  className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors">
                  <Package size={12} /> View Product
                </button>
                <button onClick={() => setLightbox(null)}
                  className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-500">
                  <X size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
