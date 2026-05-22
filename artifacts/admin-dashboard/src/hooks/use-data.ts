import { useState, useEffect, useCallback } from "react";
import {
  getLeads, getDocs, createLead, updateLead, deleteLead, createDoc, updateDoc, deleteDoc,
  AdvanceSalary, getAdvanceSalaries, createAdvanceSalary, updateAdvanceSalary, deleteAdvanceSalary,
  getCities, createCity, updateCity, deleteCity,
  getAreas, createArea, updateArea, deleteArea,
  getPaymentAccounts, createPaymentAccount, updatePaymentAccount, deletePaymentAccount,
  getCustomers, createCustomer, updateCustomer, deleteCustomer,
  getProductCategories, createProductCategory, updateProductCategory, deleteProductCategory,
  getProductGroups, createProductGroup, updateProductGroup, deleteProductGroup,
  getShareholders, createShareholder, updateShareholder, deleteShareholder,
  getInvestmentPlans, createInvestmentPlan, updateInvestmentPlan, deleteInvestmentPlan,
  getProducts, createProduct, updateProduct, deleteProduct, reorderProducts,
  getBrands, createBrand, updateBrand, deleteBrand,
  getProductDepartments, createProductDepartment, updateProductDepartment, deleteProductDepartment,
  getAttributes, createAttribute, updateAttribute, deleteAttribute,
  getUnits, createUnit, updateUnit, deleteUnit,
  getPurchaseOrders, createPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder,
  getStaff, createStaff, updateStaff, deleteStaff,
  getStaffRoles, createStaffRole, updateStaffRole, deleteStaffRole,
  getDepartments, createDepartment, updateDepartment, deleteDepartment,
  getDesignations, createDesignation, updateDesignation, deleteDesignation,
  getStock, createStockItem, updateStockItem, deleteStockItem,
  getSales, createSale, updateSale, deleteSale,
  getSaleReturns, SaleReturn,
  getInvoices, createInvoice, updateInvoice, deleteInvoice,
  getAccounts, createAccount, updateAccount, deleteAccount,
  getJournalEntries, createJournalEntry, updateJournalEntry, deleteJournalEntry,
  getSalesAgents, createSalesAgent, updateSalesAgent, deleteSalesAgent,
  getRawMaterials, createRawMaterial, updateRawMaterial, deleteRawMaterial,
  getManufacturingOrders, createManufacturingOrder, updateManufacturingOrder, deleteManufacturingOrder, completeManufacturingOrder,
  getRecipes, createRecipe, deleteRecipe,
  getRPVouchers, createRPVoucher, updateRPVoucher, deleteRPVoucher, postRPVoucherJE,
  Lead, RequirementDoc, Customer, ProductCategory, ProductGroup, Shareholder, InvestmentPlan,
  Product, Brand, Attribute, Unit, PurchaseOrder, Staff, StaffRole, Department, Designation, StockItem, Sale, Invoice, Account,
  JournalEntry, SalesAgent, RawMaterial, ManufacturingOrder, MfgRecipe, MfgOutput, ProductionCost, RPVoucher,
  City, Area, PaymentAccount,
  SalarySlip, getSalarySlips, createSalarySlip, updateSalarySlip, deleteSalarySlip,
  AttendanceRecord, getAttendanceRecords, upsertAttendance, bulkUpsertAttendance, deleteAttendanceRecord,
  SalaryTemplate, getSalaryTemplates, createSalaryTemplate, updateSalaryTemplate, deleteSalaryTemplate,
  SalaryAllowanceCategory, getSalaryAllowanceCategories, createSalaryAllowanceCategory, updateSalaryAllowanceCategory, deleteSalaryAllowanceCategory,
  SalaryDeductionCategory, getSalaryDeductionCategories, createSalaryDeductionCategory, updateSalaryDeductionCategory, deleteSalaryDeductionCategory,
  getActiveTenantId,
  patchAccountInCache, removeAccountFromCache,
  patchJEInCache, removeJEFromCache,
  patchBrandInCache, removeBrandFromCache,
  patchUnitInCache, removeUnitFromCache,
  patchAttributeInCache, removeAttributeFromCache,
  patchCityInCache, removeCityFromCache,
  patchAreaInCache, removeAreaFromCache,
  patchDepartmentInCache, removeDepartmentFromCache,
  patchDesignationInCache, removeDesignationFromCache,
  patchProductCategoryInCache, removeProductCategoryFromCache,
  patchLeadInCache, removeLeadFromCache,
  patchDocInCache, removeDocFromCache,
  addActivity,
} from "@/lib/store";
import {
  apiCreateAccount, apiUpdateAccount, apiDeleteAccount,
  apiCreateJE, apiUpdateJE, apiDeleteJE,
  brandsApi, unitsApi, attributesApi, citiesApi, areasApi,
  departmentsApi, designationsApi, productCategoriesApi,
  leadsApi, requirementDocsApi,
  type ApiJELine,
} from "@/lib/record-api";

/** Pull the active tenant or throw — used by every REST-backed hook. */
function requireTenantId(): string {
  const tid = getActiveTenantId();
  if (!tid) throw new Error("No active tenant");
  return tid;
}

/**
 * Subscribes a callback to both "storage" (cross-tab writes via setStored)
 * and "onesoft:data-synced" (fired at the end of syncAllFromServer) so hooks
 * always refresh after the async server sync completes on page load.
 */
function useStoreEffect(cb: () => void) {
  useEffect(() => {
    cb();
    window.addEventListener("storage", cb);
    window.addEventListener("onesoft:data-synced", cb);
    return () => {
      window.removeEventListener("storage", cb);
      window.removeEventListener("onesoft:data-synced", cb);
    };
  // cb is a stable useCallback(fn,[]) reference — deps intentionally empty.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// Lead columns that are nullable TIMESTAMPTZ/NUMERIC — UI clears them by
// passing `undefined` (or `""` from a date input). `JSON.stringify` drops
// undefined keys before they reach the server, so without this normalization
// the clear silently no-ops. Empty strings also fail TIMESTAMPTZ parsing.
const LEAD_NULLABLE_COLUMNS = new Set<string>([
  "nextReminder", "reminderNote", "dealValue", "assignedTo",
  "temperature", "nextFollowUp", "country", "website",
]);

function normalizeLeadUpdates(
  updates: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) {
      // Caller included the key — intent is "clear". Send null so JSON.stringify
      // preserves it and the server SET writes NULL.
      out[k] = null;
    } else if (v === "" && LEAD_NULLABLE_COLUMNS.has(k)) {
      // Empty string into a nullable timestamp/numeric column is "clear",
      // not a literal empty value — TIMESTAMPTZ would reject "" outright.
      out[k] = null;
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function useLeads() {
  const [leads, setLeads] = useState<Lead[]>(() => getLeads());
  const fetchLeads = useCallback(() => setLeads(getLeads()), []);
  useStoreEffect(fetchLeads);

  // REST-backed (Batch 2). The legacy `createLead` defaulted
  // `isRelevant: true` and `callLogs: []`; we mirror that here so the
  // hook is bug-compatible with the KV-era behaviour. `addActivity` is
  // still called locally — the activity log remains a KV-side artefact
  // until it gets its own migration session. Each `addActivity` call is
  // guarded by an active-tenant check so a stale completion from tenant A
  // can't log activity into tenant B after a mid-flight tenant switch.
  const addLead = async (lead: Parameters<typeof createLead>[0]): Promise<Lead> => {
    const tid = requireTenantId();
    const payload = { isRelevant: true, callLogs: [], ...lead };
    const row = await leadsApi.create(tid, payload);
    patchLeadInCache(tid, row);
    if (getActiveTenantId() === tid) {
      addActivity({ action: "created", entity: "Lead", entityName: row.name, detail: row.company || undefined });
    }
    fetchLeads();
    return row;
  };

  const editLead = async (id: string, updates: Parameters<typeof updateLead>[1]): Promise<Lead> => {
    const tid = requireTenantId();
    const payload = normalizeLeadUpdates(updates as Record<string, unknown>);
    const row = await leadsApi.update(tid, id, payload as Parameters<typeof updateLead>[1]);
    patchLeadInCache(tid, row);
    if (getActiveTenantId() === tid) {
      const detail = updates.status ? `Status → ${updates.status}` : undefined;
      addActivity({ action: updates.status ? "status_changed" : "updated", entity: "Lead", entityName: row.name, detail });
    }
    fetchLeads();
    return row;
  };

  const removeLead = async (id: string): Promise<void> => {
    const tid = requireTenantId();
    const lead = getLeads().find(l => l.id === id);
    await leadsApi.delete(tid, id);
    removeLeadFromCache(tid, id);
    if (getActiveTenantId() === tid) {
      addActivity({ action: "deleted", entity: "Lead", entityName: lead?.name || id });
    }
    fetchLeads();
  };

  return { leads, addLead, editLead, removeLead, refresh: fetchLeads };
}

export function useDocs() {
  const [docs, setDocs] = useState<RequirementDoc[]>(() => getDocs());
  const fetchDocs = useCallback(() => setDocs(getDocs()), []);
  useStoreEffect(fetchDocs);

  // REST-backed (Batch 2). Requirement-docs has no activity log or
  // dependent records, so the migration is a straight pass-through.
  const addDoc = async (doc: Parameters<typeof createDoc>[0]): Promise<RequirementDoc> => {
    const tid = requireTenantId();
    const row = await requirementDocsApi.create(tid, doc);
    patchDocInCache(tid, row); fetchDocs(); return row;
  };

  const editDoc = async (id: string, updates: Parameters<typeof updateDoc>[1]): Promise<RequirementDoc> => {
    const tid = requireTenantId();
    const row = await requirementDocsApi.update(tid, id, updates);
    patchDocInCache(tid, row); fetchDocs(); return row;
  };

  const removeDoc = async (id: string): Promise<void> => {
    const tid = requireTenantId();
    await requirementDocsApi.delete(tid, id);
    removeDocFromCache(tid, id); fetchDocs();
  };

  return { docs, addDoc, editDoc, removeDoc, refresh: fetchDocs };
}

export function useCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);

  const fetchCustomers = useCallback(() => {
    setCustomers(getCustomers());
  }, []);

  useStoreEffect(fetchCustomers);

  const addCustomer = (data: Parameters<typeof createCustomer>[0]) => {
    const c = createCustomer(data);
    fetchCustomers();
    return c;
  };

  const editCustomer = (id: string, updates: Parameters<typeof updateCustomer>[1]) => {
    const c = updateCustomer(id, updates);
    fetchCustomers();
    return c;
  };

  const removeCustomer = (id: string) => {
    deleteCustomer(id);
    fetchCustomers();
  };

  return { customers, addCustomer, editCustomer, removeCustomer, refresh: fetchCustomers };
}

export function useProductCategories() {
  const [categories, setCategories] = useState<ProductCategory[]>(() => getProductCategories());
  const fetchCategories = useCallback(() => setCategories(getProductCategories()), []);
  useStoreEffect(fetchCategories);

  const addCategory = async (data: Parameters<typeof createProductCategory>[0]): Promise<ProductCategory> => {
    const tid = requireTenantId();
    const row = await productCategoriesApi.create(tid, data);
    patchProductCategoryInCache(tid, row);
    fetchCategories();
    return row;
  };

  const editCategory = async (id: string, updates: Parameters<typeof updateProductCategory>[1]): Promise<ProductCategory> => {
    const tid = requireTenantId();
    const row = await productCategoriesApi.update(tid, id, updates);
    patchProductCategoryInCache(tid, row);
    fetchCategories();
    return row;
  };

  const removeCategory = async (id: string): Promise<void> => {
    // Backend `deleteBlockers` mirrors the old FE `_categoryFinancialBlockers`
    // (products.category === name + sr/pur/inv-cat ledger refs). If anything
    // references this category the API returns 409 and we surface the error.
    // The old FE-side products.category="" fixup after delete is dropped:
    // the blocker prevents this state from ever arising.
    const tid = requireTenantId();
    await productCategoriesApi.delete(tid, id);
    removeProductCategoryFromCache(tid, id);
    fetchCategories();
  };

  return { categories, addCategory, editCategory, removeCategory, refresh: fetchCategories };
}

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);

  const fetchProducts = useCallback(() => { setProducts(getProducts()); }, []);

  useStoreEffect(fetchProducts);

  const addProduct    = (data: Parameters<typeof createProduct>[0]) => { const p = createProduct(data); fetchProducts(); return p; };
  const editProduct   = (id: string, updates: Parameters<typeof updateProduct>[1]) => { const p = updateProduct(id, updates); fetchProducts(); return p; };
  const removeProduct = (id: string) => { deleteProduct(id); fetchProducts(); };
  const reorderProds  = (ids: string[]) => { reorderProducts(ids); fetchProducts(); };

  return { products, addProduct, editProduct, removeProduct, reorderProds, refresh: fetchProducts };
}

export function useProductDepartments() {
  const [productDepartments, setProductDepartments] = useState<import("@/lib/store").ProductDepartment[]>([]);

  const fetch = useCallback(() => { setProductDepartments(getProductDepartments()); }, []);

  useStoreEffect(fetch);

  const add    = (data: Parameters<typeof createProductDepartment>[0])                               => { const d = createProductDepartment(data);        fetch(); return d; };
  const edit   = (id: string, updates: Parameters<typeof updateProductDepartment>[1])                => { const d = updateProductDepartment(id, updates); fetch(); return d; };
  const remove = (id: string)                                                                        => { deleteProductDepartment(id);                     fetch(); };

  return { productDepartments, add, edit, remove, refresh: fetch };
}

export function useBrands() {
  const [brands, setBrands] = useState<Brand[]>(() => getBrands());
  const fetchBrands = useCallback(() => setBrands(getBrands()), []);
  useStoreEffect(fetchBrands);

  const addBrand = async (data: Parameters<typeof createBrand>[0]): Promise<Brand> => {
    const tid = requireTenantId();
    const row = await brandsApi.create(tid, data);
    patchBrandInCache(tid, row); fetchBrands(); return row;
  };
  const editBrand = async (id: string, updates: Parameters<typeof updateBrand>[1]): Promise<Brand> => {
    const tid = requireTenantId();
    const row = await brandsApi.update(tid, id, updates);
    patchBrandInCache(tid, row); fetchBrands(); return row;
  };
  const removeBrand = async (id: string): Promise<void> => {
    const tid = requireTenantId();
    await brandsApi.delete(tid, id);
    removeBrandFromCache(tid, id); fetchBrands();
  };

  return { brands, addBrand, editBrand, removeBrand, refresh: fetchBrands };
}

export function useAttributes() {
  const [attributes, setAttributes] = useState<Attribute[]>(() => getAttributes());
  const fetchAttributes = useCallback(() => setAttributes(getAttributes()), []);
  useStoreEffect(fetchAttributes);

  const addAttribute = async (data: Parameters<typeof createAttribute>[0]): Promise<Attribute> => {
    const tid = requireTenantId();
    const row = await attributesApi.create(tid, data as Omit<Attribute, "id" | "createdAt" | "updatedAt">);
    patchAttributeInCache(tid, row); fetchAttributes(); return row;
  };
  const editAttribute = async (id: string, updates: Parameters<typeof updateAttribute>[1]): Promise<Attribute> => {
    const tid = requireTenantId();
    const row = await attributesApi.update(tid, id, updates);
    patchAttributeInCache(tid, row); fetchAttributes(); return row;
  };
  const removeAttribute = async (id: string): Promise<void> => {
    const tid = requireTenantId();
    await attributesApi.delete(tid, id);
    removeAttributeFromCache(tid, id); fetchAttributes();
  };

  return { attributes, addAttribute, editAttribute, removeAttribute, refresh: fetchAttributes };
}

export function useUnits() {
  const [units, setUnits] = useState<Unit[]>(() => getUnits());
  const fetchUnits = useCallback(() => setUnits(getUnits()), []);
  useStoreEffect(fetchUnits);

  const addUnit = async (data: Parameters<typeof createUnit>[0]): Promise<Unit> => {
    const tid = requireTenantId();
    const row = await unitsApi.create(tid, data);
    patchUnitInCache(tid, row); fetchUnits(); return row;
  };
  const editUnit = async (id: string, updates: Parameters<typeof updateUnit>[1]): Promise<Unit> => {
    const tid = requireTenantId();
    const row = await unitsApi.update(tid, id, updates);
    patchUnitInCache(tid, row); fetchUnits(); return row;
  };
  const removeUnit = async (id: string): Promise<void> => {
    const tid = requireTenantId();
    await unitsApi.delete(tid, id);
    removeUnitFromCache(tid, id); fetchUnits();
  };

  return { units, addUnit, editUnit, removeUnit, refresh: fetchUnits };
}


export function usePurchaseOrders() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);

  const fetchOrders = useCallback(() => {
    setPurchaseOrders(getPurchaseOrders());
  }, []);

  useStoreEffect(fetchOrders);

  const addPurchaseOrder = (data: Parameters<typeof createPurchaseOrder>[0]) => {
    const po = createPurchaseOrder(data);
    fetchOrders();
    return po;
  };

  const editPurchaseOrder = (id: string, updates: Parameters<typeof updatePurchaseOrder>[1]) => {
    const po = updatePurchaseOrder(id, updates);
    fetchOrders();
    return po;
  };

  const removePurchaseOrder = (id: string) => {
    deletePurchaseOrder(id);
    fetchOrders();
  };

  return { purchaseOrders, addPurchaseOrder, editPurchaseOrder, removePurchaseOrder, refresh: fetchOrders };
}

export function useInvoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const fetch = useCallback(() => setInvoices(getInvoices()), []);
  useStoreEffect(fetch);
  const addInvoice    = (d: Parameters<typeof createInvoice>[0])                 => { const inv = createInvoice(d);    fetch(); return inv; };
  const editInvoice   = (id: string, u: Parameters<typeof updateInvoice>[1])     => { const inv = updateInvoice(id, u); fetch(); return inv; };
  const removeInvoice = (id: string)                                              => { deleteInvoice(id);               fetch(); };
  return { invoices, addInvoice, editInvoice, removeInvoice, refresh: fetch };
}

export function useSales() {
  const [sales, setSales] = useState<Sale[]>([]);
  const fetch = useCallback(() => setSales(getSales()), []);
  useStoreEffect(fetch);
  const addSale    = (d: Parameters<typeof createSale>[0])               => { const s = createSale(d);    fetch(); return s; };
  const editSale   = (id: string, u: Parameters<typeof updateSale>[1])   => { const s = updateSale(id, u); fetch(); return s; };
  const removeSale = (id: string)                                         => { deleteSale(id);              fetch(); };
  return { sales, addSale, editSale, removeSale, refresh: fetch };
}

/** Read-only hook over sale returns — refreshes on cross-tab writes and post-sync. */
export function useSaleReturns() {
  const [saleReturns, setSaleReturns] = useState<SaleReturn[]>([]);
  const fetch = useCallback(() => setSaleReturns(getSaleReturns()), []);
  useStoreEffect(fetch);
  return { saleReturns, refresh: fetch };
}

export function useStock() {
  const [stock, setStock] = useState<StockItem[]>([]);
  const fetch = useCallback(() => setStock(getStock()), []);
  useStoreEffect(fetch);
  const addItem    = (d: Parameters<typeof createStockItem>[0])                   => { const s = createStockItem(d);    fetch(); return s; };
  const editItem   = (id: string, u: Parameters<typeof updateStockItem>[1])       => { const s = updateStockItem(id, u); fetch(); return s; };
  const removeItem = (id: string)                                                  => { deleteStockItem(id);              fetch(); };
  return { stock, addItem, editItem, removeItem, refresh: fetch };
}

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>(() => getAccounts());
  const fetch = useCallback(() => setAccounts(getAccounts()), []);
  useStoreEffect(fetch);

  const addAccount = async (d: Parameters<typeof createAccount>[0]): Promise<Account> => {
    const tenantId = getActiveTenantId();
    if (!tenantId) throw new Error("No active tenant");
    const row = await apiCreateAccount(tenantId, d);
    patchAccountInCache(row);
    fetch();
    return row;
  };

  const editAccount = async (
    id: string,
    u: Parameters<typeof updateAccount>[1],
  ): Promise<Account> => {
    const tenantId = getActiveTenantId();
    if (!tenantId) throw new Error("No active tenant");
    const row = await apiUpdateAccount(tenantId, id, u);
    patchAccountInCache(row);
    fetch();
    return row;
  };

  const removeAccount = async (id: string): Promise<void> => {
    const tenantId = getActiveTenantId();
    if (!tenantId) throw new Error("No active tenant");
    await apiDeleteAccount(tenantId, id);
    removeAccountFromCache(id);
    fetch();
  };

  return { accounts, addAccount, editAccount, removeAccount, refresh: fetch };
}

export function useStaff() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const fetch = useCallback(() => setStaff(getStaff()), []);
  useStoreEffect(fetch);
  const addStaff    = (d: Parameters<typeof createStaff>[0])                 => { const s = createStaff(d);    fetch(); return s; };
  const editStaff   = (id: string, u: Parameters<typeof updateStaff>[1])     => { const s = updateStaff(id, u); fetch(); return s; };
  const removeStaff = (id: string)                                            => { deleteStaff(id);              fetch(); };
  return { staff, addStaff, editStaff, removeStaff, refresh: fetch };
}

export function useStaffRoles() {
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const fetch = useCallback(() => setRoles(getStaffRoles()), []);
  useStoreEffect(fetch);
  const addRole    = (d: Parameters<typeof createStaffRole>[0])                   => { const r = createStaffRole(d);    fetch(); return r; };
  const editRole   = (id: string, u: Parameters<typeof updateStaffRole>[1])       => { const r = updateStaffRole(id, u); fetch(); return r; };
  const removeRole = (id: string)                                                  => { deleteStaffRole(id);              fetch(); };
  return { roles, addRole, editRole, removeRole, refresh: fetch };
}

export function useDepartments() {
  const [departments, setDepartments] = useState<Department[]>(() => getDepartments());
  const fetch = useCallback(() => setDepartments(getDepartments()), []);
  useStoreEffect(fetch);
  const addDepartment = async (d: Parameters<typeof createDepartment>[0]): Promise<Department> => {
    const tid = requireTenantId();
    const r = await departmentsApi.create(tid, d);
    patchDepartmentInCache(tid, r); fetch(); return r;
  };
  const editDepartment = async (id: string, u: Parameters<typeof updateDepartment>[1]): Promise<Department> => {
    const tid = requireTenantId();
    const r = await departmentsApi.update(tid, id, u);
    patchDepartmentInCache(tid, r); fetch(); return r;
  };
  const removeDepartment = async (id: string): Promise<void> => {
    const tid = requireTenantId();
    await departmentsApi.delete(tid, id);
    removeDepartmentFromCache(tid, id); fetch();
  };
  return { departments, addDepartment, editDepartment, removeDepartment, refresh: fetch };
}

export function useDesignations() {
  const [designations, setDesignations] = useState<Designation[]>(() => getDesignations());
  const fetch = useCallback(() => setDesignations(getDesignations()), []);
  useStoreEffect(fetch);
  const addDesignation = async (d: Parameters<typeof createDesignation>[0]): Promise<Designation> => {
    const tid = requireTenantId();
    const r = await designationsApi.create(tid, d);
    patchDesignationInCache(tid, r); fetch(); return r;
  };
  const editDesignation = async (id: string, u: Parameters<typeof updateDesignation>[1]): Promise<Designation> => {
    const tid = requireTenantId();
    const r = await designationsApi.update(tid, id, u);
    patchDesignationInCache(tid, r); fetch(); return r;
  };
  const removeDesignation = async (id: string): Promise<void> => {
    const tid = requireTenantId();
    await designationsApi.delete(tid, id);
    removeDesignationFromCache(tid, id); fetch();
  };
  return { designations, addDesignation, editDesignation, removeDesignation, refresh: fetch };
}

export function useShareholders() {
  const [shareholders, setShareholders] = useState<Shareholder[]>([]);
  const fetch = useCallback(() => setShareholders(getShareholders()), []);
  useStoreEffect(fetch);
  const addShareholder    = (d: Parameters<typeof createShareholder>[0])                => { const s = createShareholder(d);    fetch(); return s; };
  const editShareholder   = (id: string, u: Parameters<typeof updateShareholder>[1])    => { const s = updateShareholder(id, u); fetch(); return s; };
  const removeShareholder = (id: string)                                                 => { deleteShareholder(id);              fetch(); };
  return { shareholders, addShareholder, editShareholder, removeShareholder, refresh: fetch };
}

export function useInvestmentPlans() {
  const [plans, setPlans] = useState<InvestmentPlan[]>([]);
  const fetch = useCallback(() => setPlans(getInvestmentPlans()), []);
  useStoreEffect(fetch);
  const addPlan    = (d: Parameters<typeof createInvestmentPlan>[0])                => { const p = createInvestmentPlan(d);    fetch(); return p; };
  const editPlan   = (id: string, u: Parameters<typeof updateInvestmentPlan>[1])    => { const p = updateInvestmentPlan(id, u); fetch(); return p; };
  const removePlan = (id: string)                                                    => { deleteInvestmentPlan(id);              fetch(); };
  return { plans, addPlan, editPlan, removePlan, refresh: fetch };
}

export function useJournalEntries() {
  const [entries, setEntries] = useState<JournalEntry[]>(() => getJournalEntries());
  const fetch = useCallback(() => setEntries(getJournalEntries()), []);
  useStoreEffect(fetch);

  const addEntry = async (d: Parameters<typeof createJournalEntry>[0]): Promise<JournalEntry> => {
    const tenantId = getActiveTenantId();
    if (!tenantId) throw new Error("No active tenant");
    const accts = getAccounts();
    const lines: ApiJELine[] = (d.lines ?? []).map((l, i) => {
      const acc = accts.find(a => a.id === l.ledgerId);
      return {
        id: l.id,
        ledgerAccountId: l.ledgerId,
        accountCode: acc?.code ?? "",
        narration: l.narration,
        debit: l.debit,
        credit: l.credit,
        staffId: l.staffId ?? null,
        lineOrder: i,
      };
    });
    const je = await apiCreateJE(tenantId, {
      reference: d.reference,
      description: d.description,
      date: d.date,
      status: d.status,
    }, lines);
    patchJEInCache(je);
    fetch();
    return je;
  };

  const editEntry = async (
    id: string,
    u: Parameters<typeof updateJournalEntry>[1],
  ): Promise<JournalEntry> => {
    const tenantId = getActiveTenantId();
    if (!tenantId) throw new Error("No active tenant");
    const accts = getAccounts();
    const lines: ApiJELine[] = (u.lines ?? []).map((l, i) => {
      const acc = accts.find(a => a.id === l.ledgerId);
      return {
        id: l.id,
        ledgerAccountId: l.ledgerId,
        accountCode: acc?.code ?? "",
        narration: l.narration,
        debit: l.debit,
        credit: l.credit,
        staffId: l.staffId ?? null,
        lineOrder: i,
      };
    });
    const je = await apiUpdateJE(tenantId, id, {
      reference: u.reference,
      description: u.description,
      date: u.date,
      status: u.status,
    }, lines);
    patchJEInCache(je);
    fetch();
    return je;
  };

  const removeEntry = async (id: string): Promise<void> => {
    const tenantId = getActiveTenantId();
    if (!tenantId) throw new Error("No active tenant");
    await apiDeleteJE(tenantId, id);
    removeJEFromCache(id);
    fetch();
  };

  return { entries, addEntry, editEntry, removeEntry, refresh: fetch };
}

export function useProductGroups() {
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const fetch = useCallback(() => setGroups(getProductGroups()), []);
  useStoreEffect(fetch);
  const addGroup    = (d: Parameters<typeof createProductGroup>[0])                => { const g = createProductGroup(d);    fetch(); return g; };
  const editGroup   = (id: string, u: Parameters<typeof updateProductGroup>[1])    => { const g = updateProductGroup(id, u); fetch(); return g; };
  const removeGroup = (id: string)                                                  => { deleteProductGroup(id);              fetch(); };
  return { groups, addGroup, editGroup, removeGroup, refresh: fetch };
}

export function useSalesAgents() {
  const [agents, setAgents] = useState<SalesAgent[]>([]);
  const fetch = useCallback(() => setAgents(getSalesAgents()), []);
  useStoreEffect(fetch);
  const addAgent    = (d: Parameters<typeof createSalesAgent>[0])               => { const a = createSalesAgent(d);    fetch(); return a; };
  const editAgent   = (id: string, u: Parameters<typeof updateSalesAgent>[1])   => { const a = updateSalesAgent(id, u); fetch(); return a; };
  const removeAgent = (id: string)                                               => { deleteSalesAgent(id);              fetch(); };
  return { agents, addAgent, editAgent, removeAgent, refresh: fetch };
}

export function useRawMaterials() {
  const [rms, setRms] = useState<RawMaterial[]>([]);
  const fetch = useCallback(() => setRms(getRawMaterials()), []);
  useStoreEffect(fetch);
  const add    = (d: Parameters<typeof createRawMaterial>[0])             => { const r = createRawMaterial(d);    fetch(); return r; };
  const edit   = (id: string, u: Parameters<typeof updateRawMaterial>[1]) => { const r = updateRawMaterial(id, u); fetch(); return r; };
  const remove = (id: string)                                              => { deleteRawMaterial(id);              fetch(); };
  return { rms, add, edit, remove, refresh: fetch };
}

export function useManufacturingOrders() {
  const [orders, setOrders] = useState<ManufacturingOrder[]>([]);
  const fetch = useCallback(() => setOrders(getManufacturingOrders()), []);
  useStoreEffect(fetch);
  const add     = (d: Parameters<typeof createManufacturingOrder>[0])             => { const o = createManufacturingOrder(d);    fetch(); return o; };
  const edit    = (id: string, u: Parameters<typeof updateManufacturingOrder>[1]) => { const o = updateManufacturingOrder(id, u); fetch(); return o; };
  const remove  = (id: string)                                                     => { deleteManufacturingOrder(id);              fetch(); };
  const complete = (id: string)                                                    => { const o = completeManufacturingOrder(id);  fetch(); return o; };
  return { orders, add, edit, remove, complete, refresh: fetch };
}

export function useRecipes() {
  const [recipes, setRecipes] = useState<MfgRecipe[]>([]);
  const fetch = useCallback(() => setRecipes(getRecipes()), []);
  useStoreEffect(fetch);
  const add    = (d: Parameters<typeof createRecipe>[0]) => { const r = createRecipe(d); fetch(); return r; };
  const remove = (id: string)                            => { deleteRecipe(id);           fetch(); };
  return { recipes, add, remove, refresh: fetch };
}

export function useRPVouchers() {
  const [vouchers, setVouchers] = useState<RPVoucher[]>([]);
  const fetch = useCallback(() => setVouchers(getRPVouchers()), []);
  useStoreEffect(fetch);
  const add    = (d: Parameters<typeof createRPVoucher>[0])              => { const v = createRPVoucher(d);    fetch(); return v; };
  const edit   = (id: string, u: Parameters<typeof updateRPVoucher>[1]) => { const v = updateRPVoucher(id, u); fetch(); return v; };
  const remove = (id: string)                                             => { deleteRPVoucher(id);              fetch(); };
  const post   = (id: string)                                             => { const je = postRPVoucherJE(id);   fetch(); return je; };
  return { vouchers, add, edit, remove, post, refresh: fetch };
}

export function useCities() {
  const [cities, setCities] = useState<City[]>(() => getCities());
  const fetch = useCallback(() => setCities(getCities()), []);
  useStoreEffect(fetch);
  const add = async (d: Parameters<typeof createCity>[0]): Promise<City> => {
    const tid = requireTenantId();
    const c = await citiesApi.create(tid, d);
    patchCityInCache(tid, c); fetch(); return c;
  };
  const edit = async (id: string, u: Parameters<typeof updateCity>[1]): Promise<City> => {
    const tid = requireTenantId();
    const c = await citiesApi.update(tid, id, u);
    patchCityInCache(tid, c); fetch(); return c;
  };
  const remove = async (id: string): Promise<void> => {
    // Mirrors legacy `deleteCity` cascade: clean up child areas FE-side after
    // the city REST delete succeeds. The backend has no FK cascade on
    // `areas.city_id`, so without this any orphaned areas would survive.
    // Serial (not parallel) so a mid-cascade failure reports cleanly and
    // doesn't leave the cache wedged with mixed succeeded/failed deletes.
    const tid = requireTenantId();
    await citiesApi.delete(tid, id);
    removeCityFromCache(tid, id);
    const orphans = getAreas().filter(a => a.cityId === id);
    for (const a of orphans) {
      await areasApi.delete(tid, a.id);
      removeAreaFromCache(tid, a.id);
    }
    fetch();
  };
  return { cities, add, edit, remove, refresh: fetch };
}

export function useAreas() {
  const [areas, setAreas] = useState<Area[]>(() => getAreas());
  const fetch = useCallback(() => setAreas(getAreas()), []);
  useStoreEffect(fetch);
  const add = async (d: Parameters<typeof createArea>[0]): Promise<Area> => {
    const tid = requireTenantId();
    const a = await areasApi.create(tid, d);
    patchAreaInCache(tid, a); fetch(); return a;
  };
  const edit = async (id: string, u: Parameters<typeof updateArea>[1]): Promise<Area> => {
    const tid = requireTenantId();
    const a = await areasApi.update(tid, id, u);
    patchAreaInCache(tid, a); fetch(); return a;
  };
  const remove = async (id: string): Promise<void> => {
    const tid = requireTenantId();
    await areasApi.delete(tid, id);
    removeAreaFromCache(tid, id); fetch();
  };
  return { areas, add, edit, remove, refresh: fetch };
}

export function usePaymentAccounts() {
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const fetch = useCallback(() => setAccounts(getPaymentAccounts()), []);
  useStoreEffect(fetch);
  const add    = (d: Parameters<typeof createPaymentAccount>[0])              => { const a = createPaymentAccount(d);    fetch(); return a; };
  const edit   = (id: string, u: Parameters<typeof updatePaymentAccount>[1]) => { const a = updatePaymentAccount(id, u); fetch(); return a; };
  const remove = (id: string)                                                  => { deletePaymentAccount(id);              fetch(); };
  return { accounts, add, edit, remove, refresh: fetch };
}

export function useSalarySlips() {
  const [slips, setSlips] = useState<SalarySlip[]>([]);
  const fetch = useCallback(() => setSlips(getSalarySlips()), []);
  useStoreEffect(fetch);
  const add    = (d: Parameters<typeof createSalarySlip>[0])                 => { const s = createSalarySlip(d);    fetch(); return s; };
  const edit   = (id: string, u: Parameters<typeof updateSalarySlip>[1])     => { const s = updateSalarySlip(id, u); fetch(); return s; };
  const remove = (id: string)                                                  => { deleteSalarySlip(id);              fetch(); };
  return { slips, add, edit, remove, refresh: fetch };
}

export function useAttendance() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const fetch = useCallback(() => setRecords(getAttendanceRecords()), []);
  useStoreEffect(fetch);
  const upsert     = (d: Parameters<typeof upsertAttendance>[0])     => { const r = upsertAttendance(d);     fetch(); return r; };
  const bulkUpsert = (d: Parameters<typeof bulkUpsertAttendance>[0]) => { const r = bulkUpsertAttendance(d); fetch(); return r; };
  const remove     = (id: string)                                     => { deleteAttendanceRecord(id);        fetch(); };
  return { records, upsert, bulkUpsert, remove, refresh: fetch };
}

export function useSalaryTemplates() {
  const [templates, setTemplates] = useState<SalaryTemplate[]>([]);
  const fetch = useCallback(() => setTemplates(getSalaryTemplates()), []);
  useStoreEffect(fetch);
  const add    = (d: Parameters<typeof createSalaryTemplate>[0])                 => { const t = createSalaryTemplate(d);    fetch(); return t; };
  const edit   = (id: string, u: Parameters<typeof updateSalaryTemplate>[1])     => { const t = updateSalaryTemplate(id, u); fetch(); return t; };
  const remove = (id: string)                                                      => { deleteSalaryTemplate(id);              fetch(); };
  return { templates, add, edit, remove, refresh: fetch };
}

export function useSalaryAllowanceCategories() {
  const [cats, setCats] = useState<SalaryAllowanceCategory[]>([]);
  const fetch = useCallback(() => setCats(getSalaryAllowanceCategories()), []);
  useStoreEffect(fetch);
  const add    = (d: Parameters<typeof createSalaryAllowanceCategory>[0])             => { const c = createSalaryAllowanceCategory(d);    fetch(); return c; };
  const edit   = (id: string, u: Parameters<typeof updateSalaryAllowanceCategory>[1]) => { const c = updateSalaryAllowanceCategory(id, u); fetch(); return c; };
  const remove = (id: string)                                                           => { deleteSalaryAllowanceCategory(id);              fetch(); };
  return { cats, add, edit, remove, refresh: fetch };
}

export function useSalaryDeductionCategories() {
  const [cats, setCats] = useState<SalaryDeductionCategory[]>([]);
  const fetch = useCallback(() => setCats(getSalaryDeductionCategories()), []);
  useStoreEffect(fetch);
  const add    = (d: Parameters<typeof createSalaryDeductionCategory>[0])             => { const c = createSalaryDeductionCategory(d);    fetch(); return c; };
  const edit   = (id: string, u: Parameters<typeof updateSalaryDeductionCategory>[1]) => { const c = updateSalaryDeductionCategory(id, u); fetch(); return c; };
  const remove = (id: string)                                                           => { deleteSalaryDeductionCategory(id);              fetch(); };
  return { cats, add, edit, remove, refresh: fetch };
}

export function useAdvanceSalaries() {
  const [records, setRecords] = useState<AdvanceSalary[]>([]);
  const fetch = useCallback(() => setRecords(getAdvanceSalaries()), []);
  useStoreEffect(fetch);
  const add    = (d: Parameters<typeof createAdvanceSalary>[0])                 => { const r = createAdvanceSalary(d);    fetch(); return r; };
  const edit   = (id: string, u: Parameters<typeof updateAdvanceSalary>[1])     => { const r = updateAdvanceSalary(id, u); fetch(); return r; };
  const remove = (id: string)                                                     => { deleteAdvanceSalary(id);              fetch(); };
  return { records, add, edit, remove, refresh: fetch };
}
