# Customer Wallet / Advance Ledger — Procedure & Use Cases

> **System**: Onesoft Multi-Tenant ERP  
> **Module**: Customer Wallet (Advance Credit)  
> **Accounting Model**: Full double-entry — every wallet operation posts a Journal Entry to the Chart of Accounts. No balance is stored on the customer record.

---

## Architecture Overview

| Layer | Detail |
|---|---|
| Balance source | Computed from Journal Entry lines on the customer's advance sub-ledger account |
| Sub-ledger creation | On first wallet interaction, a Ledger account under `sys-2140` (Customer Advance Group) is auto-provisioned |
| System accounts | `sys-2140` — Customer Advance Group (Header), `sys-2141` — Customer Advance Adjustments (Ledger) |
| Walk-in restriction | Walk-in customers have no sub-ledger; all excess cash is treated as change given back |

---

## Completed Use Cases

---

### UC-1 — Provision Customer Advance Sub-Ledger
**Trigger**: First wallet operation for a named customer  
**Function**: `ensureCustomerAdvanceLedger(customerId)`

**Flow**:
1. Look up the customer by ID.
2. If the customer name is blank or "Walk-in" → return `null` (blocked).
3. If `customer.advanceLedgerAccountId` already exists → return that ID.
4. Create a new Ledger account:
   - Parent: `sys-2140` (Customer Advance Group)
   - Name: `Advance – [Customer Name]`
   - Type: Ledger / Liability
5. Save `advanceLedgerAccountId` on the customer record.
6. Return the new ledger ID.

**Result**: A dedicated COA sub-ledger exists for the customer before any JE is posted.

---

### UC-2 — Get Customer Wallet Balance
**Function**: `getCustomerWalletBalance(customerId)`

**Flow**:
1. Resolve `advanceLedgerAccountId` (provision if missing).
2. Scan all posted Journal Entries for lines on that ledger ID.
3. Balance = Σ credits − Σ debits on that ledger.
4. Return balance (always ≥ 0 after correct postings; negative = data error).

**Used by**: PaymentModal (auto-fill wallet), invoice CollectPaymentModal, wallet report.

---

### UC-3 — Fund Customer Wallet (Add Credit)
**Trigger**: Cashier opens the Customer Wallet page and clicks "Add Funds"  
**Function**: `fundCustomerWallet(customerId, amount, reference, cashAccountId?)`

**Journal Entry posted**:
```
DR  Cash / Bank Account (chosen payment account)     amount
CR  Customer Advance Sub-Ledger                      amount
```

**Flow**:
1. Validate `amount > 0` and customer is not Walk-in.
2. Resolve cash-side ledger: use `cashAccountId` if supplied, otherwise fall back to `accCash` setting.
3. Ensure customer advance sub-ledger exists (`ensureCustomerAdvanceLedger`).
4. Post JE with reference `WFUND-[customerId]-[timestamp]`.
5. Wallet balance increases by `amount`.

**UI**: `customer-wallet.tsx` → FundDialog — includes a payment account dropdown (all active `PaymentAccount` records with a `ledgerAccountId`).

---

### UC-4 — Apply Wallet Credit to Invoice Payment
**Trigger**: Invoice → Collect Payment → wallet balance shown, user confirms  
**Function**: `applyWalletToInvoice(customerId, amount, invoiceReference)`

**Journal Entry posted**:
```
DR  Customer Advance Sub-Ledger                      amount
CR  Customer AR Sub-Ledger (Trade Receivable)        amount
```

**Flow**:
1. Validate amount ≤ current wallet balance.
2. Resolve customer advance and AR sub-ledger IDs.
3. Post JE with reference `WAPPLY-[invoiceRef]`.
4. The AR balance for the invoice decreases; wallet balance decreases.

**Note**: This does not mark the invoice as fully paid on its own. `CollectPaymentModal` in `invoices.tsx` handles the wallet application + cash receipt for any remaining balance.

---

### UC-5 — POS Sale with Wallet Credit Auto-Applied
**Trigger**: Named customer selected at POS; wallet balance > 0  
**Flow in PaymentModal**:
1. `walletBalance` prop is pre-fetched via `getCustomerWalletBalance`.
2. `walletUsed` is initialised to `min(walletBalance, saleTotal)` — auto-fills.
3. `payAmount` is set to `max(0, saleTotal − walletUsed)` — reduces cash asked.
4. Cashier can remove wallet usage by clicking the X on the "Wallet Applied" strip.

**On confirm** (`handleComplete`):
1. `autoPostSaleJE` posts the primary sale JE (DR AR / CR Revenue).
2. If `walletNum > 0`: `adjustCustomerWallet` posts:
   ```
   DR  Customer Advance Sub-Ledger    walletNum   (credit used)
   CR  Customer AR Sub-Ledger         walletNum   (offsets receivable)
   ```
3. If `paidNum > 0` (cash also collected): `autoPostCashReceiptJE` posts:
   ```
   DR  Cash / Bank                    paidNum
   CR  Customer AR Sub-Ledger         paidNum
   ```

**Result**: AR is fully cleared. Wallet balance decreases by `walletNum`.

---

### UC-6 — Named Customer Overpays at POS (Excess → Wallet)
**Trigger**: Customer pays more than the sale total  
**Condition**: Named customer (not Walk-in)

**PaymentModal display**: Shows `[amount] → wallet` in blue next to "Fully paid".

**On confirm** (`handleComplete`):
- `excessCash = totalCovered − grandTotal`
- `walletDelta = excessCash − walletNum`
- If `walletDelta > 0`: calls `adjustCustomerWallet` with type `"funded"`:
  ```
  DR  Cash / Bank                    excessCash
  CR  Customer Advance Sub-Ledger    excessCash
  ```
- Wallet balance increases by the excess amount.

---

### UC-7 — Walk-in POS Cash Sale (Transit, No Double-Posting)
**Trigger**: POS sale with no named customer (or customer = "Walk-in")

**`autoPostSaleJE` embeds the cash transit in a single JE**:
```
DR  Walk-in AR Sub-Ledger            grandTotal   (sale revenue side)
CR  Revenue Account(s)               grandTotal
DR  Cash / Bank Account              grandTotal   (immediate cash receipt)
CR  Walk-in AR Sub-Ledger            grandTotal   (transit cleared)
```

Net effect on Walk-in AR = **zero** (in, then out in the same JE).

**Key guard** (`receiptEmbedded` flag):
- `autoPostSaleJE` returns `{ receiptEmbedded: true }` for this case.
- The caller checks `!je.receiptEmbedded` before calling `autoPostCashReceiptJE`.
- This prevents a second CR on Walk-in AR that would create a phantom advance balance.

---

### UC-8 — Walk-in Customer Advance Restriction
**Rule**: Walk-in customers cannot hold advance/wallet credit. Any excess cash they hand over is change to be given back.

**Enforcement points**:

| Where | Behaviour |
|---|---|
| `ensureCustomerAdvanceLedger` | Returns `null` for Walk-in — no ledger ever created |
| `PaymentModal` | Shows **"Change: [amount]"** (amber) instead of "→ wallet" when excess |
| `PaymentModal` | Amber warning strip: *"Walk-in customers cannot hold advance credit — return [amount] as change"* |
| `handleComplete` | `adjustCustomerWallet` skipped when `walletCust.name === "walk-in"` |
| `autoPostSaleJE` | Transit embedded in sale JE — no separate receipt JE |

---

### UC-9 — Sale Return → Wallet Refund (Named Customer)
**Trigger**: `sale-return.tsx` — cashier processes a return for a named customer  
**Function**: `fundCustomerWallet(customerId, refundAmount, saleReference)`

**Journal Entry posted**:
```
DR  Sales Returns / Revenue Contra    refundAmount
CR  Customer Advance Sub-Ledger       refundAmount
```

**Result**: Customer's wallet is credited with the return value. They can use it on a future sale.

---

### UC-10 — RP Voucher Auto-Posts Advance Credit
**Trigger**: Accounts Receivable → Receipt / Payment Voucher creation  
**Function**: `postRPVoucherJE` (restructured)

For a receipt voucher where the customer pays in advance of any invoice, the advance credit line is embedded directly in the voucher JE rather than calling `fundCustomerWallet` as a side-effect. This keeps the entire economic event in a single balanced JE:
```
DR  Cash / Bank                       amount
CR  Customer Advance Sub-Ledger       amount
```

`deleteRPVoucher` no longer needs a wallet reversal — deleting the JE is sufficient to undo the posting.

---

### UC-11 — Opening Balance Migration (m12)
**Trigger**: Database migration on first app load after the double-entry wallet upgrade  
**Scope**: All customers with a non-zero legacy `advanceCredit` field

**Flow per customer**:
1. Skip if `advanceLedgerAccountId` is already set (wallet already migrated).
2. Call `ensureCustomerAdvanceLedger` to create the sub-ledger.
3. Post an opening balance JE:
   ```
   DR  Opening Balance Equity           legacyAmount
   CR  Customer Advance Sub-Ledger      legacyAmount
   ```
4. Clear `customer.advanceCredit` (set to 0 or remove field).

**Result**: Historical balances are carried forward as proper JEs. The wallet balance reads correctly from day one.

---

### UC-12 — Wallet Ledger Report per Customer
**Page**: `wallet-report.tsx`  
**Functions**: `getWalletLedger(customerId)`, `getCustomerWalletBalance(customerId)`

**`getWalletLedger` returns** an array of ledger lines derived from JEs:
- Date, reference, description, debit, credit, running balance
- Sourced by scanning all JE lines where `ledgerId === advanceLedgerAccountId`

**Display**: Running balance column, opening balance row, paginated table.

---

## Missing Use Cases (Not Yet Implemented)

---

### UC-M1 — Wallet Auto-Apply on POS Without Manual Input
**Gap**: Currently, the wallet amount is pre-filled in `PaymentModal` but the cashier can still change or remove it. There is no confirmation prompt explaining "this customer has advance credit — apply?"  
**Needed**: A clear, non-dismissable prompt at POS open (or on customer selection) showing wallet balance and asking whether to apply it before the payment modal opens.

---

### UC-M2 — Manual Wallet Deduction (Admin Adjustment)
**Gap**: `customer-wallet.tsx` only has "Add Funds". There is no UI for an admin to manually deduct wallet credit (e.g., correction, penalty, fee).  
**Needed**: A "Deduct / Adjust" dialog that posts:
```
DR  Customer Advance Sub-Ledger    amount
CR  Customer Advance Adjustments (sys-2141)    amount
```
With a mandatory reason/narration field.

---

### UC-M3 — Wallet Balance Visible on Customer Card / Profile
**Gap**: The customer list and customer detail pages do not display the current wallet balance alongside the customer record.  
**Needed**: A "Wallet Balance" field on the customer detail page, populated from `getCustomerWalletBalance`, shown in real time.

---

### UC-M4 — Credit Note → Wallet Credit
**Gap**: When a credit note is issued from `invoices.tsx` (partial credit, not full refund), there is no flow to move the credit note value into the customer's advance wallet.  
**Needed**: A "Transfer to Wallet" action on the credit note that posts:
```
DR  Customer AR / Credit Note Liability    amount
CR  Customer Advance Sub-Ledger            amount
```

---

### UC-M5 — Walk-in AR Historical Cleanup
**Gap**: Before the `receiptEmbedded` fix (UC-7), every Walk-in POS cash sale created a duplicate RCPT-SAL journal entry. These historical entries leave a phantom CR balance on the Walk-in AR ledger.  
**Needed**: A one-time data migration that identifies all RCPT-SAL JEs whose linked AUTO-SAL JEs already contain the transit lines, and deletes the duplicate RCPT-SAL entries.

---

### UC-M6 — Wallet Balance Carry-Over Across Periods (Reconciliation)
**Gap**: There is no period-close reconciliation step that verifies the sum of all customer advance sub-ledgers equals the `sys-2140` group balance in the Trial Balance.  
**Needed**: A reconciliation check in the Accounting reports section, or as part of the period-close workflow, flagging any discrepancies.

---

### UC-M7 — Wallet Expiry / Validity Period
**Gap**: Advance credit never expires. Some businesses require wallet credit to expire after N days.  
**Needed**: An optional `walletExpiryDays` setting per customer or globally. Expired credit would post:
```
DR  Customer Advance Sub-Ledger    expired amount
CR  Other Income / Forfeited Credit    expired amount
```

---

### UC-M8 — Wallet Used in Invoice Bulk Payment Run
**Gap**: The bulk payment run (paying multiple invoices at once) does not consider the customer's wallet balance.  
**Needed**: Integrate `applyWalletToInvoice` into the bulk payment flow, with a per-invoice wallet allocation step.

---

## JE Reference Prefix Map

| Prefix | Event |
|---|---|
| `AUTO-SAL-xxx` | Sale JE (revenue + COGS) |
| `RCPT-SAL-xxx` | Separate cash receipt JE (credit/outstanding sales only) |
| `WFUND-xxx` | Wallet funded directly (Add Funds UI or migration) |
| `WAPPLY-xxx` | Wallet applied to invoice |
| `WADJ-xxx` | Wallet manual adjustment |
| `OPEN-WBAL-xxx` | Opening balance migration JE (m12) |
| `RCPT-INV-xxx` | Invoice payment receipt JE |
| `RPV-xxx` | Receipt/Payment Voucher JE |
