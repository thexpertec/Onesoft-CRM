import { useState } from "react";
import { Link } from "wouter";
import { Heart, ShoppingCart, BadgeCheck, CreditCard } from "lucide-react";
import type { Product } from "@/types/product";
import { useCart } from "@/lib/cart";
import { useCustomerSession } from "@/hooks/use-customer-session";
import { formatPrice, getStockQty, stockLabel, isBogo } from "@/lib/utils";

const C = {
  accent:  "#ff6b00",
  accent2: "#ffb300",
  teal:    "#00b4d8",
  green:   "#00c853",
  red:     "#f44336",
  navy:    "#0a1628",
  muted:   "#8a9bb5",
  border:  "#e3e8f0",
  off:     "#f4f6fa",
  sub:     "#5a6a85",
  text:    "#1a2540",
};

export function MarketplaceProductCard({ product }: { product: Product }) {
  const { addItem } = useCart();
  const [wishlist, setWishlist] = useState(false);
  const [adding,   setAdding]   = useState(false);
  const { isLoggedIn } = useCustomerSession();

  const qty   = getStockQty(product.openingStock);
  const stock = stockLabel(qty, product.stockAlertQty);
  const isOOS = stock === "out";

  const displayPrice = product.websitePrice && parseFloat(product.websitePrice) > 0
    ? product.websitePrice : product.price;
  const wasPrice  = product.websitePriceWas && parseFloat(product.websitePriceWas) > 0
    ? product.websitePriceWas : null;
  const clubPrice = product.clubcardPrice && parseFloat(product.clubcardPrice) > 0
    ? product.clubcardPrice : null;
  const clubSaving = clubPrice ? parseFloat(displayPrice) - parseFloat(clubPrice) : 0;
  const bogoActive = isBogo(product as { clubcardBogo?: boolean }, isLoggedIn);
  const savePct    = wasPrice ? Math.round((1 - parseFloat(displayPrice) / parseFloat(wasPrice)) * 100) : 0;

  function handleAdd(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (isOOS) return;
    setAdding(true);
    addItem(product, bogoActive ? 2 : 1);
    setTimeout(() => setAdding(false), 800);
  }

  const topBadge = isOOS
    ? { label: "Out of Stock", bg: C.muted }
    : stock === "low"
    ? { label: "Hot", bg: C.accent }
    : wasPrice && savePct > 0
    ? { label: `-${savePct}%`, bg: C.red }
    : null;

  return (
    <div
      className="mp-prod-card"
      style={{
        background: "#fff", borderRadius: 14, overflow: "hidden",
        border: `2px solid ${C.border}`, position: "relative",
        boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
        transition: "all .2s ease", cursor: "pointer",
        display: "flex", flexDirection: "column",
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = C.accent;
        el.style.boxShadow   = "0 8px 30px rgba(255,107,0,0.15)";
        el.style.transform   = "translateY(-4px)";
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = C.border;
        el.style.boxShadow   = "0 2px 10px rgba(0,0,0,0.05)";
        el.style.transform   = "translateY(0)";
      }}
    >
      <Link href={`/product/${product.id}`} style={{ display: "block" }}>
        <div style={{
          width: "100%", aspectRatio: "1/1", background: C.off,
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative", overflow: "hidden",
        }}>
          {product.thumbnail ? (
            <img
              src={product.thumbnail} alt={product.name}
              style={{ width: "100%", height: "100%", objectFit: "contain", padding: 12 }}
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <span style={{ fontSize: 56, opacity: 0.5 }}>📦</span>
          )}

          {topBadge && (
            <div style={{
              position: "absolute", top: 10, left: 10, zIndex: 2,
              background: topBadge.bg, color: "#fff",
              fontSize: 11, fontWeight: 700, padding: "3px 9px",
              borderRadius: 5, textTransform: "uppercase", letterSpacing: ".3px",
            }}>
              {topBadge.label}
            </div>
          )}
          {product.brand && (
            <div style={{
              position: "absolute", top: topBadge ? 36 : 10, left: 10, zIndex: 2,
              background: "rgba(255,255,255,0.9)", color: C.sub,
              fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
            }}>
              {product.brand}
            </div>
          )}

          <button
            onClick={e => { e.preventDefault(); e.stopPropagation(); setWishlist(v => !v); }}
            style={{
              position: "absolute", top: 10, right: 10, zIndex: 2,
              background: "#fff", border: "none", borderRadius: "50%",
              width: 32, height: 32, display: "flex", alignItems: "center",
              justifyContent: "center", cursor: "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
              color: wishlist ? C.red : "#bbb", transition: "transform .2s",
            }}
            aria-label="Wishlist"
          >
            <Heart size={14} fill={wishlist ? C.red : "none"} />
          </button>
        </div>
      </Link>

      <div style={{ padding: "14px", flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", color: C.teal, fontWeight: 700, letterSpacing: ".5px", marginBottom: 4 }}>
          {product.category ?? "General"}
        </div>

        <Link href={`/product/${product.id}`}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1.35,
            marginBottom: 6, display: "-webkit-box",
            WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as React.CSSProperties["WebkitBoxOrient"],
            overflow: "hidden",
          }}>
            {product.name}
          </div>
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
          <span style={{ color: C.accent2, fontSize: 12 }}>★★★★☆</span>
          <span style={{ fontSize: 11, color: C.muted }}>(4.0)</span>
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 10, flexWrap: "wrap", flex: 1 }}>
          {bogoActive && isLoggedIn ? (
            <>
              <span style={{ fontSize: 19, fontWeight: 900, color: C.accent }}>{formatPrice(displayPrice)}</span>
              <span style={{ fontSize: 11, color: C.green, fontWeight: 700 }}>+1 FREE</span>
            </>
          ) : clubPrice && isLoggedIn ? (
            <>
              <span style={{ fontSize: 12, color: C.muted, textDecoration: "line-through" }}>{formatPrice(displayPrice)}</span>
              <span style={{ fontSize: 19, fontWeight: 900, color: "#1a56db" }}>{formatPrice(clubPrice)}</span>
            </>
          ) : (
            <>
              <span style={{ fontSize: 19, fontWeight: 900, color: C.accent }}>{formatPrice(displayPrice)}</span>
              {wasPrice && <span style={{ fontSize: 12, color: C.muted, textDecoration: "line-through" }}>{formatPrice(wasPrice)}</span>}
              {savePct > 0 && <span style={{ fontSize: 11, color: C.green, fontWeight: 700 }}>Save {savePct}%</span>}
            </>
          )}
        </div>

        {stock === "low" && !isOOS && (
          <div style={{ fontSize: 11, color: C.red, fontWeight: 600, marginBottom: 8 }}>
            Limited Stock
          </div>
        )}

        <button
          onClick={handleAdd}
          disabled={isOOS || adding}
          style={{
            width: "100%",
            background: isOOS ? "#e2e8f0" : adding ? C.green : `linear-gradient(135deg, ${C.accent}, #ff8c00)`,
            border: "none", color: isOOS ? C.muted : "#fff",
            padding: "10px", borderRadius: 8,
            fontWeight: 700, fontSize: 13,
            cursor: isOOS ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            transition: "opacity .2s",
          }}
        >
          <ShoppingCart size={13} />
          {adding ? "Added!" : isOOS ? "Out of Stock" : "Add to Cart"}
        </button>

        {(bogoActive || (clubPrice && !isLoggedIn)) && (
          <div style={{
            marginTop: 7, textAlign: "center", fontSize: 11, fontWeight: 600,
            color: "#0f8b69", display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
          }}>
            {bogoActive
              ? <><BadgeCheck size={11} /> Buy 1 Get 1 Free · Clubcard</>
              : <><CreditCard size={11} /> Save {formatPrice(clubSaving.toFixed(2))} with Clubcard</>
            }
          </div>
        )}
      </div>
    </div>
  );
}
