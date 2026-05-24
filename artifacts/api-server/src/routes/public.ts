import { Router } from "express";
import { query } from "../lib/db.js";

const router = Router();

/**
 * GET /api/public/doc/:id
 * Public — no auth required.
 * Searches every namespace in kv_store for a document with the given ID
 * stored under the "admin-req-docs" key.
 */
router.get("/doc/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing id" });

    const rows = await query<{ value: unknown }>(
      "SELECT value FROM kv_store WHERE key = $1",
      ["admin-req-docs"]
    );

    for (const row of rows) {
      const docs = Array.isArray(row.value) ? (row.value as Record<string, unknown>[]) : [];
      const doc = docs.find((d) => d.id === id);
      if (doc) return res.json({ doc });
    }

    return res.status(404).json({ doc: null });
  } catch (err) {
    console.error("Public doc fetch error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/public/repair/:id
 * Public — no auth required.
 * Returns sanitised repair booking data for customer-facing tracking.
 */
router.get("/repair/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing id" });

    const rows = await query<{ value: unknown }>(
      "SELECT value FROM kv_store WHERE key = $1",
      ["repair-bookings"]
    );

    for (const row of rows) {
      const bookings = Array.isArray(row.value)
        ? (row.value as Record<string, unknown>[])
        : [];
      const booking = bookings.find((b) => b.id === id);
      if (booking) {
        const safe = {
          id:            booking.id,
          name:          booking.name,
          service:       booking.service,
          deviceIssue:   booking.deviceIssue,
          status:        booking.status,
          priority:      booking.priority,
          estimatedDate: booking.estimatedDate,
          publicNote:    booking.publicNote,
          createdAt:     booking.createdAt,
          tenantId:      booking.tenantId,
        };
        return res.json({ booking: safe });
      }
    }

    return res.status(404).json({ booking: null });
  } catch (err) {
    console.error("Public repair fetch error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
