import { Router } from "express";
import { query } from "../lib/db.js";

const router = Router();

// GET /api/kv/:namespace/:key  → { value: any }
router.get("/:namespace/:key", async (req, res) => {
  try {
    const { namespace, key } = req.params;
    const rows = await query(
      "SELECT value FROM kv_store WHERE namespace = $1 AND key = $2",
      [namespace, key]
    );
    if (rows.length === 0) {
      return res.json({ value: [] });
    }
    return res.json({ value: (rows[0] as { value: unknown }).value });
  } catch (err) {
    console.error("KV GET error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/kv/:namespace  → { [key]: value, ... }  (all keys in namespace)
router.get("/:namespace", async (req, res) => {
  try {
    const { namespace } = req.params;
    const rows = await query<{ key: string; value: unknown }>(
      "SELECT key, value FROM kv_store WHERE namespace = $1",
      [namespace]
    );
    const result: Record<string, unknown> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return res.json(result);
  } catch (err) {
    console.error("KV GET namespace error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/kv/:namespace/:key  body: { value: any }
router.put("/:namespace/:key", async (req, res) => {
  try {
    const { namespace, key } = req.params;
    const { value } = req.body;
    await query(
      `INSERT INTO kv_store (namespace, key, value, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (namespace, key)
       DO UPDATE SET value = $3::jsonb, updated_at = NOW()`,
      [namespace, key, JSON.stringify(value)]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("KV PUT error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/kv/:namespace/:key
router.delete("/:namespace/:key", async (req, res) => {
  try {
    const { namespace, key } = req.params;
    await query(
      "DELETE FROM kv_store WHERE namespace = $1 AND key = $2",
      [namespace, key]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("KV DELETE error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/kv/:namespace  (wipe entire namespace — used on tenant delete)
router.delete("/:namespace", async (req, res) => {
  try {
    const { namespace } = req.params;
    await query("DELETE FROM kv_store WHERE namespace = $1", [namespace]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("KV DELETE namespace error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
