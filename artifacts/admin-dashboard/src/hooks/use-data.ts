import { useState, useEffect, useCallback } from "react";
import {
  getLeads, getDocs, createLead, updateLead, deleteLead, createDoc, updateDoc, deleteDoc,
  getCustomers, createCustomer, updateCustomer, deleteCustomer,
  getProductCategories, createProductCategory, updateProductCategory, deleteProductCategory,
  Lead, RequirementDoc, Customer, ProductCategory,
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
