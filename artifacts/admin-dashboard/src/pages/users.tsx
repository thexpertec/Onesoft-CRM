import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import {
  Shield, UserPlus, KeyRound, Trash2, Pencil, ShieldCheck, ShieldAlert, Eye, EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import {
  AdminUser, UserRole,
  getAdminUsers, createAdminUser, updateAdminUser, deleteAdminUser,
} from "@/lib/store";

// ─── Schemas ──────────────────────────────────────────────────────────────────
const addUserSchema = z.object({
  username:    z.string().min(3, "Username must be at least 3 characters"),
  fullName:    z.string().min(2, "Full name is required"),
  email:       z.union([z.string().email("Invalid email"), z.literal("")]),
  role:        z.enum(["superadmin", "admin"]),
  password:    z.string().min(6, "Password must be at least 6 characters"),
  confirmPass: z.string(),
}).refine(d => d.password === d.confirmPass, { message: "Passwords do not match", path: ["confirmPass"] });

const editUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  fullName: z.string().min(2, "Full name is required"),
  email:    z.union([z.string().email("Invalid email"), z.literal("")]),
  role:     z.enum(["superadmin", "admin"]),
});

const resetPassSchema = z.object({
  newPassword:  z.string().min(6, "Password must be at least 6 characters"),
  confirmPass:  z.string(),
}).refine(d => d.newPassword === d.confirmPass, { message: "Passwords do not match", path: ["confirmPass"] });

type AddUserValues   = z.infer<typeof addUserSchema>;
type EditUserValues  = z.infer<typeof editUserSchema>;
type ResetPassValues = z.infer<typeof resetPassSchema>;

// ─── PasswordInput ────────────────────────────────────────────────────────────
function PasswordInput({ field }: { field: React.InputHTMLAttributes<HTMLInputElement> }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? "text" : "password"} {...field} className="pr-10" />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

// ─── Role badge ───────────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: UserRole }) {
  return role === "superadmin" ? (
    <Badge className="bg-purple-600 hover:bg-purple-700 text-white gap-1">
      <ShieldCheck size={11} /> Super Admin
    </Badge>
  ) : (
    <Badge variant="secondary" className="gap-1">
      <ShieldAlert size={11} /> Admin
    </Badge>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const [, navigate] = useLocation();
  const { isSuperAdmin, currentUser, refreshCurrentUser } = useAuth();
  const { toast } = useToast();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [addOpen,   setAddOpen]   = useState(false);
  const [editUser,  setEditUser]  = useState<AdminUser | null>(null);
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);
  const [deleteId,  setDeleteId]  = useState<string | null>(null);

  const reload = () => setUsers(getAdminUsers());
  useEffect(() => { reload(); }, []);

  // Guard: only superadmin may access this page
  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <Shield className="w-14 h-14 text-muted-foreground/30" />
        <h2 className="text-xl font-semibold">Access Restricted</h2>
        <p className="text-muted-foreground text-sm max-w-xs">
          Only Super Admins can manage users. Please log in with a Super Admin account.
        </p>
        <Button onClick={() => navigate("/")} variant="outline">Go to Dashboard</Button>
      </div>
    );
  }

  // ── Add User ────────────────────────────────────────────────────────────────
  const addForm = useForm<AddUserValues>({
    resolver: zodResolver(addUserSchema),
    defaultValues: { username: "", fullName: "", email: "", role: "admin", password: "", confirmPass: "" },
  });

  const handleAdd = (data: AddUserValues) => {
    const existing = getAdminUsers();
    if (existing.some(u => u.username.toLowerCase() === data.username.toLowerCase())) {
      addForm.setError("username", { message: "Username already taken" });
      return;
    }
    createAdminUser({ username: data.username, fullName: data.fullName, email: data.email, role: data.role, password: data.password });
    toast({ title: "User created", description: `${data.fullName} (@${data.username}) has been added.` });
    addForm.reset();
    setAddOpen(false);
    reload();
  };

  // ── Edit User ───────────────────────────────────────────────────────────────
  const editForm = useForm<EditUserValues>({ resolver: zodResolver(editUserSchema) });

  useEffect(() => {
    if (editUser) {
      editForm.reset({ username: editUser.username, fullName: editUser.fullName, email: editUser.email, role: editUser.role });
    }
  }, [editUser]);

  const handleEdit = (data: EditUserValues) => {
    if (!editUser) return;
    const existing = getAdminUsers();
    if (existing.some(u => u.id !== editUser.id && u.username.toLowerCase() === data.username.toLowerCase())) {
      editForm.setError("username", { message: "Username already taken" });
      return;
    }
    updateAdminUser(editUser.id, { username: data.username, fullName: data.fullName, email: data.email, role: data.role });
    if (editUser.id === currentUser?.id) refreshCurrentUser();
    toast({ title: "User updated", description: `${data.fullName}'s details have been saved.` });
    setEditUser(null);
    reload();
  };

  // ── Reset Password ──────────────────────────────────────────────────────────
  const resetForm = useForm<ResetPassValues>({
    resolver: zodResolver(resetPassSchema),
    defaultValues: { newPassword: "", confirmPass: "" },
  });

  useEffect(() => {
    if (!resetUser) resetForm.reset({ newPassword: "", confirmPass: "" });
  }, [resetUser]);

  const handleReset = (data: ResetPassValues) => {
    if (!resetUser) return;
    updateAdminUser(resetUser.id, { password: data.newPassword });
    toast({ title: "Password reset", description: `Password for @${resetUser.username} has been updated.` });
    setResetUser(null);
  };

  // ── Delete ───────────────────────────────────────────────────────────────────
  const handleDelete = () => {
    if (!deleteId) return;
    deleteAdminUser(deleteId);
    toast({ title: "User removed", description: "The user account has been deleted." });
    setDeleteId(null);
    reload();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage admin accounts and their permissions.</p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-2 w-full sm:w-auto">
          <UserPlus size={16} /> Add User
        </Button>
      </div>

      {/* Users table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="text-left font-semibold text-muted-foreground px-4 py-3">User</th>
              <th className="text-left font-semibold text-muted-foreground px-4 py-3 hidden sm:table-cell">Email</th>
              <th className="text-left font-semibold text-muted-foreground px-4 py-3">Role</th>
              <th className="text-left font-semibold text-muted-foreground px-4 py-3 hidden md:table-cell">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => {
              const isMe = u.id === currentUser?.id;
              return (
                <tr key={u.id} className={`border-b border-border last:border-0 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm flex-shrink-0">
                        {u.fullName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium flex items-center gap-1.5">
                          {u.fullName}
                          {isMe && <span className="text-[10px] font-semibold bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded-full">You</span>}
                        </div>
                        <div className="text-xs text-muted-foreground">@{u.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                    {u.email || <span className="text-muted-foreground/40 italic">—</span>}
                  </td>
                  <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell text-xs">
                    {format(new Date(u.createdAt), "MMM d, yyyy")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit user" onClick={() => setEditUser(u)}>
                        <Pencil size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Reset password" onClick={() => setResetUser(u)}>
                        <KeyRound size={14} />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                        title={isMe ? "Cannot delete your own account" : "Delete user"}
                        disabled={isMe}
                        onClick={() => setDeleteId(u.id)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground text-sm">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Add User Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={v => { setAddOpen(v); if (!v) addForm.reset(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus size={18} /> Add New User</DialogTitle>
            <DialogDescription>Create a new admin account. All fields marked with * are required.</DialogDescription>
          </DialogHeader>
          <Form {...addForm}>
            <form onSubmit={addForm.handleSubmit(handleAdd)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={addForm.control} name="username" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username *</FormLabel>
                    <FormControl><Input placeholder="e.g. john.doe" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={addForm.control} name="fullName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name *</FormLabel>
                    <FormControl><Input placeholder="John Doe" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={addForm.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input type="email" placeholder="john@onesoft.com" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={addForm.control} name="role" render={({ field }) => (
                <FormItem>
                  <FormLabel>Role *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="admin">Admin — can manage leads &amp; documents</SelectItem>
                      <SelectItem value="superadmin">Super Admin — full access + user management</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={addForm.control} name="password" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password *</FormLabel>
                    <FormControl><PasswordInput field={field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={addForm.control} name="confirmPass" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password *</FormLabel>
                    <FormControl><PasswordInput field={field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => { setAddOpen(false); addForm.reset(); }}>Cancel</Button>
                <Button type="submit">Create User</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Edit User Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={!!editUser} onOpenChange={v => { if (!v) setEditUser(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil size={18} /> Edit User</DialogTitle>
            <DialogDescription>Update account details and role permissions.</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEdit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={editForm.control} name="username" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username *</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="fullName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name *</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={editForm.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input type="email" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="role" render={({ field }) => (
                <FormItem>
                  <FormLabel>Role *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="superadmin">Super Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
                <Button type="submit">Save Changes</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Reset Password Dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!resetUser} onOpenChange={v => { if (!v) setResetUser(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound size={18} /> Reset Password</DialogTitle>
            <DialogDescription>
              Set a new password for <strong>@{resetUser?.username}</strong>.
            </DialogDescription>
          </DialogHeader>
          <Form {...resetForm}>
            <form onSubmit={resetForm.handleSubmit(handleReset)} className="space-y-4">
              <FormField control={resetForm.control} name="newPassword" render={({ field }) => (
                <FormItem>
                  <FormLabel>New Password</FormLabel>
                  <FormControl><PasswordInput field={field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={resetForm.control} name="confirmPass" render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm Password</FormLabel>
                  <FormControl><PasswordInput field={field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setResetUser(null)}>Cancel</Button>
                <Button type="submit" className="gap-2"><KeyRound size={14} /> Reset Password</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ──────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this user?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The user will lose access immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
