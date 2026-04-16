import { useState, useEffect, useCallback } from "react";
import { Coins, History, CheckCircle2, AlertCircle, Loader2, Gift, ShoppingBag } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { Layout } from "@/components/layout";
import { fetchClubcard, saveClubcard, type ClubCard, type ClubCardTransaction } from "@/lib/api";

const MIN_REDEEM = 500;
const COINS_PER_POUND = 10;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function CardVisual({ name, email, phone, coins }: { name: string; email: string; phone: string; coins: number }) {
  const id = (phone || email).replace(/\s/g, "");
  const chunks = id.padStart(16, "0").slice(-16).match(/.{1,4}/g) ?? [id];
  return (
    <div className="relative rounded-2xl overflow-hidden text-white select-none"
      style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 45%, #0ea5e9 100%)", minHeight: 200 }}>
      {/* Decorative circles */}
      <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full opacity-10 bg-white" />
      <div className="absolute -bottom-10 -left-10 w-52 h-52 rounded-full opacity-10 bg-white" />

      <div className="relative z-10 p-6 flex flex-col justify-between h-full" style={{ minHeight: 200 }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold tracking-widest uppercase text-blue-200">Onesoft</p>
            <p className="text-[13px] font-bold tracking-wide text-white mt-0.5">Club Card</p>
          </div>
          <div className="flex items-center gap-1.5 bg-white/20 rounded-xl px-3 py-1.5">
            <Coins size={16} className="text-yellow-300" />
            <span className="text-[15px] font-bold">{coins.toLocaleString()}</span>
            <span className="text-[11px] text-blue-200">coins</span>
          </div>
        </div>

        <div>
          <p className="text-[13px] tracking-[0.2em] font-mono text-blue-100 mb-3">
            {chunks.join(" ")}
          </p>
          <p className="text-[14px] font-semibold tracking-wide uppercase">{name}</p>
          <p className="text-[11px] text-blue-300 mt-0.5 truncate">{email}</p>
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ coins }: { coins: number }) {
  const pct = Math.min(100, (coins / MIN_REDEEM) * 100);
  const eligible = coins >= MIN_REDEEM;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] font-semibold text-gray-700">
          {eligible ? "Ready to redeem!" : `${coins} / ${MIN_REDEEM} coins to unlock redemption`}
        </span>
        <span className="text-[12px] text-gray-400">{Math.round(pct)}%</span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: eligible
              ? "linear-gradient(90deg, #16a34a, #22c55e)"
              : "linear-gradient(90deg, #1d4ed8, #0ea5e9)",
          }}
        />
      </div>
      <p className="text-[12px] text-gray-400 mt-2">
        {eligible
          ? `You can redeem up to £${Math.floor(coins / COINS_PER_POUND).toFixed(2)} off your next purchase.`
          : `${MIN_REDEEM - coins} more coins needed to redeem. 10 coins = £1 discount.`}
      </p>
    </div>
  );
}

function TransactionRow({ tx }: { tx: ClubCardTransaction }) {
  const isCredit = tx.type === "credit";
  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
          isCredit ? "bg-emerald-50" : "bg-red-50"
        }`}>
          {isCredit ? <Gift size={14} className="text-emerald-600" /> : <ShoppingBag size={14} className="text-red-500" />}
        </div>
        <div>
          <p className="text-[13.5px] font-medium text-gray-800">{tx.description}</p>
          <p className="text-[11.5px] text-gray-400">{fmtDate(tx.date)}</p>
        </div>
      </div>
      <span className={`text-[14px] font-bold ${isCredit ? "text-emerald-600" : "text-red-500"}`}>
        {isCredit ? "+" : "−"}{tx.coins.toLocaleString()}
      </span>
    </div>
  );
}

export default function ClubCardPage() {
  const { session, tenantId } = useAuth();
  const c = session?.customer;

  const [card, setCard]           = useState<ClubCard | null>(null);
  const [loading, setLoading]     = useState(true);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemAmt, setRedeemAmt] = useState(MIN_REDEEM);
  const [msg, setMsg]             = useState<{ ok: boolean; text: string } | null>(null);
  const [showRedeem, setShowRedeem] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId || !c) return;
    setLoading(true);
    try {
      const data = await fetchClubcard(tenantId, c.id);
      setCard(data);
      setRedeemAmt(Math.min(data.coins, Math.floor(data.coins / MIN_REDEEM) * MIN_REDEEM));
    } finally {
      setLoading(false);
    }
  }, [tenantId, c]);

  useEffect(() => { load(); }, [load]);

  async function handleRedeem() {
    if (!card || !tenantId || !c) return;
    if (redeemAmt < MIN_REDEEM || redeemAmt > card.coins) return;
    const aligned = Math.floor(redeemAmt / 10) * 10;
    if (aligned < MIN_REDEEM) { setMsg({ ok: false, text: `Minimum redemption is ${MIN_REDEEM} coins.` }); return; }
    setRedeeming(true);
    setMsg(null);
    try {
      const discount = aligned / COINS_PER_POUND;
      const updated: ClubCard = {
        coins: card.coins - aligned,
        transactions: [
          {
            id: crypto.randomUUID(),
            type: "debit",
            coins: aligned,
            description: `Redeemed for £${discount.toFixed(2)} purchase discount`,
            date: new Date().toISOString(),
          },
          ...card.transactions,
        ],
      };
      await saveClubcard(tenantId, c.id, updated);
      setCard(updated);
      setMsg({ ok: true, text: `✓ ${aligned} coins redeemed! Show this screen to apply £${discount.toFixed(2)} off your next purchase.` });
      setShowRedeem(false);
    } catch {
      setMsg({ ok: false, text: "Something went wrong. Please try again." });
    } finally {
      setRedeeming(false);
    }
  }

  if (!c) return null;

  const coins     = card?.coins ?? 0;
  const eligible  = coins >= MIN_REDEEM;
  const maxRedeem = Math.floor(coins / 10) * 10;
  const sorted    = [...(card?.transactions ?? [])].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-[20px] font-bold text-gray-900">Club Card</h1>
        <p className="text-[13px] text-gray-500 mt-0.5">Earn coins every time you shop. Redeem for discounts.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">

          {/* Card visual */}
          <CardVisual
            name={c.name}
            email={c.email}
            phone={c.phone ?? ""}
            coins={coins}
          />

          {/* Progress */}
          <ProgressBar coins={coins} />

          {/* Redeem section */}
          {eligible && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-[14px] font-semibold text-gray-900">Redeem Coins</h3>
                  <p className="text-[12.5px] text-gray-500 mt-0.5">Min. {MIN_REDEEM} coins · 10 coins = £1</p>
                </div>
                <button
                  onClick={() => setShowRedeem(v => !v)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold rounded-lg transition-colors"
                >
                  {showRedeem ? "Cancel" : "Redeem"}
                </button>
              </div>

              {showRedeem && (
                <div className="space-y-4 border-t border-gray-100 pt-4">
                  <div>
                    <label className="text-[12px] font-medium text-gray-500 mb-2 block">
                      Coins to redeem (multiples of 10, min {MIN_REDEEM})
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={MIN_REDEEM}
                        max={maxRedeem}
                        step={10}
                        value={redeemAmt}
                        onChange={e => setRedeemAmt(Number(e.target.value))}
                        className="flex-1 accent-blue-600"
                      />
                      <div className="text-right min-w-[90px]">
                        <p className="text-[15px] font-bold text-blue-600">{redeemAmt.toLocaleString()}</p>
                        <p className="text-[11px] text-gray-400">coins</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2 text-[12.5px] text-gray-500">
                      <span>Discount value</span>
                      <span className="font-bold text-emerald-600 text-[14px]">
                        £{(redeemAmt / COINS_PER_POUND).toFixed(2)}
                      </span>
                    </div>
                    <p className="text-[12px] text-gray-400 mt-1">
                      Remaining after redemption: <strong>{(coins - redeemAmt).toLocaleString()}</strong> coins
                    </p>
                  </div>

                  <button
                    onClick={handleRedeem}
                    disabled={redeeming || redeemAmt < MIN_REDEEM}
                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-[13.5px] rounded-lg transition-colors"
                  >
                    {redeeming ? <Loader2 size={14} className="animate-spin" /> : <Coins size={14} />}
                    {redeeming ? "Processing…" : `Redeem ${redeemAmt.toLocaleString()} coins for £${(redeemAmt / COINS_PER_POUND).toFixed(2)} off`}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Feedback */}
          {msg && (
            <div className={`flex items-start gap-2 text-[13px] rounded-xl px-4 py-3 ${
              msg.ok ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                     : "bg-red-50 text-red-700 border border-red-200"
            }`}>
              {msg.ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <AlertCircle size={15} className="mt-0.5 shrink-0" />}
              {msg.text}
            </div>
          )}

          {/* How it works */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 grid sm:grid-cols-3 gap-3 text-center">
            {[
              { label: "Sign-up bonus",     value: "100 coins",   sub: "awarded on registration" },
              { label: "Minimum to redeem", value: "500 coins",   sub: `worth £${(500 / COINS_PER_POUND).toFixed(2)}` },
              { label: "Conversion rate",   value: "10 coins",    sub: "= £1 purchase discount" },
            ].map(({ label, value, sub }) => (
              <div key={label} className="bg-white rounded-lg p-3 border border-blue-100">
                <p className="text-[11.5px] text-blue-500 font-medium">{label}</p>
                <p className="text-[17px] font-bold text-gray-900 mt-0.5">{value}</p>
                <p className="text-[11px] text-gray-400">{sub}</p>
              </div>
            ))}
          </div>

          {/* Transaction history */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
              <History size={15} className="text-blue-600" />
              <h2 className="text-[14px] font-semibold text-gray-900">Coin History</h2>
            </div>
            {sorted.length === 0 ? (
              <div className="py-10 text-center text-[13.5px] text-gray-400">No transactions yet.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {sorted.map(tx => <TransactionRow key={tx.id} tx={tx} />)}
              </div>
            )}
          </div>

        </div>
      )}
    </Layout>
  );
}
