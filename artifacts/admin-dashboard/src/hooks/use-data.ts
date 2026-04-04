import { useState, useEffect, useCallback } from "react";
import {
  getLeads, getDocs, createLead, updateLead, deleteLead, createDoc, updateDoc, deleteDoc,
  getCustomers, createCustomer, updateCustomer, deleteCustomer,
  getProductCategories, createProductCategory, updateProductCategory, deleteProductCategory,
  getSuppliers, createSupplier, updateSupplier, deleteSupplier,
  getProducts, createProduct, updateProduct, deleteProduct,
  getBrands, createBrand, updateBrand, deleteBrand,
  getAttributes, createAttribute, updateAttribute, deleteAttribute,
  getUnits, createUnit, updateUnit, deleteUnit,
  getPurchaseOrders, createPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder,
  getStaff, createStaff, updateStaff, deleteStaff,
  getStaffRoles, createStaffRole, updateStaffRole, deleteStaffRole,
  getStock, createStockItem, updateStockItem, deleteStockItem,
  getSales, createSale, updateSale, deleteSale,
  Lead, RequirementDoc, Customer, ProductCategory, Supplier,
  Product, Brand, Attribute, Unit, PurchaseOrder, Staff, StaffRole, StockItem, Sale,
} from "@/lib/store";

export function useLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);

  const fetchLeads = useCallback(() => {
    setLeads(getLeads());
  }, []);

  useEffect(() => {
    fetchLeads();
    window.addEventListener("storage", fetchLeads);
    return () => window.removeEventListener("storage", fetchLeads);
  }, [fetchLeads]);

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

  useEffect(() => {
    fetchDocs();
    window.addEventListener("storage", fetchDocs);
    return () => window.removeEventListener("storage", fetchDocs);
  }, [fetchDocs]);

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

  useEffect(() => {
    fetchCustomers();
    window.addEventListener("storage", fetchCustomers);
    return () => window.removeEventListener("storage", fetchCustomers);
  }, [fetchCustomers]);

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

  useEffect(() => {
    fetchCategories();
    window.addEventListener("storage", fetchCategories);
    return () => window.removeEventListener("storage", fetchCategories);
  }, [fetchCategories]);

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

  useEffect(() => {
    fetchProducts();
    window.addEventListener("storage", fetchProducts);
    return () => window.removeEventListener("storage", fetchProducts);
  }, [fetchProducts]);

  const addProduct = (data: Parameters<typeof createProduct>[0]) => { const p = createProduct(data); fetchProducts(); return p; };
  const editProduct = (id: string, updates: Parameters<typeof updateProduct>[1]) => { const p = updateProduct(id, updates); fetchProducts(); return p; };
  const removeProduct = (id: string) => { deleteProduct(id); fetchProducts(); };

  return { products, addProduct, editProduct, removeProduct, refresh: fetchProducts };
}

export function useBrands() {
  const [brands, setBrands] = useState<Brand[]>([]);

  const fetchBrands = useCallback(() => { setBrands(getBrands()); }, []);

  useEffect(() => {
    fetchBrands();
    window.addEventListener("storage", fetchBrands);
    return () => window.removeEventListener("storage", fetchBrands);
  }, [fetchBrands]);

  const addBrand = (data: Parameters<typeof createBrand>[0]) => { const b = createBrand(data); fetchBrands(); return b; };
  const editBrand = (id: string, updates: Parameters<typeof updateBrand>[1]) => { const b = updateBrand(id, updates); fetchBrands(); return b; };
  const removeBrand = (id: string) => { deleteBrand(id); fetchBrands(); };

  return { brands, addBrand, editBrand, removeBrand, refresh: fetchBrands };
}

export function useAttributes() {
  const [attributes, setAttributes] = useState<Attribute[]>([]);

  const fetchAttributes = useCallback(() => { setAttributes(getAttributes()); }, []);

  useEffect(() => {
    fetchAttributes();
    window.addEventListener("storage", fetchAttributes);
    return () => window.removeEventListener("storage", fetchAttributes);
  }, [fetchAttributes]);

  const addAttribute = (data: Parameters<typeof createAttribute>[0]) => { const a = createAttribute(data); fetchAttributes(); return a; };
  const editAttribute = (id: string, updates: Parameters<typeof updateAttribute>[1]) => { const a = updateAttribute(id, updates); fetchAttributes(); return a; };
  const removeAttribute = (id: string) => { deleteAttribute(id); fetchAttributes(); };

  return { attributes, addAttribute, editAttribute, removeAttribute, refresh: fetchAttributes };
}

export function useUnits() {
  const [units, setUnits] = useState<Unit[]>([]);

  const fetchUnits = useCallback(() => { setUnits(getUnits()); }, []);

  useEffect(() => {
    fetchUnits();
    window.addEventListener("storage", fetchUnits);
    return () => window.removeEventListener("storage", fetchUnits);
  }, [fetchUnits]);

  const addUnit = (data: Parameters<typeof createUnit>[0]) => { const u = createUnit(data); fetchUnits(); return u; };
  const editUnit = (id: string, updates: Parameters<typeof updateUnit>[1]) => { const u = updateUnit(id, updates); fetchUnits(); return u; };
  const removeUnit = (id: string) => { deleteUnit(id); fetchUnits(); };

  return { units, addUnit, editUnit, removeUnit, refresh: fetchUnits };
}

export function useSuppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const fetchSuppliers = useCallback(() => {
    setSuppliers(getSuppliers());
  }, []);

  useEffect(() => {
    fetchSuppliers();
    window.addEventListener("storage", fetchSuppliers);
    return () => window.removeEventListener("storage", fetchSuppliers);
  }, [fetchSuppliers]);

  const addSupplier = (data: Parameters<typeof createSupplier>[0]) => {
    const s = createSupplier(data);
    fetchSuppliers();
    return s;
  };

  const editSupplier = (id: string, updates: Parameters<typeof updateSupplier>[1]) => {
    const s = updateSupplier(id, updates);
    fetchSuppliers();
    return s;
  };

  const removeSupplier = (id: string) => {
    deleteSupplier(id);
    fetchSuppliers();
  };

  return { suppliers, addSupplier, editSupplier, removeSupplier, refresh: fetchSuppliers };
}

export function usePurchaseOrders() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);

  const fetchOrders = useCallback(() => {
    setPurchaseOrders(getPurchaseOrders());
  }, []);

  useEffect(() => {
    fetchOrders();
    window.addEventListener("storage", fetchOrders);
    return () => window.removeEventListener("storage", fetchOrders);
  }, [fetchOrders]);

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

export function useSales() {
  const [sales, setSales] = useState<Sale[]>([]);
  const fetch = useCallback(() => setSales(getSales()), []);
  useEffect(() => { fetch(); window.addEventListener("storage", fetch); return () => window.removeEventListener("storage", fetch); }, [fetch]);
  const addSale    = (d: Parameters<typeof createSale>[0])               => { const s = createSale(d);    fetch(); return s; };
  const editSale   = (id: string, u: Parameters<typeof updateSale>[1])   => { const s = updateSale(id, u); fetch(); return s; };
  const removeSale = (id: string)                                         => { deleteSale(id);              fetch(); };
  return { sales, addSale, editSale, removeSale, refresh: fetch };
}

export function useStock() {
  const [stock, setStock] = useState<StockItem[]>([]);
  const fetch = useCallback(() => setStock(getStock()), []);
  useEffect(() => { fetch(); window.addEventListener("storage", fetch); return () => window.removeEventListener("storage", fetch); }, [fetch]);
  const addItem    = (d: Parameters<typeof createStockItem>[0])                   => { const s = createStockItem(d);    fetch(); return s; };
  const editItem   = (id: string, u: Parameters<typeof updateStockItem>[1])       => { const s = updateStockItem(id, u); fetch(); return s; };
  const removeItem = (id: string)                                                  => { deleteStockItem(id);              fetch(); };
  return { stock, addItem, editItem, removeItem, refresh: fetch };
}

export function useStaff() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const fetch = useCallback(() => setStaff(getStaff()), []);
  useEffect(() => { fetch(); window.addEventListener("storage", fetch); return () => window.removeEventListener("storage", fetch); }, [fetch]);
  const addStaff    = (d: Parameters<typeof createStaff>[0])                 => { const s = createStaff(d);    fetch(); return s; };
  const editStaff   = (id: string, u: Parameters<typeof updateStaff>[1])     => { const s = updateStaff(id, u); fetch(); return s; };
  const removeStaff = (id: string)                                            => { deleteStaff(id);              fetch(); };
  return { staff, addStaff, editStaff, removeStaff, refresh: fetch };
}

export function useStaffRoles() {
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const fetch = useCallback(() => setRoles(getStaffRoles()), []);
  useEffect(() => { fetch(); window.addEventListener("storage", fetch); return () => window.removeEventListener("storage", fetch); }, [fetch]);
  const addRole    = (d: Parameters<typeof createStaffRole>[0])                   => { const r = createStaffRole(d);    fetch(); return r; };
  const editRole   = (id: string, u: Parameters<typeof updateStaffRole>[1])       => { const r = updateStaffRole(id, u); fetch(); return r; };
  const removeRole = (id: string)                                                  => { deleteStaffRole(id);              fetch(); };
  return { roles, addRole, editRole, removeRole, refresh: fetch };
}
