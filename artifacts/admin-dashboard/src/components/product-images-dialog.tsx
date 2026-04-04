import { useState, useRef, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon, Upload, X, Plus, Star } from "lucide-react";
import { Product } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";

function compressImage(file: File, maxW: number, maxH: number, quality = 0.82): Promise<string> {
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

type Props = {
  product: Product;
  open: boolean;
  onClose: () => void;
  onSave: (thumbnail: string | undefined, images: string[]) => void;
};

export function ProductImagesDialog({ product, open, onClose, onSave }: Props) {
  const [thumbnail, setThumbnail] = useState<string | undefined>(product.thumbnail);
  const [images,    setImages]    = useState<string[]>(product.images ?? []);
  const [loading,   setLoading]   = useState(false);
  const { toast } = useToast();

  const thumbInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef   = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setThumbnail(product.thumbnail);
      setImages(product.images ?? []);
    }
  }, [open, product.id]);

  const handleThumbnail = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setLoading(true);
    try {
      const compressed = await compressImage(files[0], 600, 600, 0.85);
      setThumbnail(compressed);
    } catch {
      toast({ title: "Failed to process image", variant: "destructive" });
    }
    setLoading(false);
    if (thumbInputRef.current) thumbInputRef.current.value = "";
  }, [toast]);

  const handleAddImages = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setLoading(true);
    try {
      const newImgs = await Promise.all(Array.from(files).map(f => compressImage(f, 1200, 1200, 0.82)));
      setImages(prev => [...prev, ...newImgs]);
    } catch {
      toast({ title: "Failed to process one or more images", variant: "destructive" });
    }
    setLoading(false);
    if (imgInputRef.current) imgInputRef.current.value = "";
  }, [toast]);

  const promoteToThumb = (i: number) => {
    setThumbnail(images[i]);
    setImages(prev => prev.filter((_, idx) => idx !== i));
  };

  const removeImage = (i: number) => setImages(prev => prev.filter((_, idx) => idx !== i));

  const handleSave = () => {
    onSave(thumbnail, images);
    onClose();
  };

  const stopDrag = (e: React.DragEvent) => e.preventDefault();

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon size={16} className="text-blue-500" /> Images — {product.name}
          </DialogTitle>
          <DialogDescription>
            Upload a thumbnail and additional photos. Images are stored locally.
          </DialogDescription>
        </DialogHeader>

        {/* ── Thumbnail ── */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Star size={13} className="text-amber-500" />
            <span className="text-sm font-semibold">Thumbnail</span>
            <span className="text-xs text-muted-foreground">shown in lists & previews</span>
          </div>

          <div
            className={`relative rounded-xl border-2 border-dashed transition-colors ${thumbnail ? "border-emerald-200 dark:border-emerald-800" : "border-zinc-200 dark:border-zinc-700 hover:border-blue-300 dark:hover:border-blue-700"} bg-zinc-50 dark:bg-zinc-800/50 overflow-hidden`}
            onDragOver={stopDrag}
            onDrop={e => { e.preventDefault(); handleThumbnail(e.dataTransfer.files); }}>
            {thumbnail ? (
              <div className="flex items-start gap-4 p-4">
                <img src={thumbnail} alt="Thumbnail" className="w-36 h-36 object-cover rounded-lg border border-zinc-200 dark:border-zinc-700 shadow-sm flex-shrink-0" />
                <div className="flex flex-col gap-2 mt-1">
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">✓ Thumbnail set</span>
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => thumbInputRef.current?.click()}>
                    <Upload size={11} /> Replace
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => setThumbnail(undefined)}>
                    <X size={11} /> Remove
                  </Button>
                </div>
              </div>
            ) : (
              <button
                className="w-full h-40 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                onClick={() => thumbInputRef.current?.click()}>
                <Upload size={28} className="opacity-40" />
                <span className="text-sm">Click or drag to upload thumbnail</span>
                <span className="text-xs opacity-60">JPG · PNG · WebP · GIF</span>
              </button>
            )}
          </div>
          <input ref={thumbInputRef} type="file" accept="image/*" className="hidden"
            onChange={e => handleThumbnail(e.target.files)} />
        </div>

        {/* ── Additional images ── */}
        <div className="space-y-2 mt-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ImageIcon size={13} className="text-blue-500" />
              <span className="text-sm font-semibold">Additional Images</span>
              <span className="text-xs text-muted-foreground">{images.length} image{images.length !== 1 ? "s" : ""}</span>
            </div>
            {images.length > 0 && (
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => imgInputRef.current?.click()}>
                <Plus size={11} /> Add More
              </Button>
            )}
          </div>

          <div
            className={`rounded-xl border-2 border-dashed transition-colors p-3 bg-zinc-50 dark:bg-zinc-800/50 ${images.length === 0 ? "border-zinc-200 dark:border-zinc-700 hover:border-blue-300 dark:hover:border-blue-700" : "border-transparent"}`}
            onDragOver={stopDrag}
            onDrop={e => { e.preventDefault(); handleAddImages(e.dataTransfer.files); }}>
            {images.length === 0 ? (
              <button
                className="w-full h-28 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                onClick={() => imgInputRef.current?.click()}>
                <Plus size={24} className="opacity-40" />
                <span className="text-sm">Click or drag to add images</span>
                <span className="text-xs opacity-60">Multiple files supported</span>
              </button>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {images.map((img, i) => (
                  <div key={i} className="relative group rounded-lg overflow-hidden aspect-square bg-zinc-100 dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600">
                    <img src={img} alt={`Image ${i + 1}`} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                      <button onClick={() => promoteToThumb(i)} title="Set as thumbnail"
                        className="p-1.5 rounded-full bg-amber-500 text-white hover:bg-amber-600 transition-colors">
                        <Star size={11} />
                      </button>
                      <button onClick={() => removeImage(i)} title="Remove"
                        className="p-1.5 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors">
                        <X size={11} />
                      </button>
                    </div>
                    <div className="absolute bottom-1 right-1 text-[9px] bg-black/50 text-white rounded px-1 leading-4">{i + 1}</div>
                  </div>
                ))}
                <button onClick={() => imgInputRef.current?.click()}
                  className="aspect-square rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-600 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-blue-500 hover:border-blue-400 dark:hover:border-blue-500 transition-colors">
                  <Plus size={18} className="opacity-60" />
                  <span className="text-[10px]">Add</span>
                </button>
              </div>
            )}
          </div>
          <input ref={imgInputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => handleAddImages(e.target.files)} />
        </div>

        {/* ── Tips ── */}
        <p className="text-[11px] text-muted-foreground bg-zinc-50 dark:bg-zinc-800/40 rounded-lg px-3 py-2 border border-zinc-100 dark:border-zinc-700/50">
          <strong>Tip:</strong> Hover an additional image and click ⭐ to promote it to thumbnail. Images are stored locally in your browser.
        </p>

        {/* ── Footer ── */}
        <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading} className="gap-1.5">
            <ImageIcon size={13} /> {loading ? "Processing…" : "Save Images"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
