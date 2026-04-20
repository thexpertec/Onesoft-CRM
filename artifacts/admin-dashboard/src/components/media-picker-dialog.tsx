import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Image as ImageIcon, Upload, Search, Check, X } from "lucide-react";
import {
  getMediaLibraryItems,
  addMediaLibraryItem,
  deleteMediaLibraryItem,
  getProducts,
  type MediaLibraryItem,
} from "@/lib/store";
import { useToast } from "@/hooks/use-toast";

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

type ImageEntry = {
  id:   string;
  src:  string;
  name: string;
  tag?: string;
  deletable?: boolean;
};

type Props = {
  open:        boolean;
  onClose:     () => void;
  onSelect:    (url: string) => void;
  currentUrl?: string;
  title?:      string;
};

export function MediaPickerDialog({ open, onClose, onSelect, currentUrl, title = "Select Image" }: Props) {
  const [search,   setSearch]   = useState("");
  const [selected, setSelected] = useState<string>(currentUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [libItems, setLibItems]  = useState<MediaLibraryItem[]>(() => getMediaLibraryItems());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const refreshLib = useCallback(() => setLibItems(getMediaLibraryItems()), []);

  useEffect(() => {
    if (open) {
      setLibItems(getMediaLibraryItems());
      setSelected(currentUrl ?? "");
    }
  }, [open, currentUrl]);

  const allImages = useMemo<ImageEntry[]>(() => {
    const entries: ImageEntry[] = [];

    for (const item of libItems) {
      entries.push({ id: item.id, src: item.src, name: item.name, tag: "Library", deletable: true });
    }

    const products = getProducts();
    for (const p of products) {
      if (p.thumbnail) {
        entries.push({ id: `p-${p.id}-thumb`, src: p.thumbnail, name: p.name, tag: "Thumb" });
      }
      (p.images ?? []).forEach((img, i) => {
        entries.push({ id: `p-${p.id}-img-${i}`, src: img, name: p.name, tag: `#${i + 1}` });
      });
      (p.variants ?? []).forEach((v, i) => {
        if (v.image) {
          const label = Object.values(v.attributes)[0] ?? `v${i + 1}`;
          entries.push({ id: `p-${p.id}-var-${v.id}`, src: v.image, name: `${p.name} · ${label}`, tag: "Variant" });
        }
      });
    }

    return entries;
  }, [libItems]);

  const filtered = useMemo(() => {
    if (!search.trim()) return allImages;
    const q = search.toLowerCase();
    return allImages.filter(e => e.name.toLowerCase().includes(q));
  }, [allImages, search]);

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
      toast({ title: `${files.length} image${files.length > 1 ? "s" : ""} added to library` });
    } catch {
      toast({ title: "Failed to process image", variant: "destructive" });
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [refreshLib, toast]);

  const handleDelete = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteMediaLibraryItem(id);
    refreshLib();
    if (selected === allImages.find(i => i.id === id)?.src) setSelected("");
  }, [refreshLib, selected, allImages]);

  const handleConfirm = () => {
    if (selected) {
      onSelect(selected);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[88vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ImageIcon size={15} className="text-blue-500" />
            {title}
          </DialogTitle>
        </DialogHeader>

        {/* Toolbar */}
        <div className="px-4 py-3 flex items-center gap-3 border-b border-border flex-shrink-0 bg-muted/30">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search images…" className="pl-8 h-8 text-[13px]"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button size="sm" variant="outline" className="gap-1.5 text-[12px] h-8"
            onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload size={12} />
            {uploading ? "Uploading…" : "Upload to Library"}
          </Button>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => handleUpload(e.target.files)} />
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {filtered.length} image{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <ImageIcon size={40} className="opacity-15" />
              <p className="text-sm">
                {allImages.length === 0
                  ? "No images yet. Upload one above."
                  : "No images match your search."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2.5">
              {filtered.map(entry => {
                const isSelected = selected === entry.src;
                return (
                  <div key={entry.id}
                    onClick={() => setSelected(isSelected ? "" : entry.src)}
                    className={`relative group aspect-square rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${
                      isSelected
                        ? "border-blue-500 shadow-md shadow-blue-500/20 ring-2 ring-blue-500/30"
                        : "border-border hover:border-blue-300 dark:hover:border-blue-600"
                    } bg-muted`}>
                    <img src={entry.src} alt={entry.name}
                      className="w-full h-full object-cover"
                      loading="lazy" />

                    {/* Selected overlay */}
                    {isSelected && (
                      <div className="absolute inset-0 bg-blue-600/20 flex items-center justify-center">
                        <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center shadow-lg">
                          <Check size={13} className="text-white" />
                        </div>
                      </div>
                    )}

                    {/* Hover overlay with name + delete */}
                    {!isSelected && (
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-end p-1.5 gap-1">
                        <p className="text-[9px] text-white text-center leading-tight line-clamp-2 w-full">
                          {entry.name}
                        </p>
                      </div>
                    )}

                    {/* Tag pill */}
                    <div className={`absolute top-1 left-1 text-[8px] font-bold uppercase px-1 py-0.5 rounded leading-tight ${
                      entry.tag === "Library"
                        ? "bg-emerald-500/90 text-white"
                        : entry.tag === "Thumb"
                        ? "bg-amber-500/90 text-white"
                        : entry.tag === "Variant"
                        ? "bg-violet-500/90 text-white"
                        : "bg-blue-500/90 text-white"
                    }`}>
                      {entry.tag}
                    </div>

                    {/* Delete button (library items only) */}
                    {entry.deletable && (
                      <button
                        onClick={e => handleDelete(entry.id, e)}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                        title="Remove from library">
                        <X size={10} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-border flex-shrink-0 flex items-center justify-between gap-3 bg-background">
          <div className="flex items-center gap-2 min-w-0">
            {selected ? (
              <>
                <img src={selected} alt="Selected" className="w-9 h-9 rounded-lg object-cover border border-border flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-foreground">Image selected</p>
                  <button onClick={() => setSelected("")} className="text-[10px] text-muted-foreground hover:text-red-500 flex items-center gap-0.5 transition-colors">
                    <X size={9} /> Clear
                  </button>
                </div>
              </>
            ) : (
              <p className="text-[12px] text-muted-foreground">Click an image to select it</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" disabled={!selected} onClick={handleConfirm} className="gap-1.5">
              <Check size={13} /> Use Image
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
