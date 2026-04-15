import { useState, useMemo, useEffect } from "react";
import { useSearch } from "wouter";
import { SlidersHorizontal, Search, X, ChevronDown, LayoutGrid, List } from "lucide-react";
import { useStore } from "@/contexts/store-context";
import { ProductCard } from "@/components/product-card";
import { cn } from "@/lib/utils";
import type { Product } from "@/types/product";

type SortKey = "default" | "price_asc" | "price_desc" | "newest" | "popular" | "name_asc";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "default", label: "Featured" },
  { key: "newest", label: "Newest First" },
  { key: "price_asc", label: "Price: Low to High" },
  { key: "price_desc", label: "Price: High to Low" },
  { key: "name_asc", label: "Name A-Z" },
];

const PAGE_SIZE = 24;

function sortProducts(products: Product[], sort: SortKey): Product[] {
  return [...products].sort((a, b) => {
    if (sort === "price_asc") return parseFloat(a.price || "0") - parseFloat(b.price || "0");
    if (sort === "price_desc") return parseFloat(b.price || "0") - parseFloat(a.price || "0");
    if (sort === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (sort === "name_asc") return a.name.localeCompare(b.name);
    return 0;
  });
}

export function ShopPage() {
  const { products, loading, categories } = useStore();
  const search = useSearch();
  const params = new URLSearchParams(search);

  const [query, setQuery] = useState(params.get("q") ?? "");
  const [sort, setSort] = useState<SortKey>((params.get("sort") as SortKey) ?? "default");
  const [selectedCat, setSelectedCat] = useState(params.get("cat") ?? "");
  const [selectedBrand, setSelectedBrand] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [gridCols, setGridCols] = useState<3 | 4>(4);

  useEffect(() => { setPage(1); }, [query, sort, selectedCat, selectedBrand, priceMin, priceMax]);

  const brands = useMemo(() => [...new Set(products.map(p => p.brand).filter(Boolean) as string[])].sort(), [products]);

  const filtered = useMemo(() => {
    let res = products;
    if (selectedCat) res = res.filter(p => p.category === selectedCat);
    if (selectedBrand) res = res.filter(p => p.brand === selectedBrand);
    if (query) {
      const q = query.toLowerCase();
      res = res.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q) ||
        (p.brand ?? "").toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q)
      );
    }
    const pMin = parseFloat(priceMin);
    const pMax = parseFloat(priceMax);
    if (!isNaN(pMin)) res = res.filter(p => parseFloat(p.price || "0") >= pMin);
    if (!isNaN(pMax)) res = res.filter(p => parseFloat(p.price || "0") <= pMax);
    return sortProducts(res, sort);
  }, [products, selectedCat, selectedBrand, query, priceMin, priceMax, sort]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const activeFiltersCount = [selectedCat, selectedBrand, priceMin, priceMax].filter(Boolean).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Page title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {selectedCat || "All Products"}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {filtered.length} product{filtered.length !== 1 ? "s" : ""} found
        </p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar Filters - desktop */}
        <aside className="hidden lg:block w-56 shrink-0 space-y-6">
          <FilterSidebar
            categories={categories}
            brands={brands}
            selectedCat={selectedCat}
            setSelectedCat={setSelectedCat}
            selectedBrand={selectedBrand}
            setSelectedBrand={setSelectedBrand}
            priceMin={priceMin}
            setPriceMin={setPriceMin}
            priceMax={priceMax}
            setPriceMax={setPriceMax}
          />
        </aside>

        {/* Main */}
        <div className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search products..."
                className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-900 dark:text-white placeholder:text-gray-400 transition-all"
              />
            </div>

            {/* Mobile filter toggle */}
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className={cn(
                "lg:hidden flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                activeFiltersCount > 0
                  ? "border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400"
                  : "border-gray-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800"
              )}
            >
              <SlidersHorizontal size={14} />
              Filters {activeFiltersCount > 0 && <span className="text-xs font-bold">({activeFiltersCount})</span>}
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
                  aria-label={`${n} columns`}
                >
                  {n === 4 ? <LayoutGrid size={14} /> : <List size={14} />}
                </button>
              ))}
            </div>
          </div>

          {/* Mobile filters */}
          {filtersOpen && (
            <div className="lg:hidden mb-5 p-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-sm text-slate-900 dark:text-white">Filters</h3>
                <button onClick={() => setFiltersOpen(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
                  <X size={14} />
                </button>
              </div>
              <FilterSidebar
                categories={categories}
                brands={brands}
                selectedCat={selectedCat}
                setSelectedCat={setSelectedCat}
                selectedBrand={selectedBrand}
                setSelectedBrand={setSelectedBrand}
                priceMin={priceMin}
                setPriceMin={setPriceMin}
                priceMax={priceMax}
                setPriceMax={setPriceMax}
                inline
              />
            </div>
          )}

          {/* Active filters */}
          {activeFiltersCount > 0 && (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className="text-xs text-slate-500">Active:</span>
              {selectedCat && <FilterBadge label={selectedCat} onRemove={() => setSelectedCat("")} />}
              {selectedBrand && <FilterBadge label={selectedBrand} onRemove={() => setSelectedBrand("")} />}
              {priceMin && <FilterBadge label={`Min £${priceMin}`} onRemove={() => setPriceMin("")} />}
              {priceMax && <FilterBadge label={`Max £${priceMax}`} onRemove={() => setPriceMax("")} />}
              <button
                onClick={() => { setSelectedCat(""); setSelectedBrand(""); setPriceMin(""); setPriceMax(""); }}
                className="text-xs text-red-500 hover:text-red-700 font-medium"
              >
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
            <div className="text-center py-20">
              <Search size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
              <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-1">No products found</h3>
              <p className="text-sm text-slate-400">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className={`grid gap-4 ${gridCols === 4 ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" : "grid-cols-2 sm:grid-cols-3"}`}>
              {paginated.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-10">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                Previous
              </button>
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                const p = i + 1;
                return (
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
                );
              })}
              {totalPages > 7 && <span className="text-slate-400 text-sm">...</span>}
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

function FilterBadge({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-medium border border-blue-200 dark:border-blue-800/50">
      {label}
      <button onClick={onRemove} className="text-blue-400 hover:text-blue-700 dark:hover:text-blue-200">
        <X size={10} />
      </button>
    </span>
  );
}

interface FilterSidebarProps {
  categories: string[];
  brands: string[];
  selectedCat: string;
  setSelectedCat: (v: string) => void;
  selectedBrand: string;
  setSelectedBrand: (v: string) => void;
  priceMin: string;
  setPriceMin: (v: string) => void;
  priceMax: string;
  setPriceMax: (v: string) => void;
  inline?: boolean;
}

function FilterSidebar({
  categories, brands,
  selectedCat, setSelectedCat,
  selectedBrand, setSelectedBrand,
  priceMin, setPriceMin,
  priceMax, setPriceMax,
  inline,
}: FilterSidebarProps) {
  const wrap = inline ? "grid grid-cols-2 gap-6" : "space-y-6";
  return (
    <div className={wrap}>
      {/* Categories */}
      <div>
        <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Category</h4>
        <ul className="space-y-1">
          <li>
            <button
              onClick={() => setSelectedCat("")}
              className={cn(
                "w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors",
                !selectedCat
                  ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold"
                  : "text-slate-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800"
              )}
            >
              All Categories
            </button>
          </li>
          {categories.map(cat => (
            <li key={cat}>
              <button
                onClick={() => setSelectedCat(cat === selectedCat ? "" : cat)}
                className={cn(
                  "w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors",
                  selectedCat === cat
                    ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold"
                    : "text-slate-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800"
                )}
              >
                {cat}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Brands */}
      {brands.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Brand</h4>
          <ul className="space-y-1">
            <li>
              <button
                onClick={() => setSelectedBrand("")}
                className={cn(
                  "w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors",
                  !selectedBrand
                    ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold"
                    : "text-slate-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800"
                )}
              >
                All Brands
              </button>
            </li>
            {brands.slice(0, 10).map(b => (
              <li key={b}>
                <button
                  onClick={() => setSelectedBrand(b === selectedBrand ? "" : b)}
                  className={cn(
                    "w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors",
                    selectedBrand === b
                      ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold"
                      : "text-slate-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800"
                  )}
                >
                  {b}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Price */}
      <div>
        <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Price Range</h4>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            value={priceMin}
            onChange={e => setPriceMin(e.target.value)}
            placeholder="Min"
            className="w-full px-2.5 py-1.5 text-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg outline-none focus:border-blue-500 text-slate-900 dark:text-white"
          />
          <span className="text-slate-400 text-xs shrink-0">to</span>
          <input
            type="number"
            min="0"
            value={priceMax}
            onChange={e => setPriceMax(e.target.value)}
            placeholder="Max"
            className="w-full px-2.5 py-1.5 text-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg outline-none focus:border-blue-500 text-slate-900 dark:text-white"
          />
        </div>
      </div>
    </div>
  );
}
