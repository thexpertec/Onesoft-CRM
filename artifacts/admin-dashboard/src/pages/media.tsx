import { useState, useMemo, useCallback, useRef } from "react";
import {
  Image as ImageIcon, Search, X, Package, ChevronLeft, ChevronRight,
  Upload, Library, Trash2, Zap, CheckCircle2, RefreshCw, Info,
} from "lucide-react";
import { Input }  from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  getProducts, getMediaLibraryItems,
  addMediaLibraryItem, deleteMediaLibraryItem,
  replaceAllMediaLibraryItems, bulkReplaceProductImages,
  type MediaLibraryItem,
} from "@/lib/store";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

// ─── Image helpers ────────────────────────────────────────────────────────────

/** Detect format label from a data-URL or regular URL. */
function imgFormat(src: string): "WebP" | "JPEG" | "PNG" | "GIF" | "IMG" {
  if (!src) return "IMG";
  if (src.startsWith("data:")) {
    if (src.includes("image/webp")) return "WebP";
    if (src.includes("image/jpeg") || src.includes("image/jpg")) return "JPEG";
    if (src.includes("image/png"))  return "PNG";
    if (src.includes("image/gif"))  return "GIF";
    return "IMG";
  }
  const lc = src.toLowerCase();
  if (lc.endsWith(".webp")) return "WebP";
  if (lc.endsWith(".jpg") || lc.endsWith(".jpeg")) return "JPEG";
  if (lc.endsWith(".png"))  return "PNG";
  if (lc.endsWith(".gif"))  return "GIF";
  return "IMG";
}

/** Approximate size in KB from a data URL (base64 payload ÷ 0.75). */
function dataUrlKb(src: string): number | null {
  if (!src.startsWith("data:")) return null;
  const comma = src.indexOf(",");
  if (comma === -1) return null;
  return Math.round((src.length - comma - 1) * 0.75 / 1024);
}

/** Convert any image src → WebP data-URL. */
function convertToWebP(src: string, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width  = img.width;
      canvas.height = img.height;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/webp", quality));
    };
    img.onerror = reject;
    img.src = src;
  });
}

/** Compress + convert an uploaded File to WebP (resize if needed). */
function compressToWebP(file: File, maxW = 1200, maxH = 1200, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const scale   = Math.min(1, maxW / img.width, maxH / img.height);
        const canvas  = document.createElement("canvas");
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/webp", quality));
      };
      img.onerror = reject;
      img.src = ev.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type MediaSource  = "library" | "product";
type TypeFilter   = "All" | "library" | "thumbnail" | "additional";
type MediaItemView = {
  id: string; src: string; name: string; sku?: string;
  tag: string; productId?: string; source: MediaSource; deletable?: boolean;
};

// ─── Format badge ─────────────────────────────────────────────────────────────

const FORMAT_STYLE: Record<string, string> = {
  WebP: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
  JPEG: "bg-amber-100  text-amber-700  dark:bg-amber-900/50  dark:text-amber-300",
  PNG:  "bg-blue-100   text-blue-700   dark:bg-blue-900/50   dark:text-blue-300",
  GIF:  "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300",
  IMG:  "bg-gray-100   text-gray-600   dark:bg-gray-800      dark:text-gray-300",
};

function FormatBadge({ src }: { src: string }) {
  const fmt = imgFormat(src);
  return (
    <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${FORMAT_STYLE[fmt] ?? FORMAT_STYLE.IMG}`}>
      {fmt}
    </span>
  );
}

// ─── WebP optimizer panel ─────────────────────────────────────────────────────

type ConvertProgress = { done: number; total: number };

function WebPOptimizerPanel({
  nonWebPCount,
  totalKb,
  onConvert,
  progress,
  done,
}: {
  nonWebPCount: number;
  totalKb: number;
  onConvert: () => void;
  progress: ConvertProgress | null;
  done: boolean;
}) {
  if (nonWebPCount === 0 || done) {
    return (
      <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[12px]">
        <CheckCircle2 size={15} className="shrink-0" />
        <span className="font-medium">All images are already WebP — your media library is fully optimised.</span>
      </div>
    );
  }

  const estSavedKb  = Math.round(totalKb * 0.30);
  const converting  = progress !== null;

  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <Zap size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-semibold text-amber-800 dark:text-amber-200">
            {nonWebPCount} image{nonWebPCount !== 1 ? "s" : ""} can be converted to WebP
          </p>
          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
            WebP is ~25–35% smaller than JPEG/PNG at the same quality.
            {totalKb > 0 && ` Estimated saving: ~${estSavedKb > 1024 ? `${(estSavedKb/1024).toFixed(1)} MB` : `${estSavedKb} KB`}.`}
          </p>
          {converting && progress && (
            <div className="mt-2">
              <div className="flex items-center gap-2 text-[11px] text-amber-700 dark:text-amber-400 mb-1">
                <RefreshCw size={10} className="animate-spin" />
                Converting {progress.done} / {progress.total}…
              </div>
              <div className="w-48 h-1.5 rounded-full bg-amber-200 dark:bg-amber-900 overflow-hidden">
                <div
                  className="h-full bg-amber-500 dark:bg-amber-400 rounded-full transition-all duration-300"
                  style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      {!converting && (
        <Button
          size="sm"
          onClick={onConvert}
          className="gap-1.5 h-8 text-[12px] bg-amber-500 hover:bg-amber-600 text-white border-0 shrink-0"
        >
          <Zap size={12} /> Convert All to WebP
        </Button>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MediaLibraryPage() {
  const [search,      setSearch]      = useState("");
  const [typeFilter,  setTypeFilter]  = useState<TypeFilter>("All");
  const [lightbox,    setLightbox]    = useState<{ item: MediaItemView; idx: number } | null>(null);
  const [libItems,    setLibItems]    = useState<MediaLibraryItem[]>(() => getMediaLibraryItems());
  const [uploading,   setUploading]   = useState(false);
  const [progress,    setProgress]    = useState<ConvertProgress | null>(null);
  const [convertDone, setConvertDone] = useState(false);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const [, navigate]  = useLocation();
  const { toast }     = useToast();

  const refreshLib = useCallback(() => setLibItems(getMediaLibraryItems()), []);

  // ── Upload (auto-converts to WebP) ──────────────────────────────────────────
  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const webpSrc = await compressToWebP(file);
        addMediaLibraryItem({
          id:        crypto.randomUUID(),
          src:       webpSrc,
          name:      file.name.replace(/\.[^/.]+$/, ""),
          createdAt: Date.now(),
        });
      }
      refreshLib();
      toast({ title: `${files.length} image${files.length > 1 ? "s" : ""} uploaded as WebP` });
    } catch {
      toast({ title: "Failed to process image", variant: "destructive" });
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [refreshLib, toast]);

  const handleDeleteLibItem = useCallback((id: string) => {
    deleteMediaLibraryItem(id);
    refreshLib();
    if (lightbox?.item.id === id) setLightbox(null);
  }, [refreshLib, lightbox]);

  const products = useMemo(() => getProducts(), [libItems]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Media item list ──────────────────────────────────────────────────────────
  const mediaItems = useMemo<MediaItemView[]>(() => {
    const items: MediaItemView[] = [];
    for (const item of libItems) {
      items.push({ id: item.id, src: item.src, name: item.name, tag: "Library", source: "library", deletable: true });
    }
    for (const p of products) {
      if (p.thumbnail) items.push({ id: `p-${p.id}-thumb`, src: p.thumbnail, name: p.name, sku: p.sku, tag: "Thumb",   source: "product", productId: p.id });
      (p.images ?? []).forEach((img, i) =>
        items.push({ id: `p-${p.id}-img-${i}`, src: img, name: p.name, sku: p.sku, tag: `#${i + 1}`, source: "product", productId: p.id })
      );
      (p.variants ?? []).forEach((v, vi) => {
        if (v.image) {
          const label = Object.values(v.attributes)[0] ?? `v${vi + 1}`;
          items.push({ id: `p-${p.id}-var-${v.id}`, src: v.image, name: `${p.name} · ${label}`, sku: p.sku, tag: "Variant", source: "product", productId: p.id });
        }
      });
    }
    return items;
  }, [libItems, products]);

  const filtered = useMemo<MediaItemView[]>(() => {
    let items = mediaItems;
    if (typeFilter === "library")    items = items.filter(i => i.source === "library");
    if (typeFilter === "thumbnail")  items = items.filter(i => i.tag === "Thumb");
    if (typeFilter === "additional") items = items.filter(i => i.source === "product" && i.tag !== "Thumb");
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(i => i.name.toLowerCase().includes(q) || (i.sku ?? "").toLowerCase().includes(q));
    }
    return items;
  }, [mediaItems, typeFilter, search]);

  const stats = useMemo(() => ({
    total:      mediaItems.length,
    library:    mediaItems.filter(i => i.source === "library").length,
    thumbnails: mediaItems.filter(i => i.tag === "Thumb").length,
    additional: mediaItems.filter(i => i.source === "product" && i.tag !== "Thumb").length,
    products:   new Set(mediaItems.filter(i => i.productId).map(i => i.productId)).size,
  }), [mediaItems]);

  // ── WebP optimiser stats ─────────────────────────────────────────────────────
  const webpStats = useMemo(() => {
    const nonWebP    = mediaItems.filter(i => imgFormat(i.src) !== "WebP" && i.src.startsWith("data:"));
    const totalKb    = nonWebP.reduce((s, i) => s + (dataUrlKb(i.src) ?? 0), 0);
    return { count: nonWebP.length, totalKb };
  }, [mediaItems]);

  // ── Bulk convert ─────────────────────────────────────────────────────────────
  const handleConvertAll = useCallback(async () => {
    const nonWebPLib = libItems.filter(i => imgFormat(i.src) !== "WebP" && i.src.startsWith("data:"));
    const prods      = getProducts();

    // Collect all product images that need converting
    type ProdUpdate = { id: string; thumbnail?: string; images?: string[]; variants?: ReturnType<typeof getProducts>[number]["variants"] };
    const prodUpdates: ProdUpdate[] = [];
    for (const p of prods) {
      let thumbNew:    string | undefined;
      let imagesNew:   string[] | undefined;
      let variantsNew: typeof p.variants | undefined;

      if (p.thumbnail && imgFormat(p.thumbnail) !== "WebP" && p.thumbnail.startsWith("data:")) thumbNew = undefined; // placeholder
      if ((p.images ?? []).some(img => imgFormat(img) !== "WebP" && img.startsWith("data:"))) imagesNew = [...(p.images ?? [])];
      if ((p.variants ?? []).some(v => v.image && imgFormat(v.image) !== "WebP" && v.image.startsWith("data:"))) variantsNew = (p.variants ?? []).map(v => ({ ...v }));

      const needsUpdate = (p.thumbnail && imgFormat(p.thumbnail) !== "WebP" && p.thumbnail.startsWith("data:"))
        || (p.images  ?? []).some(img => imgFormat(img) !== "WebP" && img.startsWith("data:"))
        || (p.variants ?? []).some(v => v.image && imgFormat(v.image) !== "WebP" && v.image.startsWith("data:"));
      if (needsUpdate) prodUpdates.push({ id: p.id, thumbnail: p.thumbnail, images: p.images, variants: p.variants });
    }

    const total = nonWebPLib.length + prodUpdates.reduce((s, u) => {
      const p = prods.find(x => x.id === u.id)!;
      return s
        + (p.thumbnail && imgFormat(p.thumbnail) !== "WebP" && p.thumbnail.startsWith("data:") ? 1 : 0)
        + (p.images ?? []).filter(img => imgFormat(img) !== "WebP" && img.startsWith("data:")).length
        + (p.variants ?? []).filter(v => v.image && imgFormat(v.image) !== "WebP" && v.image.startsWith("data:")).length;
    }, 0);

    if (total === 0) { setConvertDone(true); return; }
    setProgress({ done: 0, total });
    let done = 0;

    // Convert library images
    const newLibItems = [...libItems];
    for (const item of nonWebPLib) {
      const idx = newLibItems.findIndex(i => i.id === item.id);
      if (idx !== -1) {
        try { newLibItems[idx] = { ...newLibItems[idx], src: await convertToWebP(item.src) }; } catch { /* keep original */ }
      }
      done++;
      setProgress({ done, total });
    }
    replaceAllMediaLibraryItems(newLibItems);
    setLibItems(newLibItems);

    // Convert product images
    const productBatch: ProdUpdate[] = [];
    for (const u of prodUpdates) {
      const p = prods.find(x => x.id === u.id)!;
      const patch: ProdUpdate = { id: u.id };

      if (p.thumbnail && imgFormat(p.thumbnail) !== "WebP" && p.thumbnail.startsWith("data:")) {
        try { patch.thumbnail = await convertToWebP(p.thumbnail); } catch { patch.thumbnail = p.thumbnail; }
        done++; setProgress({ done, total });
      }

      if ((p.images ?? []).length > 0) {
        const newImgs = [...(p.images ?? [])];
        for (let i = 0; i < newImgs.length; i++) {
          if (imgFormat(newImgs[i]) !== "WebP" && newImgs[i].startsWith("data:")) {
            try { newImgs[i] = await convertToWebP(newImgs[i]); } catch { /* keep */ }
            done++; setProgress({ done, total });
          }
        }
        patch.images = newImgs;
      }

      if ((p.variants ?? []).length > 0) {
        const newVars = (p.variants ?? []).map(v => ({ ...v }));
        for (const v of newVars) {
          if (v.image && imgFormat(v.image) !== "WebP" && v.image.startsWith("data:")) {
            try { v.image = await convertToWebP(v.image); } catch { /* keep */ }
            done++; setProgress({ done, total });
          }
        }
        patch.variants = newVars;
      }

      productBatch.push(patch);
    }

    bulkReplaceProductImages(productBatch);
    setProgress(null);
    setConvertDone(true);
    toast({ title: `${total} image${total !== 1 ? "s" : ""} converted to WebP` });
  }, [libItems, toast]);

  // ── Lightbox navigation ──────────────────────────────────────────────────────
  const openLightbox  = useCallback((item: MediaItemView, idx: number) => setLightbox({ item, idx }), []);
  const lbNavigate    = useCallback((dir: -1 | 1) => {
    if (!lightbox) return;
    const next = lightbox.idx + dir;
    if (next >= 0 && next < filtered.length) setLightbox({ item: filtered[next], idx: next });
  }, [lightbox, filtered]);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Library size={22} className="text-zinc-500" /> Media Library
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Uploads auto-convert to WebP · click any image to open the lightbox
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="gap-2 h-9" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload size={14} />
            {uploading ? "Uploading…" : "Upload Images"}
          </Button>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => handleUpload(e.target.files)} />
        </div>
      </div>

      {/* WebP optimizer panel */}
      {mediaItems.length > 0 && (
        <WebPOptimizerPanel
          nonWebPCount={webpStats.count}
          totalKb={webpStats.totalKb}
          onConvert={handleConvertAll}
          progress={progress}
          done={convertDone}
        />
      )}

      {/* KPI pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          { label: "All Images",  filter: "All"        as TypeFilter, count: stats.total,      color: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",                      ring: "ring-gray-400"    },
          { label: "Library",     filter: "library"    as TypeFilter, count: stats.library,    color: "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300",         ring: "ring-emerald-500" },
          { label: "Thumbnails",  filter: "thumbnail"  as TypeFilter, count: stats.thumbnails, color: "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300",                 ring: "ring-amber-400"   },
          { label: "Additional",  filter: "additional" as TypeFilter, count: stats.additional, color: "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300",                     ring: "ring-blue-500"    },
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
        <Input placeholder="Search by name or SKU…" className="pl-8 h-8 text-[13px]"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Format legend */}
      <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
        <Info size={11} className="shrink-0" />
        Format badges:
        {(["WebP","JPEG","PNG","GIF"] as const).map(f => (
          <span key={f} className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${FORMAT_STYLE[f]}`}>{f}</span>
        ))}
        <span className="ml-1">· Size shown in KB</span>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <ImageIcon size={48} className="opacity-15" />
          <p className="text-sm font-medium">
            {mediaItems.length === 0 ? "No images yet." : "No images match your search."}
          </p>
          {mediaItems.length === 0 && (
            <div className="flex flex-col items-center gap-2 text-xs text-center max-w-xs">
              <p>Click <strong>Upload Images</strong> to add images to your library.</p>
              <p className="text-muted-foreground/70">New uploads are automatically saved as WebP for the best speed.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-3 [column-gap:0.75rem]">
          {filtered.map((item, i) => {
            const fmt = imgFormat(item.src);
            const kb  = dataUrlKb(item.src);
            return (
              <div key={item.id}
                className="break-inside-avoid mb-3 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 shadow-sm hover:shadow-md transition-all group cursor-pointer bg-white dark:bg-zinc-900 relative"
                onClick={() => openLightbox(item, i)}>
                <img src={item.src} alt={item.name} className="w-full object-cover" loading="lazy" />

                {/* Format badge — top-left overlay */}
                <div className="absolute top-2 left-2">
                  <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded shadow-sm ${FORMAT_STYLE[fmt] ?? FORMAT_STYLE.IMG}`}>
                    {fmt}
                  </span>
                </div>

                {/* Delete button — top-right */}
                {item.deletable && (
                  <button
                    onClick={e => { e.stopPropagation(); handleDeleteLibItem(item.id); }}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-500/80 hover:bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                    <X size={11} />
                  </button>
                )}

                <div className="px-2.5 py-1.5 flex items-center justify-between gap-1">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 truncate">{item.name}</p>
                    <p className="text-[10px] text-zinc-400 truncate flex items-center gap-1">
                      {item.sku || (item.source === "library" ? "Library" : "—")}
                      {kb !== null && <span className="opacity-60">· {kb > 1024 ? `${(kb/1024).toFixed(1)}MB` : `${kb}KB`}</span>}
                    </p>
                  </div>
                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${
                    item.tag === "Library" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" :
                    item.tag === "Thumb"   ? "bg-amber-100  text-amber-700  dark:bg-amber-900/40  dark:text-amber-300"  :
                    item.tag === "Variant" ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" :
                                             "bg-blue-100  text-blue-700  dark:bg-blue-900/40  dark:text-blue-300"
                  }`}>
                    {item.tag}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}>
          {lightbox.idx > 0 && (
            <button onClick={e => { e.stopPropagation(); lbNavigate(-1); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10">
              <ChevronLeft size={24} />
            </button>
          )}
          {lightbox.idx < filtered.length - 1 && (
            <button onClick={e => { e.stopPropagation(); lbNavigate(1); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10">
              <ChevronRight size={24} />
            </button>
          )}

          <div className="relative max-w-3xl w-full bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <img src={lightbox.item.src} alt={lightbox.item.name}
              className="w-full max-h-[65vh] object-contain bg-zinc-100 dark:bg-zinc-800" />
            <div className="px-5 py-3 flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-sm flex items-center gap-2">
                  {lightbox.item.name}
                  <FormatBadge src={lightbox.item.src} />
                  {dataUrlKb(lightbox.item.src) !== null && (
                    <span className="text-[10px] text-muted-foreground font-normal">
                      {(dataUrlKb(lightbox.item.src)! > 1024)
                        ? `${(dataUrlKb(lightbox.item.src)! / 1024).toFixed(1)} MB`
                        : `${dataUrlKb(lightbox.item.src)} KB`}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {lightbox.item.sku && <span className="mr-2">SKU: {lightbox.item.sku}</span>}
                  {lightbox.item.tag === "Library" ? "Library image" :
                   lightbox.item.tag === "Thumb"   ? "Thumbnail"     :
                   lightbox.item.tag === "Variant" ? "Variant image"  :
                   `Additional image ${lightbox.item.tag}`}
                  <span className="ml-2 text-zinc-400">{lightbox.idx + 1} / {filtered.length}</span>
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {lightbox.item.deletable && (
                  <button onClick={() => handleDeleteLibItem(lightbox.item.id)}
                    className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors">
                    <Trash2 size={12} /> Delete
                  </button>
                )}
                {lightbox.item.productId && (
                  <button onClick={() => { navigate("/products"); setLightbox(null); }}
                    className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors">
                    <Package size={12} /> View Product
                  </button>
                )}
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
