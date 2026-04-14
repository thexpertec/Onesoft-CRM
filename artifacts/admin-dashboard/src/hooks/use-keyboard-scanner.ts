import { useEffect, useRef, useCallback } from "react";

/**
 * useKeyboardScanner
 *
 * Detects input from USB / Bluetooth barcode & QR-code scanners.
 * These devices behave like a keyboard that types all characters of a code
 * extremely fast (< 50 ms per key) then sends Enter.
 *
 * The hook distinguishes scanner input from normal human typing by measuring
 * the gap between consecutive key events.  If every character arrives within
 * MAX_GAP_MS and the total string is at least MIN_LENGTH chars, the whole
 * string is treated as a scan result.
 *
 * When `captureFromInputs` is false (default) the hook does NOT fire when
 * the user is focused inside a text <input>, <textarea>, or <select>, so it
 * won't interfere with normal typing.  Set it to true when you want scanning
 * to work even while a text field is focused (e.g. the POS search box).
 */

const MIN_LENGTH   = 3;   // minimum characters to be considered a scan
const MAX_GAP_MS   = 55;  // max ms between keystrokes to count as scanner
const FLUSH_MS     = 120; // auto-flush buffer after this long with no input

type Options = {
  onScan: (code: string) => void;
  enabled?: boolean;
  /** Allow capture even when an input/textarea/select is focused */
  captureFromInputs?: boolean;
};

export function useKeyboardScanner({ onScan, enabled = true, captureFromInputs = false }: Options) {
  const bufferRef    = useRef("");
  const lastKeyRef   = useRef(0);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScanRef    = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  const flush = useCallback((reason: "enter" | "tab" | "timeout") => {
    const code = bufferRef.current.trim();
    bufferRef.current = "";
    if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
    if (code.length >= MIN_LENGTH) {
      onScanRef.current(code);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if modifier keys held (Ctrl+C etc.)
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      // Skip if focused inside an editable element (unless captureFromInputs is set)
      if (!captureFromInputs) {
        const tag = (document.activeElement?.tagName ?? "").toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") return;
      }

      const now = Date.now();
      const gap = now - lastKeyRef.current;
      lastKeyRef.current = now;

      // Enter or Tab terminates the code
      if (e.key === "Enter" || e.key === "Tab") {
        if (bufferRef.current.length >= MIN_LENGTH) {
          e.preventDefault(); // prevent form submit / tab focus change
          flush("enter");
        }
        return;
      }

      // If gap is too large → user typed this manually, reset buffer
      if (gap > MAX_GAP_MS && bufferRef.current.length > 0) {
        bufferRef.current = "";
      }

      // Accumulate printable chars only
      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }

      // Schedule auto-flush
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = setTimeout(() => flush("timeout"), FLUSH_MS);
    };

    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      bufferRef.current = "";
    };
  }, [enabled, captureFromInputs, flush]);
}
