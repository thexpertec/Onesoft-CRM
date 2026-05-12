import { useState, useEffect, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldAlert, Eye, EyeOff } from "lucide-react";
import { AdminUser } from "@/lib/store";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUser: AdminUser | null;
  onConfirm: () => void;
  actionLabel?: string;
}

export function ConfirmPasswordDialog({ open, onOpenChange, currentUser, onConfirm, actionLabel = "Proceed" }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [show, setShow]         = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPassword("");
      setError("");
      setShow(false);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser) return;
    if (password === currentUser.password) {
      onOpenChange(false);
      onConfirm();
    } else {
      setError("Incorrect password. Please try again.");
      setPassword("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldAlert size={16} className="text-amber-500" />
            Admin Verification Required
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            Re-enter your admin password to{" "}
            <span className="font-medium text-foreground">{actionLabel}</span>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label className="text-[12px] text-muted-foreground">Username</Label>
            <div className="h-9 px-3 flex items-center rounded-md border border-input bg-muted/50 text-[13px] text-muted-foreground font-mono select-none">
              {currentUser?.username ?? "—"}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="admin-pw-gate" className="text-[12px]">Password</Label>
            <div className="relative">
              <Input
                id="admin-pw-gate"
                ref={inputRef}
                type={show ? "text" : "password"}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(""); }}
                placeholder="Enter your password"
                className={`h-9 text-[13px] pr-9 ${error ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                autoComplete="current-password"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShow(s => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {show ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {error && (
              <p className="text-[12px] text-red-500">{error}</p>
            )}
          </div>

          <DialogFooter className="gap-2 pt-1">
            <Button type="button" variant="outline" className="h-9 text-[13px]" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!password}
              className="h-9 text-[13px] bg-blue-600 hover:bg-blue-700 text-white"
            >
              Confirm
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
