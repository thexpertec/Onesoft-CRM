import { useState, useEffect } from "react";

export const SESSION_KEY = "cp_session";

export interface SessionCustomer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  city?: string;
}

export interface StoredSession {
  tenantId: string;
  customer: SessionCustomer;
  loginAt: string;
}

function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

/** Call this to sign out from anywhere in the tenant store */
export function signOutPortal() {
  localStorage.removeItem(SESSION_KEY);
  // Fire a synthetic storage event so all components on this tab update immediately
  window.dispatchEvent(new StorageEvent("storage", { key: SESSION_KEY, newValue: null }));
}

export function useCustomerSession() {
  const [session, setSession] = useState<StoredSession | null>(readSession);

  useEffect(() => {
    function sync() { setSession(readSession()); }
    window.addEventListener("storage", sync); // another tab changed the session
    window.addEventListener("focus", sync);   // user returned to this tab
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  return { session, isLoggedIn: session !== null };
}
