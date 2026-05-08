import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon, X, Plus, Star, Library } from "lucide-react";
import { Product } from "@/lib/store";
import { MediaPickerDialog } from "@/components/media-picker-dialog";

type Props = {
  product: Product;
  open: boolean;
  onClose: () => void;
  onSave: (thumbnail: string | undefined, images: string[]) => void;
};

export function ProductImagesDialog({ product, open, onClose, onSave }: Props) {
  const [thumbnail, setThumbnail] = useState<string | undefined>(product.thumbnail);
  const [images,    setImages]    = useState<string[]>(product.images ?? []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<"thumbnail" | "additional">("thumbnail");

  useEffect(() => {
    if (open) {
      setThumbnail(product.thumbnail);
      setImages(product.images ?? []);
    }
  }, [open, product.id]);

  const openPicker = (target: "thumbnail" | "additional") => {
    setPickerTarget(target);
    setPickerOpen(true);
  };

  const handlePickerSelect = (url: string) => {
    if (pickerTarget === "thumbnail") {
      setThumbnail(url);
    } else {
      setImages(prev => [...prev, url]);
    }
    setPickerOpen(false);
  };

  const promoteToThumb = (i: number) => {
    setThumbnail(images[i]);
    setImages(prev => prev.filter((_, idx) => idx !== i));
  };

  const removeImage = (i: number) => setImages(prev => prev.filter((_, idx) => idx !== i));

  const handleSave = () => {
    onSave(thumbnail, images);
    onClose();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon size={16} className="text-blue-500" /> Images — {product.name}
            </DialogTitle>
            <DialogDescription>
              Select images from the Media Library to use as thumbnail and additional photos.
            </DialogDescription>
          </DialogHeader>

          {/* ── Thumbnail ── */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Star size={13} className="text-amber-500" />
              <span className="text-sm font-semibold">Thumbnail</span>
              <span className="text-xs text-muted-foreground">shown in lists & previews</span>
            </div>

            <div className={`relative rounded-xl border-2 transition-colors ${
              thumbnail
                ? "border-emerald-200 dark:border-emerald-800"
                : "border-dashed border-zinc-200 dark:border-zinc-700 hover:border-blue-300 dark:hover:border-blue-700"
            } bg-zinc-50 dark:bg-zinc-800/50 overflow-hidden`}>
              {thumbnail ? (
                <div className="flex items-start gap-4 p-4">
                  <img src={thumbnail} alt="Thumbnail"
                    className="w-36 h-36 object-cover rounded-lg border border-zinc-200 dark:border-zinc-700 shadow-sm flex-shrink-0" loading="lazy" />
                  <div className="flex flex-col gap-2 mt-1">
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">✓ Thumbnail set</span>
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => openPicker("thumbnail")}>
                      <Library size={11} /> Replace from Library
                    </Button>
                    <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                      onClick={() => setThumbnail(undefined)}>
                      <X size={11} /> Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  className="w-full h-40 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  onClick={() => openPicker("thumbnail")}>
                  <Library size={28} className="opacity-40" />
                  <span className="text-sm">Click to select from Media Library</span>
                  <span className="text-xs opacity-60">Browse or upload in the library picker</span>
                </button>
              )}
            </div>
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
                <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => openPicker("additional")}>
                  <Plus size={11} /> Add from Library
                </Button>
              )}
            </div>

            <div className={`rounded-xl border-2 transition-colors p-3 bg-zinc-50 dark:bg-zinc-800/50 ${
              images.length === 0
                ? "border-dashed border-zinc-200 dark:border-zinc-700 hover:border-blue-300 dark:hover:border-blue-700"
                : "border-transparent"
            }`}>
              {images.length === 0 ? (
                <button
                  className="w-full h-28 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  onClick={() => openPicker("additional")}>
                  <Plus size={24} className="opacity-40" />
                  <span className="text-sm">Add images from Media Library</span>
                </button>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {images.map((img, i) => (
                    <div key={i} className="relative group rounded-lg overflow-hidden aspect-square bg-zinc-100 dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600">
                      <img src={img} alt={`Image ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
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
                  <button onClick={() => openPicker("additional")}
                    className="aspect-square rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-600 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-blue-500 hover:border-blue-400 dark:hover:border-blue-500 transition-colors">
                    <Plus size={18} className="opacity-60" />
                    <span className="text-[10px]">Add</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Tip ── */}
          <p className="text-[11px] text-muted-foreground bg-zinc-50 dark:bg-zinc-800/40 rounded-lg px-3 py-2 border border-zinc-100 dark:border-zinc-700/50">
            <strong>Tip:</strong> Hover an additional image and click ⭐ to promote it to thumbnail. Upload new images via the <strong>Media Library</strong> picker.
          </p>

          {/* ── Footer ── */}
          <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} className="gap-1.5">
              <ImageIcon size={13} /> Save Images
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <MediaPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handlePickerSelect}
        currentUrl={pickerTarget === "thumbnail" ? thumbnail : undefined}
        title={pickerTarget === "thumbnail" ? "Select Thumbnail" : "Add Image"}
      />
    </>
  );
}
