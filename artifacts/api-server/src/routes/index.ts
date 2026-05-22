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
import staffRouter from "./staff.js";
import journalEntriesRouter from "./journal-entries.js";
import migrateRouter from "./migrate.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/kv", kvRouter);
router.use("/public", publicRouter);
router.use("/auth", authRouter);

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
router.use("/staff", staffRouter);
router.use("/journal-entries", journalEntriesRouter);

// Phase 2 — KV→relational migration endpoint.
router.use("/migrate", migrateRouter);

export default router;
