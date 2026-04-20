import { useState, useMemo, useCallback, useRef } from "react";
import { Image as ImageIcon, Search, X, Package, ChevronLeft, ChevronRight, Upload, Library, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  getProducts,
  getMediaLibraryItems,
  addMediaLibraryItem,
  deleteMediaLibraryItem,
  type MediaLibraryItem,
} from "@/lib/store";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

type MediaSource = "library" | "product";
type MediaItemView = {
  id:          string;
  src:         string;
  name:        string;
  sku?:        string;
  tag:         string;
  productId?:  string;
  source:      MediaSource;
  deletable?:  boolean;
};

function compressImage(file: File, maxW = 1200, maxH = 1200, quality = 0.85): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width, maxH / img.height);
        const canvas = document.createElement("canvas");
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        res(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = rej;
      img.src = ev.target?.result as string;
    };
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

type TypeFilter = "All" | "library" | "thumbnail" | "additional";

export default function MediaLibraryPage() {
  const [search,     setSearch]     = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("All");
  const [lightbox,   setLightbox]   = useState<{ item: MediaItemView; idx: number } | null>(null);
  const [libItems,   setLibItems]   = useState<MediaLibraryItem[]>(() => getMediaLibraryItems());
  const [uploading,  setUploading]  = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, navigate] = useLocation();
  const { toast }    = useToast();

  const refreshLib = useCallback(() => setLibItems(getMediaLibraryItems()), []);

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const compressed = await compressImage(file);
        const item: MediaLibraryItem = {
          id:        crypto.randomUUID(),
          src:       compressed,
          name:      file.name.replace(/\.[^/.]+$/, ""),
          createdAt: Date.now(),
        };
        addMediaLibraryItem(item);
      }
      refreshLib();
      toast({ title: `${files.length} image${files.length > 1 ? "s" : ""} uploaded to library` });
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

  const products = useMemo(() => getProducts(), []);

  const mediaItems = useMemo<MediaItemView[]>(() => {
    const items: MediaItemView[] = [];

    for (const item of libItems) {
      items.push({
        id: item.id, src: item.src, name: item.name,
        tag: "Library", source: "library", deletable: true,
      });
    }

    for (const p of products) {
      if (p.thumbnail) {
        items.push({
          id: `p-${p.id}-thumb`, src: p.thumbnail,
          name: p.name, sku: p.sku, tag: "Thumb",
          source: "product", productId: p.id,
        });
      }
      (p.images ?? []).forEach((img, i) => {
        items.push({
          id: `p-${p.id}-img-${i}`, src: img,
          name: p.name, sku: p.sku, tag: `#${i + 1}`,
          source: "product", productId: p.id,
        });
      });
      (p.variants ?? []).forEach((v, vi) => {
        if (v.image) {
          const label = Object.values(v.attributes)[0] ?? `v${vi + 1}`;
          items.push({
            id: `p-${p.id}-var-${v.id}`, src: v.image,
            name: `${p.name} · ${label}`, sku: p.sku, tag: "Variant",
            source: "product", productId: p.id,
          });
        }
      });
    }

    return items;
  }, [libItems, products]);

  const filtered = useMemo<MediaItemView[]>(() => {
    let items = mediaItems;
    if (typeFilter === "library")    items = items.filter(i => i.source === "library");
    else if (typeFilter === "thumbnail") items = items.filter(i => i.tag === "Thumb");
    else if (typeFilter === "additional") items = items.filter(i => i.source === "product" && i.tag !== "Thumb");
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

  const openLightbox = useCallback((item: MediaItemView, idx: number) => setLightbox({ item, idx }), []);

  const lbNavigate = useCallback((dir: -1 | 1) => {
    if (!lightbox) return;
    const next = lightbox.idx + dir;
    if (next >= 0 && next < filtered.length) setLightbox({ item: filtered[next], idx: next });
  }, [lightbox, filtered]);

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Library size={22} className="text-zinc-500" /> Media Library
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Upload images to the library · use them as product thumbnails, variants & more
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

      {/* KPI pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          { label: "All Images",   filter: "All"        as TypeFilter, count: stats.total,      color: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",                       ring: "ring-gray-400"    },
          { label: "Library",      filter: "library"    as TypeFilter, count: stats.library,    color: "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300",          ring: "ring-emerald-500" },
          { label: "Thumbnails",   filter: "thumbnail"  as TypeFilter, count: stats.thumbnails, color: "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300",                  ring: "ring-amber-400"   },
          { label: "Additional",   filter: "additional" as TypeFilter, count: stats.additional, color: "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300",                      ring: "ring-blue-500"    },
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

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <ImageIcon size={48} className="opacity-15" />
          <p className="text-sm font-medium">
            {mediaItems.length === 0 ? "No images yet." : "No images match your search."}
          </p>
          {mediaItems.length === 0 && (
            <div className="flex flex-col items-center gap-2 text-xs text-center max-w-xs">
              <p>Click <strong>Upload Images</strong> above to add images to your library.</p>
              <p className="text-muted-foreground/70">
                Or open a product and use the camera icon to assign thumbnail & additional photos.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-3 [column-gap:0.75rem]">
          {filtered.map((item, i) => (
            <div key={item.id}
              className="break-inside-avoid mb-3 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 shadow-sm hover:shadow-md transition-all group cursor-pointer bg-white dark:bg-zinc-900 relative"
              onClick={() => openLightbox(item, i)}>
              <img src={item.src} alt={item.name} className="w-full object-cover" loading="lazy" />
              <div className="px-2.5 py-1.5 flex items-center justify-between gap-1">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 truncate">{item.name}</p>
                  <p className="text-[10px] text-zinc-400 truncate">{item.sku || (item.source === "library" ? "Library image" : "—")}</p>
                </div>
                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${
                  item.tag === "Library"  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" :
                  item.tag === "Thumb"    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" :
                  item.tag === "Variant"  ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" :
                                            "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                }`}>
                  {item.tag}
                </span>
              </div>
              {/* Delete overlay for library items */}
              {item.deletable && (
                <button
                  onClick={e => { e.stopPropagation(); handleDeleteLibItem(item.id); }}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-500/80 hover:bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  title="Remove from library">
                  <X size={11} />
                </button>
              )}
            </div>
          ))}
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
                <p className="font-semibold text-sm">{lightbox.item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {lightbox.item.sku && <span className="mr-2">SKU: {lightbox.item.sku}</span>}
                  {lightbox.item.tag === "Library" ? "Library image" :
                   lightbox.item.tag === "Thumb"   ? "Thumbnail" :
                   lightbox.item.tag === "Variant" ? "Variant image" :
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
