import { useState, useEffect, useCallback } from "react";
import {
  getLeads, getDocs, createLead, updateLead, deleteLead, createDoc, updateDoc, deleteDoc,
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
  getAttributes, createAttribute, updateAttribute, deleteAttribute,
  getUnits, createUnit, updateUnit, deleteUnit,
  getPurchaseOrders, createPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder,
  getStaff, createStaff, updateStaff, deleteStaff,
  getStaffRoles, createStaffRole, updateStaffRole, deleteStaffRole,
  getDepartments, createDepartment, updateDepartment, deleteDepartment,
  getDesignations, createDesignation, updateDesignation, deleteDesignation,
  getStock, createStockItem, updateStockItem, deleteStockItem,
  getSales, createSale, updateSale, deleteSale,
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
} from "@/lib/store";

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

export function useLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);

  const fetchLeads = useCallback(() => {
    setLeads(getLeads());
  }, []);

  useStoreEffect(fetchLeads);

  const addLead = (lead: Parameters<typeof createLead>[0]) => {
    const newLead = createLead(lead);
    fetchLeads();
    return newLead;
  };

  const editLead = (id: string, updates: Parameters<typeof updateLead>[1]) => {
    const updated = updateLead(id, updates);
    fetchLeads();
    return updated;
  };

  const removeLead = (id: string) => {
    deleteLead(id);
    fetchLeads();
  };

  return { leads, addLead, editLead, removeLead, refresh: fetchLeads };
}

export function useDocs() {
  const [docs, setDocs] = useState<RequirementDoc[]>([]);

  const fetchDocs = useCallback(() => {
    setDocs(getDocs());
  }, []);

  useStoreEffect(fetchDocs);

  const addDoc = (doc: Parameters<typeof createDoc>[0]) => {
    const newDoc = createDoc(doc);
    fetchDocs();
    return newDoc;
  };

  const editDoc = (id: string, updates: Parameters<typeof updateDoc>[1]) => {
    const updated = updateDoc(id, updates);
    fetchDocs();
    return updated;
  };

  const removeDoc = (id: string) => {
    deleteDoc(id);
    fetchDocs();
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
  const [categories, setCategories] = useState<ProductCategory[]>([]);

  const fetchCategories = useCallback(() => {
    setCategories(getProductCategories());
  }, []);

  useStoreEffect(fetchCategories);

  const addCategory = (data: Parameters<typeof createProductCategory>[0]) => {
    const c = createProductCategory(data);
    fetchCategories();
    return c;
  };

  const editCategory = (id: string, updates: Parameters<typeof updateProductCategory>[1]) => {
    const c = updateProductCategory(id, updates);
    fetchCategories();
    return c;
  };

  const removeCategory = (id: string) => {
    deleteProductCategory(id);
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

export function useBrands() {
  const [brands, setBrands] = useState<Brand[]>([]);

  const fetchBrands = useCallback(() => { setBrands(getBrands()); }, []);

  useStoreEffect(fetchBrands);

  const addBrand = (data: Parameters<typeof createBrand>[0]) => { const b = createBrand(data); fetchBrands(); return b; };
  const editBrand = (id: string, updates: Parameters<typeof updateBrand>[1]) => { const b = updateBrand(id, updates); fetchBrands(); return b; };
  const removeBrand = (id: string) => { deleteBrand(id); fetchBrands(); };

  return { brands, addBrand, editBrand, removeBrand, refresh: fetchBrands };
}

export function useAttributes() {
  const [attributes, setAttributes] = useState<Attribute[]>([]);

  const fetchAttributes = useCallback(() => { setAttributes(getAttributes()); }, []);

  useStoreEffect(fetchAttributes);

  const addAttribute = (data: Parameters<typeof createAttribute>[0]) => { const a = createAttribute(data); fetchAttributes(); return a; };
  const editAttribute = (id: string, updates: Parameters<typeof updateAttribute>[1]) => { const a = updateAttribute(id, updates); fetchAttributes(); return a; };
  const removeAttribute = (id: string) => { deleteAttribute(id); fetchAttributes(); };

  return { attributes, addAttribute, editAttribute, removeAttribute, refresh: fetchAttributes };
}

export function useUnits() {
  const [units, setUnits] = useState<Unit[]>([]);

  const fetchUnits = useCallback(() => { setUnits(getUnits()); }, []);

  useStoreEffect(fetchUnits);

  const addUnit = (data: Parameters<typeof createUnit>[0]) => { const u = createUnit(data); fetchUnits(); return u; };
  const editUnit = (id: string, updates: Parameters<typeof updateUnit>[1]) => { const u = updateUnit(id, updates); fetchUnits(); return u; };
  const removeUnit = (id: string) => { deleteUnit(id); fetchUnits(); };

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
  const [accounts, setAccounts] = useState<Account[]>([]);
  const fetch = useCallback(() => setAccounts(getAccounts()), []);
  useStoreEffect(fetch);
  const addAccount    = (d: Parameters<typeof createAccount>[0])               => { const a = createAccount(d);    fetch(); return a; };
  const editAccount   = (id: string, u: Parameters<typeof updateAccount>[1])   => { const a = updateAccount(id, u); fetch(); return a; };
  const removeAccount = (id: string)                                            => { deleteAccount(id);              fetch(); };
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
  const [departments, setDepartments] = useState<Department[]>([]);
  const fetch = useCallback(() => setDepartments(getDepartments()), []);
  useStoreEffect(fetch);
  const addDepartment    = (d: Parameters<typeof createDepartment>[0])                  => { const r = createDepartment(d);    fetch(); return r; };
  const editDepartment   = (id: string, u: Parameters<typeof updateDepartment>[1])      => { const r = updateDepartment(id, u); fetch(); return r; };
  const removeDepartment = (id: string)                                                  => { deleteDepartment(id);              fetch(); };
  return { departments, addDepartment, editDepartment, removeDepartment, refresh: fetch };
}

export function useDesignations() {
  const [designations, setDesignations] = useState<Designation[]>([]);
  const fetch = useCallback(() => setDesignations(getDesignations()), []);
  useStoreEffect(fetch);
  const addDesignation    = (d: Parameters<typeof createDesignation>[0])                => { const r = createDesignation(d);    fetch(); return r; };
  const editDesignation   = (id: string, u: Parameters<typeof updateDesignation>[1])    => { const r = updateDesignation(id, u); fetch(); return r; };
  const removeDesignation = (id: string)                                                 => { deleteDesignation(id);              fetch(); };
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
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const fetch = useCallback(() => setEntries(getJournalEntries()), []);
  useStoreEffect(fetch);
  const addEntry    = (d: Parameters<typeof createJournalEntry>[0])                => { const e = createJournalEntry(d);    fetch(); return e; };
  const editEntry   = (id: string, u: Parameters<typeof updateJournalEntry>[1])    => { const e = updateJournalEntry(id, u); fetch(); return e; };
  const removeEntry = (id: string)                                                  => { deleteJournalEntry(id);              fetch(); };
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
  const [cities, setCities] = useState<City[]>([]);
  const fetch = useCallback(() => setCities(getCities()), []);
  useStoreEffect(fetch);
  const add    = (d: Parameters<typeof createCity>[0])              => { const c = createCity(d);    fetch(); return c; };
  const edit   = (id: string, u: Parameters<typeof updateCity>[1]) => { const c = updateCity(id, u); fetch(); return c; };
  const remove = (id: string)                                        => { deleteCity(id);              fetch(); };
  return { cities, add, edit, remove, refresh: fetch };
}

export function useAreas() {
  const [areas, setAreas] = useState<Area[]>([]);
  const fetch = useCallback(() => setAreas(getAreas()), []);
  useStoreEffect(fetch);
  const add    = (d: Parameters<typeof createArea>[0])              => { const a = createArea(d);    fetch(); return a; };
  const edit   = (id: string, u: Parameters<typeof updateArea>[1]) => { const a = updateArea(id, u); fetch(); return a; };
  const remove = (id: string)                                        => { deleteArea(id);              fetch(); };
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
