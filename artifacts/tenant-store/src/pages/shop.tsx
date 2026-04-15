import { useState, useMemo, useEffect, useCallback } from "react";
import { useSearch } from "wouter";
import {
  SlidersHorizontal, Search, X, ChevronDown, ChevronRight,
  LayoutGrid, List, Tag, Check, SlidersVertical,
} from "lucide-react";
import { useStore } from "@/contexts/store-context";
import { ProductCard } from "@/components/product-card";
import { cn, getStockQty } from "@/lib/utils";
import type { Product } from "@/types/product";

// ─── Types & constants ──────────────────────────────────────────────────────────
type SortKey = "default" | "price_asc" | "price_desc" | "newest" | "name_asc";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "default",    label: "Featured"          },
  { key: "newest",     label: "Newest First"       },
  { key: "price_asc",  label: "Price: Low → High"  },
  { key: "price_desc", label: "Price: High → Low"  },
  { key: "name_asc",   label: "Name A–Z"           },
];

const CONDITIONS = ["New", "Refurbished", "Open Box", "Used", "Damaged"] as const;

const PRICE_PRESETS = [
  { label: "Under £25",   min: "",   max: "25"   },
  { label: "£25–£50",     min: "25", max: "50"   },
  { label: "£50–£100",    min: "50", max: "100"  },
  { label: "£100–£200",   min: "100",max: "200"  },
  { label: "Over £200",   min: "200",max: ""     },
];

const PAGE_SIZE = 24;

// Effective price for filtering (websitePrice overrides price)
function ep(p: Product): number {
  const wp = parseFloat(p.websitePrice || "");
  return !isNaN(wp) && wp > 0 ? wp : parseFloat(p.price || "0");
}

function sortProducts(products: Product[], sort: SortKey): Product[] {
  return [...products].sort((a, b) => {
    if (sort === "price_asc")  return ep(a) - ep(b);
    if (sort === "price_desc") return ep(b) - ep(a);
    if (sort === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (sort === "name_asc") return a.name.localeCompare(b.name);
    return 0;
  });
}

// ─── Main page ──────────────────────────────────────────────────────────────────
export function ShopPage() {
  const { products, loading } = useStore();
  const search = useSearch();
  const params = new URLSearchParams(search);

  // Filter state
  const [query,              setQuery]              = useState(params.get("q") ?? "");
  const [sort,               setSort]               = useState<SortKey>((params.get("sort") as SortKey) ?? "default");
  const [selectedCat,        setSelectedCat]        = useState(params.get("cat") ?? "");
  const [selectedSubcat,     setSelectedSubcat]     = useState("");
  const [selectedBrands,     setSelectedBrands]     = useState<string[]>([]);
  const [priceMin,           setPriceMin]           = useState("");
  const [priceMax,           setPriceMax]           = useState("");
  const [inStockOnly,        setInStockOnly]        = useState(false);
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);

  // UI state
  const [filtersOpen,  setFiltersOpen]  = useState(false);
  const [page,         setPage]         = useState(1);
  const [gridCols,     setGridCols]     = useState<3 | 4>(4);

  useEffect(() => { setPage(1); }, [query, sort, selectedCat, selectedSubcat, selectedBrands, priceMin, priceMax, inStockOnly, selectedConditions]);

  // ── Derived data ────────────────────────────────────────────────────────────
  const catTree = useMemo(() => {
    const tree: Record<string, { subs: Record<string, number>; total: number }> = {};
    products.forEach(p => {
      if (!p.category) return;
      if (!tree[p.category]) tree[p.category] = { subs: {}, total: 0 };
      tree[p.category].total++;
      if (p.subcategory) {
        tree[p.category].subs[p.subcategory] = (tree[p.category].subs[p.subcategory] || 0) + 1;
      }
    });
    return Object.entries(tree)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cat, { subs, total }]) => ({
        cat, total,
        subcats: Object.entries(subs)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([sub, count]) => ({ sub, count })),
      }));
  }, [products]);

  const brandData = useMemo(() => {
    const map: Record<string, number> = {};
    products.forEach(p => { if (p.brand) map[p.brand] = (map[p.brand] || 0) + 1; });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));
  }, [products]);

  const conditionData = useMemo(() => {
    const map: Record<string, number> = {};
    products.forEach(p => { if (p.condition) map[p.condition] = (map[p.condition] || 0) + 1; });
    return CONDITIONS.filter(c => map[c]).map(c => ({ name: c, count: map[c] }));
  }, [products]);

  const priceExtents = useMemo(() => {
    const prices = products.map(ep).filter(v => v > 0);
    return prices.length
      ? { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) }
      : { min: 0, max: 1000 };
  }, [products]);

  // ── Filtering ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let res = products;

    if (selectedSubcat) {
      res = res.filter(p => p.category === selectedCat && p.subcategory === selectedSubcat);
    } else if (selectedCat) {
      res = res.filter(p => p.category === selectedCat);
    }

    if (selectedBrands.length > 0) {
      res = res.filter(p => selectedBrands.includes(p.brand || ""));
    }

    if (query) {
      const q = query.toLowerCase();
      res = res.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q) ||
        (p.brand ?? "").toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q)
      );
    }

    const pMin = parseFloat(priceMin);
    const pMax = parseFloat(priceMax);
    if (!isNaN(pMin)) res = res.filter(p => ep(p) >= pMin);
    if (!isNaN(pMax)) res = res.filter(p => ep(p) <= pMax);

    if (inStockOnly) {
      // Use same getStockQty logic as the product card so results match badges
      res = res.filter(p => getStockQty(p.openingStock) > 0);
    }

    if (selectedConditions.length > 0) {
      res = res.filter(p => selectedConditions.includes(p.condition || ""));
    }

    return sortProducts(res, sort);
  }, [products, selectedCat, selectedSubcat, selectedBrands, query, priceMin, priceMax, inStockOnly, selectedConditions, sort]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const clearAll = useCallback(() => {
    setSelectedCat(""); setSelectedSubcat(""); setSelectedBrands([]);
    setPriceMin(""); setPriceMax("");
    setInStockOnly(false); setSelectedConditions([]);
    setQuery("");
  }, []);

  const activeBadges: { label: string; clear: () => void }[] = [
    ...(selectedSubcat
      ? [{ label: `${selectedCat} > ${selectedSubcat}`, clear: () => { setSelectedSubcat(""); } }]
      : selectedCat
        ? [{ label: selectedCat, clear: () => { setSelectedCat(""); setSelectedSubcat(""); } }]
        : []),
    ...selectedBrands.map(b => ({ label: b, clear: () => setSelectedBrands(bs => bs.filter(x => x !== b)) })),
    ...(priceMin ? [{ label: `Min £${priceMin}`, clear: () => setPriceMin("") }] : []),
    ...(priceMax ? [{ label: `Max £${priceMax}`, clear: () => setPriceMax("") }] : []),
    ...(inStockOnly ? [{ label: "In stock only", clear: () => setInStockOnly(false) }] : []),
    ...selectedConditions.map(c => ({ label: c, clear: () => setSelectedConditions(cs => cs.filter(x => x !== c)) })),
  ];

  const filterProps: FilterSidebarProps = {
    catTree, brandData, conditionData, priceExtents,
    selectedCat, setSelectedCat,
    selectedSubcat, setSelectedSubcat,
    selectedBrands, setSelectedBrands,
    priceMin, setPriceMin,
    priceMax, setPriceMax,
    inStockOnly, setInStockOnly,
    selectedConditions, setSelectedConditions,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Page title */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {selectedSubcat || selectedCat || "All Products"}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {filtered.length} product{filtered.length !== 1 ? "s" : ""} found
        </p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar — desktop */}
        <aside className="hidden lg:block w-64 shrink-0">
          <FilterSidebar {...filterProps} />
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="flex items-center gap-2.5 mb-4 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[160px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search products…"
                className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-900 dark:text-white placeholder:text-gray-400 transition-all"
              />
            </div>

            {/* Mobile filter toggle */}
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className={cn(
                "lg:hidden flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                activeBadges.length > 0
                  ? "border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400"
                  : "border-gray-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800"
              )}
            >
              <SlidersHorizontal size={14} />
              Filters
              {activeBadges.length > 0 && (
                <span className="text-xs font-bold bg-blue-600 text-white rounded-full w-4 h-4 flex items-center justify-center">
                  {activeBadges.length}
                </span>
              )}
            </button>

            {/* Sort */}
            <div className="relative">
              <select
                value={sort}
                onChange={e => setSort(e.target.value as SortKey)}
                className="appearance-none pl-3 pr-7 py-2 text-sm bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            {/* Grid toggle */}
            <div className="hidden sm:flex items-center border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
              {([4, 3] as const).map(n => (
                <button
                  key={n}
                  onClick={() => setGridCols(n)}
                  className={cn(
                    "px-2.5 py-2 transition-colors",
                    gridCols === n
                      ? "bg-blue-600 text-white"
                      : "text-slate-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800"
                  )}
                >
                  {n === 4 ? <LayoutGrid size={14} /> : <List size={14} />}
                </button>
              ))}
            </div>
          </div>

          {/* Mobile filters panel */}
          {filtersOpen && (
            <div className="lg:hidden mb-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-700">
                <div className="flex items-center gap-1.5 font-semibold text-sm text-slate-900 dark:text-white">
                  <SlidersVertical size={14} className="text-blue-500" /> Filters
                </div>
                <button onClick={() => setFiltersOpen(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1">
                  <X size={14} />
                </button>
              </div>
              <div className="p-4">
                <FilterSidebar {...filterProps} inline />
              </div>
            </div>
          )}

          {/* Active filter chips */}
          {activeBadges.length > 0 && (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Applied:</span>
              {activeBadges.map(b => (
                <span key={b.label} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-medium border border-blue-200 dark:border-blue-800/50">
                  {b.label}
                  <button onClick={b.clear} className="text-blue-400 hover:text-blue-700 dark:hover:text-blue-200 ml-0.5">
                    <X size={10} />
                  </button>
                </span>
              ))}
              <button onClick={clearAll} className="text-xs text-red-500 hover:text-red-700 font-medium px-1">
                Clear all
              </button>
            </div>
          )}

          {/* Grid */}
          {loading ? (
            <div className={`grid gap-4 ${gridCols === 4 ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" : "grid-cols-2 sm:grid-cols-3"}`}>
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="rounded-2xl bg-gray-100 dark:bg-slate-800 animate-pulse aspect-[3/4]" />
              ))}
            </div>
          ) : paginated.length === 0 ? (
            <div className="text-center py-24">
              <Search size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
              <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-1">No products found</h3>
              <p className="text-sm text-slate-400 mb-4">Try adjusting your search or filters</p>
              {activeBadges.length > 0 && (
                <button onClick={clearAll} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div className={`grid gap-4 ${gridCols === 4 ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" : "grid-cols-2 sm:grid-cols-3"}`}>
              {paginated.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-10 flex-wrap">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                Previous
              </button>
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={cn(
                    "w-9 h-9 rounded-lg text-sm font-semibold transition-all",
                    page === p
                      ? "bg-blue-600 text-white"
                      : "border border-gray-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800"
                  )}
                >
                  {p}
                </button>
              ))}
              {totalPages > 7 && <span className="text-slate-400 text-sm">…</span>}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── FilterSidebar ───────────────────────────────────────────────────────────────
interface CatNode { cat: string; total: number; subcats: { sub: string; count: number }[] }
interface BrandItem { name: string; count: number }
interface CondItem { name: string; count: number }

interface FilterSidebarProps {
  catTree: CatNode[];
  brandData: BrandItem[];
  conditionData: CondItem[];
  priceExtents: { min: number; max: number };
  selectedCat: string; setSelectedCat: (v: string) => void;
  selectedSubcat: string; setSelectedSubcat: (v: string) => void;
  selectedBrands: string[]; setSelectedBrands: React.Dispatch<React.SetStateAction<string[]>>;
  priceMin: string; setPriceMin: (v: string) => void;
  priceMax: string; setPriceMax: (v: string) => void;
  inStockOnly: boolean; setInStockOnly: (v: boolean) => void;
  selectedConditions: string[]; setSelectedConditions: React.Dispatch<React.SetStateAction<string[]>>;
  inline?: boolean;
}

function FilterSidebar({
  catTree, brandData, conditionData, priceExtents,
  selectedCat, setSelectedCat,
  selectedSubcat, setSelectedSubcat,
  selectedBrands, setSelectedBrands,
  priceMin, setPriceMin,
  priceMax, setPriceMax,
  inStockOnly, setInStockOnly,
  selectedConditions, setSelectedConditions,
  inline,
}: FilterSidebarProps) {
  const [openCats,    setOpenCats]    = useState<string[]>([selectedCat]);
  const [sectCat,     setSectCat]     = useState(true);
  const [sectBrand,   setSectBrand]   = useState(true);
  const [sectPrice,   setSectPrice]   = useState(true);
  const [sectCond,    setSectCond]    = useState(conditionData.length > 0);
  const [sectAvail,   setSectAvail]   = useState(true);
  const [brandSearch, setBrandSearch] = useState("");
  const [showAllBrands, setShowAllBrands] = useState(false);

  useEffect(() => {
    if (selectedCat && !openCats.includes(selectedCat)) {
      setOpenCats(prev => [...prev, selectedCat]);
    }
  }, [selectedCat]);

  const toggleCatOpen = (cat: string) =>
    setOpenCats(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);

  const toggleBrand = (b: string) =>
    setSelectedBrands(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b]);

  const toggleCondition = (c: string) =>
    setSelectedConditions(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

  const visibleBrands = brandData.filter(b =>
    !brandSearch || b.name.toLowerCase().includes(brandSearch.toLowerCase())
  );
  const displayBrands = showAllBrands ? visibleBrands : visibleBrands.slice(0, 6);

  const applyPreset = (min: string, max: string) => {
    if (priceMin === min && priceMax === max) {
      setPriceMin(""); setPriceMax("");
    } else {
      setPriceMin(min); setPriceMax(max);
    }
  };

  const wrapper = inline
    ? "grid grid-cols-2 sm:grid-cols-3 gap-5"
    : "space-y-1";

  return (
    <div className={wrapper}>

      {/* ─ Categories ─────────────────────────────────────────────────── */}
      <FilterSection label="Category" open={sectCat} onToggle={() => setSectCat(v => !v)}>
        <ul className="space-y-0.5">
          {/* All */}
          <li>
            <button
              onClick={() => { setSelectedCat(""); setSelectedSubcat(""); }}
              className={cn(
                "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm transition-colors",
                !selectedCat
                  ? "bg-blue-600 text-white font-semibold"
                  : "text-slate-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800"
              )}
            >
              <span>All Categories</span>
              <span className={cn("text-xs tabular-nums", !selectedCat ? "text-blue-200" : "text-slate-400")}>
                {catTree.reduce((s, n) => s + n.total, 0)}
              </span>
            </button>
          </li>

          {/* Parent categories */}
          {catTree.map(node => {
            const isParentActive = selectedCat === node.cat;
            const isExpanded = openCats.includes(node.cat);
            const hasSubcats = node.subcats.length > 0;

            return (
              <li key={node.cat}>
                {/* Parent row */}
                <div className={cn(
                  "flex items-center rounded-lg transition-colors",
                  isParentActive && !selectedSubcat ? "bg-blue-50 dark:bg-blue-950/40" : "hover:bg-gray-50 dark:hover:bg-slate-800"
                )}>
                  <button
                    onClick={() => {
                      if (selectedCat === node.cat && !selectedSubcat) {
                        setSelectedCat(""); setSelectedSubcat("");
                      } else {
                        setSelectedCat(node.cat); setSelectedSubcat("");
                        if (!openCats.includes(node.cat)) setOpenCats(prev => [...prev, node.cat]);
                      }
                    }}
                    className={cn(
                      "flex-1 flex items-center justify-between px-2.5 py-1.5 text-sm text-left transition-colors",
                      isParentActive && !selectedSubcat
                        ? "text-blue-700 dark:text-blue-300 font-semibold"
                        : "text-slate-700 dark:text-slate-300"
                    )}
                  >
                    <span className="truncate pr-1">{node.cat}</span>
                    <span className={cn("text-xs tabular-nums flex-shrink-0", isParentActive && !selectedSubcat ? "text-blue-500" : "text-slate-400")}>
                      {node.total}
                    </span>
                  </button>
                  {hasSubcats && (
                    <button
                      onClick={() => toggleCatOpen(node.cat)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 flex-shrink-0"
                      title={isExpanded ? "Collapse" : "Expand subcategories"}
                    >
                      {isExpanded
                        ? <ChevronDown size={13} />
                        : <ChevronRight size={13} />}
                    </button>
                  )}
                </div>

                {/* Subcategories */}
                {hasSubcats && isExpanded && (
                  <ul className="ml-4 mt-0.5 space-y-0.5 border-l-2 border-gray-100 dark:border-slate-700 pl-2">
                    {node.subcats.map(({ sub, count }) => {
                      const isActive = selectedCat === node.cat && selectedSubcat === sub;
                      return (
                        <li key={sub}>
                          <button
                            onClick={() => {
                              if (isActive) {
                                setSelectedSubcat("");
                              } else {
                                setSelectedCat(node.cat); setSelectedSubcat(sub);
                              }
                            }}
                            className={cn(
                              "w-full flex items-center justify-between px-2 py-1 rounded-md text-xs transition-colors",
                              isActive
                                ? "bg-blue-600 text-white font-semibold"
                                : "text-slate-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200"
                            )}
                          >
                            <span className="truncate">{sub}</span>
                            <span className={cn("tabular-nums flex-shrink-0 ml-1", isActive ? "text-blue-200" : "text-slate-400")}>
                              {count}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </FilterSection>

      {/* ─ Brands ──────────────────────────────────────────────────────── */}
      {brandData.length > 0 && (
        <FilterSection label="Brand" open={sectBrand} onToggle={() => setSectBrand(v => !v)}>
          {brandData.length > 5 && (
            <div className="relative mb-2">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={brandSearch}
                onChange={e => setBrandSearch(e.target.value)}
                placeholder="Search brands…"
                className="w-full pl-7 pr-2 py-1.5 text-xs bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-lg outline-none focus:border-blue-400 text-slate-700 dark:text-slate-300 placeholder:text-gray-400"
              />
            </div>
          )}

          {selectedBrands.length > 0 && (
            <button
              onClick={() => setSelectedBrands([])}
              className="text-xs text-red-500 hover:text-red-700 font-medium mb-2 block"
            >
              Clear brands
            </button>
          )}

          <ul className="space-y-0.5">
            {displayBrands.map(({ name, count }) => {
              const checked = selectedBrands.includes(name);
              return (
                <li key={name}>
                  <label className={cn(
                    "flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer text-sm transition-colors select-none",
                    checked ? "bg-blue-50 dark:bg-blue-950/30" : "hover:bg-gray-50 dark:hover:bg-slate-800"
                  )}>
                    <span className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all",
                      checked
                        ? "bg-blue-600 border-blue-600"
                        : "border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                    )}>
                      {checked && <Check size={10} className="text-white" strokeWidth={3} />}
                    </span>
                    <span className={cn(
                      "flex-1 truncate",
                      checked ? "text-blue-700 dark:text-blue-300 font-medium" : "text-slate-600 dark:text-slate-400"
                    )}>
                      {name}
                    </span>
                    <span className="text-xs text-slate-400 tabular-nums">{count}</span>
                    <input type="checkbox" checked={checked} onChange={() => toggleBrand(name)} className="sr-only" />
                  </label>
                </li>
              );
            })}
          </ul>

          {visibleBrands.length > 6 && (
            <button
              onClick={() => setShowAllBrands(v => !v)}
              className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 font-medium flex items-center gap-1"
            >
              {showAllBrands
                ? <><ChevronDown size={12} className="rotate-180" /> Show less</>
                : <><ChevronDown size={12} /> Show {visibleBrands.length - 6} more</>}
            </button>
          )}
        </FilterSection>
      )}

      {/* ─ Price ───────────────────────────────────────────────────────── */}
      <FilterSection label="Price" open={sectPrice} onToggle={() => setSectPrice(v => !v)}>
        {/* Quick presets */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {PRICE_PRESETS.map(preset => {
            const active = priceMin === preset.min && priceMax === preset.max;
            return (
              <button
                key={preset.label}
                onClick={() => applyPreset(preset.min, preset.max)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full border font-medium transition-all",
                  active
                    ? "bg-blue-600 text-white border-blue-600"
                    : "border-gray-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600"
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* Manual inputs */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">£</span>
            <input
              type="number" min="0" value={priceMin}
              onChange={e => setPriceMin(e.target.value)}
              placeholder={String(priceExtents.min)}
              className="w-full pl-6 pr-2 py-1.5 text-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg outline-none focus:border-blue-500 text-slate-900 dark:text-white placeholder:text-gray-400"
            />
          </div>
          <span className="text-slate-400 text-xs flex-shrink-0">to</span>
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">£</span>
            <input
              type="number" min="0" value={priceMax}
              onChange={e => setPriceMax(e.target.value)}
              placeholder={String(priceExtents.max)}
              className="w-full pl-6 pr-2 py-1.5 text-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg outline-none focus:border-blue-500 text-slate-900 dark:text-white placeholder:text-gray-400"
            />
          </div>
        </div>
        {(priceMin || priceMax) && (
          <button
            onClick={() => { setPriceMin(""); setPriceMax(""); }}
            className="mt-2 text-xs text-red-500 hover:text-red-700 font-medium"
          >
            Clear price
          </button>
        )}
      </FilterSection>

      {/* ─ Condition ───────────────────────────────────────────────────── */}
      {conditionData.length > 0 && (
        <FilterSection label="Condition" open={sectCond} onToggle={() => setSectCond(v => !v)}>
          <ul className="space-y-0.5">
            {conditionData.map(({ name, count }) => {
              const checked = selectedConditions.includes(name);
              return (
                <li key={name}>
                  <label className={cn(
                    "flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer text-sm transition-colors select-none",
                    checked ? "bg-blue-50 dark:bg-blue-950/30" : "hover:bg-gray-50 dark:hover:bg-slate-800"
                  )}>
                    <span className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all",
                      checked ? "bg-blue-600 border-blue-600" : "border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                    )}>
                      {checked && <Check size={10} className="text-white" strokeWidth={3} />}
                    </span>
                    <span className={cn(
                      "flex-1",
                      checked ? "text-blue-700 dark:text-blue-300 font-medium" : "text-slate-600 dark:text-slate-400"
                    )}>
                      {name}
                    </span>
                    <span className="text-xs text-slate-400 tabular-nums">{count}</span>
                    <input type="checkbox" checked={checked} onChange={() => toggleCondition(name)} className="sr-only" />
                  </label>
                </li>
              );
            })}
          </ul>
          {selectedConditions.length > 0 && (
            <button onClick={() => setSelectedConditions([])} className="mt-2 text-xs text-red-500 hover:text-red-700 font-medium">
              Clear condition
            </button>
          )}
        </FilterSection>
      )}

      {/* ─ Availability ────────────────────────────────────────────────── */}
      <FilterSection label="Availability" open={sectAvail} onToggle={() => setSectAvail(v => !v)}>
        <label className="flex items-center justify-between cursor-pointer select-none px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
          <span className="text-sm text-slate-700 dark:text-slate-300">In stock only</span>
          <span
            onClick={() => setInStockOnly(v => !v)}
            className={cn(
              "relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0",
              inStockOnly ? "bg-blue-600" : "bg-gray-200 dark:bg-slate-600"
            )}
          >
            <span className={cn(
              "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform",
              inStockOnly ? "translate-x-4.5" : "translate-x-0.5"
            )} />
          </span>
        </label>
      </FilterSection>

      {/* ─ Total count footer (desktop only) ────────────────────────────── */}
      {!inline && (
        <div className="pt-1">
          <div className="h-px bg-gray-100 dark:bg-slate-700/50 mb-3" />
          <div className="flex items-center gap-2 flex-wrap">
            <Tag size={11} className="text-slate-400" />
            <span className="text-xs text-slate-400">
              {catTree.length > 0
                ? catTree.reduce((s, n) => s + n.total, 0)
                : "All"} products in catalogue
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Collapsible filter section wrapper ─────────────────────────────────────────
function FilterSection({ label, open, onToggle, children }: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-gray-100 dark:border-slate-700/60 rounded-xl overflow-hidden bg-white dark:bg-slate-800/30">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
          {label}
        </span>
        <ChevronDown
          size={14}
          className={cn(
            "text-slate-400 transition-transform duration-200",
            open ? "" : "-rotate-90"
          )}
        />
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 pt-1">
          {children}
        </div>
      )}
    </div>
  );
}
