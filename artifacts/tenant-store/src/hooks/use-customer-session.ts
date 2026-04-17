import { useState, useEffect } from "react";

const SESSION_KEY = "cp_session";

interface CustomerSession {
  tenantId: string;
  customer: { id: string; name: string; email: string };
  loginAt: string;
}

function readSession(): CustomerSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as CustomerSession) : null;
  } catch {
    return null;
  }
}

export function useCustomerSession() {
  const [session, setSession] = useState<CustomerSession | null>(readSession);

  useEffect(() => {
    function sync() { setSession(readSession()); }
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  return { session, isLoggedIn: session !== null };
}
