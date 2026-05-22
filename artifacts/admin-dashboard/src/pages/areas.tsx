import { useState, useRef, useEffect } from "react";
import { MapPin, Plus, Pencil, Trash2, Check, X, Globe, Building2, Search } from "lucide-react";
import { useCities, useAreas } from "@/hooks/use-data";
import { City, Area } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ── Inline edit row ──────────────────────────────────────────────────────────
function InlineForm({
  initial, placeholder, onSave, onCancel,
}: { initial?: { name: string; extra?: string }; placeholder: string; onSave: (name: string, extra: string) => void; onCancel: () => void; }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [extra, setExtra] = useState(initial?.extra ?? "");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg">
      <div className="flex-1 flex gap-2">
        <Input
          ref={ref} value={name} onChange={e => setName(e.target.value)}
          placeholder={placeholder}
          className="h-7 text-[13px] border-0 bg-transparent shadow-none p-0 focus-visible:ring-0 flex-1"
          onKeyDown={e => { if (e.key === "Enter") onSave(name.trim(), extra.trim()); if (e.key === "Escape") onCancel(); }}
        />
        <Input
          value={extra} onChange={e => setExtra(e.target.value)}
          placeholder="Country / notes (optional)"
          className="h-7 text-[13px] border-0 bg-transparent shadow-none p-0 focus-visible:ring-0 w-48"
          onKeyDown={e => { if (e.key === "Enter") onSave(name.trim(), extra.trim()); if (e.key === "Escape") onCancel(); }}
        />
      </div>
      <button onClick={() => onSave(name.trim(), extra.trim())} className="text-primary hover:text-primary/80 transition-colors">
        <Check size={15} />
      </button>
      <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
        <X size={15} />
      </button>
    </div>
  );
}

// ── Area inline form (simpler — just name + notes) ───────────────────────────
function AreaForm({
  initial, onSave, onCancel,
}: { initial?: { name: string; notes: string }; onSave: (name: string, notes: string) => void; onCancel: () => void; }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg">
      <div className="flex-1 flex gap-2">
        <Input
          ref={ref} value={name} onChange={e => setName(e.target.value)}
          placeholder="Area / Region name"
          className="h-7 text-[13px] border-0 bg-transparent shadow-none p-0 focus-visible:ring-0 flex-1"
          onKeyDown={e => { if (e.key === "Enter") onSave(name.trim(), notes.trim()); if (e.key === "Escape") onCancel(); }}
        />
        <Input
          value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="h-7 text-[13px] border-0 bg-transparent shadow-none p-0 focus-visible:ring-0 w-44"
          onKeyDown={e => { if (e.key === "Enter") onSave(name.trim(), notes.trim()); if (e.key === "Escape") onCancel(); }}
        />
      </div>
      <button onClick={() => onSave(name.trim(), notes.trim())} className="text-emerald-600 hover:text-emerald-700 transition-colors">
        <Check size={15} />
      </button>
      <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
        <X size={15} />
      </button>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function AreasPage() {
  const { cities, add: addCity, edit: editCity, remove: removeCity } = useCities();
  const { areas, add: addArea, edit: editArea, remove: removeArea } = useAreas();
  const { toast } = useToast();

  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [citySearch,     setCitySearch]     = useState("");
  const [areaSearch,     setAreaSearch]     = useState("");

  // City state
  const [addingCity,   setAddingCity]   = useState(false);
  const [editingCityId, setEditingCityId] = useState<string | null>(null);
  const [deleteCityId, setDeleteCityId] = useState<string | null>(null);

  // Area state
  const [addingArea,   setAddingArea]   = useState(false);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [deleteAreaId, setDeleteAreaId] = useState<string | null>(null);

  const selectedCity = cities.find(c => c.id === selectedCityId) ?? null;

  const filteredCities = cities.filter(c =>
    !citySearch || c.name.toLowerCase().includes(citySearch.toLowerCase()) || c.country.toLowerCase().includes(citySearch.toLowerCase())
  );

  const filteredAreas = areas
    .filter(a => a.cityId === selectedCityId)
    .filter(a => !areaSearch || a.name.toLowerCase().includes(areaSearch.toLowerCase()));

  // ── City actions ────────────────────────────────────────────────────────
  // City/Area mutators are now async (REST-backed). Each handler awaits and
  // shows a destructive toast on failure so backend 409/5xx errors surface
  // instead of becoming silent unhandled rejections.
  const handleAddCity = async (name: string, country: string) => {
    if (!name) { toast({ title: "City name is required", variant: "destructive" }); return; }
    if (cities.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      toast({ title: "City already exists", description: `"${name}" already exists.`, variant: "destructive" }); return;
    }
    try {
      const city = await addCity({ name, country, notes: "" });
      setSelectedCityId(city.id);
      setAddingCity(false);
      toast({ title: "City added", description: name });
    } catch (e) {
      toast({ title: "Cannot add city", description: (e as Error).message, variant: "destructive" });
    }
  };

  const handleEditCity = async (id: string, name: string, country: string) => {
    if (!name) { toast({ title: "City name is required", variant: "destructive" }); return; }
    try {
      await editCity(id, { name, country });
      setEditingCityId(null);
      toast({ title: "City updated" });
    } catch (e) {
      toast({ title: "Cannot update city", description: (e as Error).message, variant: "destructive" });
    }
  };

  const handleDeleteCity = async () => {
    if (!deleteCityId) return;
    const city = cities.find(c => c.id === deleteCityId);
    const areaCount = areas.filter(a => a.cityId === deleteCityId).length;
    try {
      await removeCity(deleteCityId);
      if (selectedCityId === deleteCityId) setSelectedCityId(null);
      toast({ title: "City deleted", description: areaCount > 0 ? `${areaCount} area${areaCount !== 1 ? "s" : ""} also removed.` : city?.name });
    } catch (e) {
      toast({ title: "Cannot delete city", description: (e as Error).message, variant: "destructive" });
    }
    setDeleteCityId(null);
  };

  // ── Area actions ────────────────────────────────────────────────────────
  const handleAddArea = async (name: string, notes: string) => {
    if (!name) { toast({ title: "Area name is required", variant: "destructive" }); return; }
    if (!selectedCityId) return;
    if (areas.some(a => a.cityId === selectedCityId && a.name.toLowerCase() === name.toLowerCase())) {
      toast({ title: "Area already exists", description: `"${name}" already exists in ${selectedCity?.name}.`, variant: "destructive" }); return;
    }
    try {
      await addArea({ name, cityId: selectedCityId, notes });
      setAddingArea(false);
      toast({ title: "Area added", description: `${name} added to ${selectedCity?.name}` });
    } catch (e) {
      toast({ title: "Cannot add area", description: (e as Error).message, variant: "destructive" });
    }
  };

  const handleEditArea = async (id: string, name: string, notes: string) => {
    if (!name) { toast({ title: "Area name is required", variant: "destructive" }); return; }
    try {
      await editArea(id, { name, notes });
      setEditingAreaId(null);
      toast({ title: "Area updated" });
    } catch (e) {
      toast({ title: "Cannot update area", description: (e as Error).message, variant: "destructive" });
    }
  };

  const handleDeleteArea = async () => {
    if (!deleteAreaId) return;
    const area = areas.find(a => a.id === deleteAreaId);
    try {
      await removeArea(deleteAreaId);
      toast({ title: "Area deleted", description: area?.name });
    } catch (e) {
      toast({ title: "Cannot delete area", description: (e as Error).message, variant: "destructive" });
    }
    setDeleteAreaId(null);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <MapPin size={22} className="text-primary" /> Cities &amp; Areas
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage cities and their areas / regions — used by Customers, Suppliers &amp; Sales Agents for reporting
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 border rounded-lg px-3 py-2">
          <Globe size={13} /> {cities.length} {cities.length === 1 ? "city" : "cities"} &nbsp;·&nbsp;
          <MapPin size={11} /> {areas.length} {areas.length === 1 ? "area" : "areas"} total
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="grid grid-cols-[340px_1fr] gap-4 min-h-[540px]">

        {/* ── Left: Cities panel ─────────────────────────────────────────── */}
        <div className="border rounded-xl overflow-hidden flex flex-col bg-card">
          <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Building2 size={14} className="text-primary" />
              <span className="text-[13px] font-semibold">Cities</span>
              <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{cities.length}</span>
            </div>
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-[12px] text-primary" onClick={() => { setAddingCity(true); setEditingCityId(null); }}>
              <Plus size={12} /> Add City
            </Button>
          </div>

          {/* City search */}
          <div className="px-3 py-2 border-b bg-background">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={citySearch} onChange={e => setCitySearch(e.target.value)}
                placeholder="Search cities…"
                className="h-7 pl-7 text-[12px] bg-muted/40 border-0 shadow-none focus-visible:ring-1"
              />
            </div>
          </div>

          {/* City list */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {addingCity && (
              <InlineForm
                placeholder="City name"
                onSave={handleAddCity}
                onCancel={() => setAddingCity(false)}
              />
            )}
            {filteredCities.length === 0 && !addingCity && (
              <div className="text-center py-10 text-muted-foreground text-sm">
                {citySearch ? "No cities match your search" : "No cities yet — add one above"}
              </div>
            )}
            {filteredCities.map(city => {
              const areaCount = areas.filter(a => a.cityId === city.id).length;
              const isSelected = city.id === selectedCityId;
              const isEditing = editingCityId === city.id;

              if (isEditing) {
                return (
                  <InlineForm
                    key={city.id}
                    initial={{ name: city.name, extra: city.country }}
                    placeholder="City name"
                    onSave={(n, e) => handleEditCity(city.id, n, e)}
                    onCancel={() => setEditingCityId(null)}
                  />
                );
              }

              return (
                <button
                  key={city.id}
                  onClick={() => { setSelectedCityId(city.id); setAddingArea(false); setAreaSearch(""); }}
                  className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all group ${
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted/60 text-foreground"
                  }`}
                >
                  <Building2 size={13} className={isSelected ? "text-primary-foreground/70" : "text-muted-foreground"} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] font-medium truncate ${isSelected ? "text-primary-foreground" : ""}`}>{city.name}</p>
                    {city.country && (
                      <p className={`text-[11px] truncate ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{city.country}</p>
                    )}
                  </div>
                  <span className={`text-[11px] shrink-0 px-1.5 py-0.5 rounded-full font-semibold ${
                    isSelected ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}>
                    {areaCount}
                  </span>
                  <span className={`flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ${isSelected ? "opacity-100" : ""}`}>
                    <button
                      onClick={e => { e.stopPropagation(); setEditingCityId(city.id); setAddingCity(false); }}
                      className={`p-1 rounded hover:bg-white/20 ${isSelected ? "text-primary-foreground/80 hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setDeleteCityId(city.id); }}
                      className={`p-1 rounded hover:bg-red-500/20 ${isSelected ? "text-primary-foreground/80 hover:text-red-200" : "text-muted-foreground hover:text-destructive"}`}
                    >
                      <Trash2 size={11} />
                    </button>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Right: Areas panel ─────────────────────────────────────────── */}
        <div className="border rounded-xl overflow-hidden flex flex-col bg-card">
          {!selectedCity ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center">
                <MapPin size={28} className="text-muted-foreground/40" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Select a city</p>
                <p className="text-muted-foreground text-sm mt-1">Choose a city on the left to manage its areas &amp; regions</p>
              </div>
              {cities.length === 0 && (
                <Button size="sm" onClick={() => setAddingCity(true)} className="gap-1.5 mt-2">
                  <Plus size={13} /> Add your first city
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MapPin size={14} className="text-emerald-600" />
                  <span className="text-[13px] font-semibold">Areas in <span className="text-emerald-600">{selectedCity.name}</span></span>
                  <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{filteredAreas.length}</span>
                </div>
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-[12px] text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                  onClick={() => { setAddingArea(true); setEditingAreaId(null); }}>
                  <Plus size={12} /> Add Area
                </Button>
              </div>

              {/* Area search */}
              <div className="px-3 py-2 border-b bg-background">
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={areaSearch} onChange={e => setAreaSearch(e.target.value)}
                    placeholder="Search areas…"
                    className="h-7 pl-7 text-[12px] bg-muted/40 border-0 shadow-none focus-visible:ring-1"
                  />
                </div>
              </div>

              {/* Area list */}
              <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                {addingArea && (
                  <AreaForm
                    onSave={handleAddArea}
                    onCancel={() => setAddingArea(false)}
                  />
                )}

                {filteredAreas.length === 0 && !addingArea && (
                  <div className="text-center py-12 text-muted-foreground">
                    <MapPin size={32} className="mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-medium">
                      {areaSearch ? "No areas match your search" : `No areas in ${selectedCity.name} yet`}
                    </p>
                    {!areaSearch && (
                      <p className="text-xs mt-1">Click "Add Area" to add the first area or region</p>
                    )}
                  </div>
                )}

                {filteredAreas.map((area, idx) => {
                  if (editingAreaId === area.id) {
                    return (
                      <AreaForm
                        key={area.id}
                        initial={{ name: area.name, notes: area.notes }}
                        onSave={(n, notes) => handleEditArea(area.id, n, notes)}
                        onCancel={() => setEditingAreaId(null)}
                      />
                    );
                  }
                  return (
                    <div key={area.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-card hover:bg-muted/30 transition-colors group">
                      <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-[11px] font-bold shrink-0">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate">{area.name}</p>
                        {area.notes && <p className="text-[11px] text-muted-foreground truncate">{area.notes}</p>}
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={() => { setEditingAreaId(area.id); setAddingArea(false); }}
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => setDeleteAreaId(area.id)}
                          className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer hint */}
              <div className="px-4 py-2.5 border-t bg-muted/20 text-[11px] text-muted-foreground flex items-center gap-1.5">
                <MapPin size={10} />
                Areas are available as dropdowns when adding/editing Customers, Suppliers &amp; Sales Agents
              </div>
            </>
          )}
        </div>
      </div>

      {/* Delete City dialog */}
      <AlertDialog open={!!deleteCityId} onOpenChange={open => !open && setDeleteCityId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete City</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const city = cities.find(c => c.id === deleteCityId);
                const cnt = areas.filter(a => a.cityId === deleteCityId).length;
                return `Are you sure you want to delete "${city?.name}"?${cnt > 0 ? ` This will also remove ${cnt} area${cnt !== 1 ? "s" : ""} under it.` : ""}`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDeleteCity}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Area dialog */}
      <AlertDialog open={!!deleteAreaId} onOpenChange={open => !open && setDeleteAreaId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Area</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{areas.find(a => a.id === deleteAreaId)?.name}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDeleteArea}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
