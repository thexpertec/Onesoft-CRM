import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { X, Zap, ScanLine } from "lucide-react";

interface BarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
  title?: string;
  hint?: string;
}

const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
];

const SCANNER_ID = "onesoft-barcode-scanner";

export default function BarcodeScanner({
  open, onClose, onScan,
  title = "Scan Barcode / QR Code",
  hint = "Point the camera at a barcode or QR code",
}: BarcodeScannerProps) {
  const scannerRef    = useRef<Html5Qrcode | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [scanning, setScanning]   = useState(false);
  const [lastCode, setLastCode]   = useState<string | null>(null);
  const [torchOn, setTorchOn]     = useState(false);
  const [torchAvail, setTorchAvail] = useState(false);
  const cooldownRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    let scanner: Html5Qrcode | null = null;

    const start = async () => {
      try {
        scanner = new Html5Qrcode(SCANNER_ID, {
          formatsToSupport: SUPPORTED_FORMATS,
          verbose: false,
        });
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 240, height: 180 },
            aspectRatio: 1.5,
          },
          (decodedText) => {
            if (cooldownRef.current) return;
            cooldownRef.current = true;
            setLastCode(decodedText);
            onScan(decodedText);
            setTimeout(() => { cooldownRef.current = false; }, 1800);
          },
          () => {}
        );
        setScanning(true);
        setError(null);

        const caps = scanner.getRunningTrackCapabilities?.() as Record<string, unknown> | undefined;
        if (caps && "torch" in caps) setTorchAvail(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.toLowerCase().includes("permission")) {
          setError("Camera permission denied. Please allow camera access and try again.");
        } else if (msg.toLowerCase().includes("notfound") || msg.toLowerCase().includes("no camera")) {
          setError("No camera found on this device.");
        } else {
          setError("Unable to start camera: " + msg);
        }
      }
    };

    start();

    return () => {
      if (scanner?.isScanning) {
        scanner.stop().catch(() => {});
      }
      scannerRef.current = null;
      setScanning(false);
      setLastCode(null);
      setTorchOn(false);
      setTorchAvail(false);
      setError(null);
    };
  }, [open]);

  const toggleTorch = async () => {
    if (!scannerRef.current) return;
    try {
      const next = !torchOn;
      await scannerRef.current.applyVideoConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {}
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-[min(96vw,420px)] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-950/50 flex items-center justify-center">
              <ScanLine size={14} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-[13px] font-bold text-gray-900 dark:text-gray-100">{title}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{hint}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
          >
            <X size={13} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Camera viewport */}
        <div className="relative bg-black">
          <div
            id={SCANNER_ID}
            className="w-full"
            style={{ minHeight: 260 }}
          />

          {/* Scanning overlay corners */}
          {scanning && !error && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="relative w-[240px] h-[180px]">
                <span className="absolute top-0 left-0 w-6 h-6 border-t-3 border-l-3 border-blue-400 rounded-tl-lg" style={{ borderTopWidth: 3, borderLeftWidth: 3 }} />
                <span className="absolute top-0 right-0 w-6 h-6 border-t-3 border-r-3 border-blue-400 rounded-tr-lg" style={{ borderTopWidth: 3, borderRightWidth: 3 }} />
                <span className="absolute bottom-0 left-0 w-6 h-6 border-b-3 border-l-3 border-blue-400 rounded-bl-lg" style={{ borderBottomWidth: 3, borderLeftWidth: 3 }} />
                <span className="absolute bottom-0 right-0 w-6 h-6 border-b-3 border-r-3 border-blue-400 rounded-br-lg" style={{ borderBottomWidth: 3, borderRightWidth: 3 }} />
                {/* Scan line animation */}
                <div className="absolute inset-x-0 top-0 h-0.5 bg-blue-400/80 animate-[scanline_2s_ease-in-out_infinite]" />
              </div>
            </div>
          )}

          {/* Torch button */}
          {torchAvail && scanning && (
            <button
              onClick={toggleTorch}
              className={`absolute bottom-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-colors shadow-lg ${
                torchOn
                  ? "bg-yellow-400 text-yellow-900"
                  : "bg-black/60 text-white hover:bg-black/80"
              }`}
              title="Toggle flashlight"
            >
              <Zap size={16} />
            </button>
          )}
        </div>

        {/* Status bar */}
        <div className="px-5 py-3 bg-gray-50 dark:bg-zinc-950">
          {error ? (
            <div className="flex items-start gap-2 text-[12px] text-red-600 dark:text-red-400">
              <span className="mt-0.5">⚠</span>
              <span>{error}</span>
            </div>
          ) : lastCode ? (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
              <span className="text-[12px] text-emerald-700 dark:text-emerald-400 font-semibold truncate">Scanned: {lastCode}</span>
            </div>
          ) : scanning ? (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 animate-pulse" />
              <span className="text-[12px] text-muted-foreground">Scanning… hold still near a barcode or QR code</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
              <span className="text-[12px] text-muted-foreground">Starting camera…</span>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes scanline {
          0%   { transform: translateY(0); opacity: 1; }
          50%  { transform: translateY(176px); opacity: 0.6; }
          100% { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
