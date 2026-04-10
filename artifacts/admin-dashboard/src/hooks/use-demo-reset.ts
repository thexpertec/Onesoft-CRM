import { useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/auth-context";
import { getTenants, updateTenant } from "@/lib/store";
import { seedDataIntoTenant } from "@/lib/demo-seed";
import { useToast } from "./use-toast";

/**
 * Runs in the background while the app is open.
 * If the active tenant is a demo tenant with an auto-reset interval set,
 * this hook automatically re-seeds it back to its original state once
 * the interval has elapsed — wiping any visitor changes.
 */
export function useDemoReset() {
  const { currentTenantId } = useAuth();
  const { toast }           = useToast();
  const tenantIdRef         = useRef(currentTenantId);

  useEffect(() => { tenantIdRef.current = currentTenantId; }, [currentTenantId]);

  const checkAndReset = useCallback(() => {
    const tid = tenantIdRef.current;
    if (!tid) return;

    const tenant = getTenants().find(t => t.id === tid);
    if (!tenant?.isDemo || !tenant.demoResetInterval) return;

    const lastMs     = tenant.demoLastReset ? new Date(tenant.demoLastReset).getTime() : 0;
    const intervalMs = tenant.demoResetInterval * 60_000;
    if (Date.now() - lastMs < intervalMs) return;

    try {
      seedDataIntoTenant(tid, tenant.name);
      updateTenant(tid, { demoLastReset: new Date().toISOString() });
      toast({
        title:       "Demo data reset",
        description: `${tenant.name} has been restored to its original demo state.`,
      });
    } catch {
      // silently swallow — non-critical background job
    }
  }, [toast]);

  useEffect(() => {
    checkAndReset();                              // check immediately on mount / tenant switch
    const id = setInterval(checkAndReset, 60_000); // then every 60 s
    return () => clearInterval(id);
  }, [checkAndReset, currentTenantId]);           // restart timer when tenant changes
}
