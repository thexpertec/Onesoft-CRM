import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import kvRouter from "./kv.js";
import publicRouter from "./public.js";
import authRouter from "./auth.js";
import accountsRouter from "./accounts.js";
import customersRouter from "./customers.js";
import productsRouter from "./products.js";
import brandsRouter from "./brands.js";
import productCategoriesRouter from "./product-categories.js";
import unitsRouter from "./units.js";
import attributesRouter from "./attributes.js";
import leadsRouter from "./leads.js";
import departmentsRouter from "./departments.js";
import designationsRouter from "./designations.js";
import citiesRouter from "./cities.js";
import areasRouter from "./areas.js";
import requirementDocsRouter from "./requirement-docs.js";
import stockItemsRouter from "./stock-items.js";
import stockLedgerRouter from "./stock-ledger.js";
import purchaseOrdersRouter from "./purchase-orders.js";
import salesRouter from "./sales.js";
import invoicesRouter from "./invoices.js";
import saleReturnsRouter from "./sale-returns.js";
import purchaseReturnsRouter from "./purchase-returns.js";
import rpVouchersRouter from "./rp-vouchers.js";
import staffRouter from "./staff.js";
import staffRolesRouter from "./staff-roles.js";
import salaryTemplatesRouter from "./salary-templates.js";
import salaryAllowanceCategoriesRouter from "./salary-allowance-categories.js";
import salaryDeductionCategoriesRouter from "./salary-deduction-categories.js";
import salarySlipsRouter from "./salary-slips.js";
import attendanceRecordsRouter from "./attendance-records.js";
import advanceSalariesRouter from "./advance-salaries.js";
import paymentAccountsRouter from "./payment-accounts.js";
import salesAgentsRouter from "./sales-agents.js";
import journalEntriesRouter from "./journal-entries.js";
import jobsRouter from "./jobs.js";
import jobApplicantsRouter from "./job-applicants.js";
import interviewSchedulesRouter from "./interview-schedules.js";
import migrateRouter from "./migrate.js";
import { requireApiKey } from "../middleware/require-api-key.js";

const router: IRouter = Router();

// ── Anonymous surface ────────────────────────────────────────────────────────
// Routes mounted before `requireApiKey` accept unauthenticated traffic.
//   - /healthz       deployment/uptime probes
//   - /api/kv/*      storefronts read/write through here (see kv.ts header)
//   - /api/public/*  public requirement-doc lookups
//   - /api/auth/*    tenant login (issues no session today, but must be open
//                    so the admin-dashboard's login page can call it)
router.use(healthRouter);
router.use("/kv", kvRouter);
router.use("/public", publicRouter);
router.use("/auth", authRouter);

// ── Protected surface ────────────────────────────────────────────────────────
// Everything below requires the `X-Api-Key` header to match `KV_API_SECRET`.
// The admin-dashboard sends this header automatically via `rFetch` in both
// `record-api.ts` and `api.ts`; no other client should reach these routes.
router.use(requireApiKey);

// Phase 0 — per-record relational endpoints. These coexist with /kv for now;
// the dashboard will migrate one surface at a time in Phases 1–3.
router.use("/accounts", accountsRouter);
router.use("/customers", customersRouter);
router.use("/products", productsRouter);
router.use("/brands", brandsRouter);
router.use("/product-categories", productCategoriesRouter);
router.use("/units", unitsRouter);
router.use("/attributes", attributesRouter);
router.use("/leads", leadsRouter);
router.use("/departments", departmentsRouter);
router.use("/designations", designationsRouter);
router.use("/cities", citiesRouter);
router.use("/areas", areasRouter);
router.use("/requirement-docs", requirementDocsRouter);
router.use("/stock-items", stockItemsRouter);
router.use("/stock-ledger", stockLedgerRouter);
router.use("/purchase-orders", purchaseOrdersRouter);
router.use("/sales", salesRouter);
router.use("/invoices", invoicesRouter);
router.use("/sale-returns", saleReturnsRouter);
router.use("/purchase-returns", purchaseReturnsRouter);
router.use("/rp-vouchers", rpVouchersRouter);
router.use("/staff", staffRouter);
router.use("/staff-roles", staffRolesRouter);
router.use("/salary-templates", salaryTemplatesRouter);
router.use("/salary-allowance-categories", salaryAllowanceCategoriesRouter);
router.use("/salary-deduction-categories", salaryDeductionCategoriesRouter);
router.use("/salary-slips", salarySlipsRouter);
router.use("/attendance-records", attendanceRecordsRouter);
router.use("/advance-salaries", advanceSalariesRouter);
router.use("/payment-accounts", paymentAccountsRouter);
router.use("/sales-agents", salesAgentsRouter);
router.use("/journal-entries", journalEntriesRouter);
router.use("/jobs", jobsRouter);
router.use("/job-applicants", jobApplicantsRouter);
router.use("/interview-schedules", interviewSchedulesRouter);

// Phase 2 — KV→relational migration endpoint.
router.use("/migrate", migrateRouter);

export default router;
