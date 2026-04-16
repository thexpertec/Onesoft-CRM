import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useDocs } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Trash2, Lock } from "lucide-react";
import { DocStatus, RequirementDoc } from "@/lib/store";
import { format } from "date-fns";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { docs, editDoc, removeDoc } = useDocs();
  const { isAuthenticated, can } = useAuth();
  const { toast } = useToast();

  const [doc, setDoc] = useState<RequirementDoc | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<RequirementDoc>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (id) {
      const found = docs.find(d => d.id === id);
      if (found) {
        setDoc(found);
        setFormData(found);
      } else if (docs.length > 0) {
        setLocation("/documents");
        toast({ title: "Not found", description: "The requested document could not be found.", variant: "destructive" });
      }
    }
  }, [id, docs, setLocation, toast]);

  if (!doc) return <div className="p-8 text-center">Loading document...</div>;

  const handleSave = () => {
    if (!id) return;
    editDoc(id, formData);
    setIsEditing(false);
    toast({ title: "Saved successfully", description: "Document details have been updated." });
  };

  const handleDelete = () => {
    if (!id) return;
    removeDoc(id);
    toast({ title: "Document deleted", description: "The requirement document was removed." });
    setLocation("/documents");
  };

  const handleChange = (field: keyof RequirementDoc, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/documents">
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Back to documents</span>
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{doc.title}</h1>
          <p className="text-sm text-muted-foreground">
            Created on {format(new Date(doc.createdAt), "MMMM d, yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {can("Edit Documents") ? (
            isEditing ? (
              <>
                <Button variant="outline" onClick={() => { setIsEditing(false); setFormData(doc); }}>Cancel</Button>
                <Button onClick={handleSave} data-testid="btn-save-doc"><Save className="mr-2 h-4 w-4" /> Save</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setIsEditing(true)} data-testid="btn-edit-doc">Edit Document</Button>
                <Button variant="destructive" size="icon" onClick={() => setShowDeleteConfirm(true)} data-testid="btn-delete-doc">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )
          ) : (
            <Link href="/login">
              <Button variant="outline" size="sm" data-testid="btn-login-to-edit">
                <Lock className="mr-2 h-3.5 w-3.5" /> Login to Edit
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Project Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Document Title</label>
                  {isEditing ? (
                    <Input value={formData.title || ""} onChange={e => handleChange("title", e.target.value)} />
                  ) : (
                    <div className="font-medium text-lg">{doc.title}</div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Status</label>
                  {isEditing ? (
                    <Select value={formData.status} onValueChange={(val) => handleChange("status", val)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(["Draft", "Under Review", "Approved", "Archived"] as DocStatus[]).map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        doc.status === "Approved" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100" :
                        doc.status === "Archived" ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100" :
                        "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100"
                      }`}>
                        {doc.status}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Software Type</label>
                  {isEditing ? (
                    <Input value={formData.softwareType || ""} onChange={e => handleChange("softwareType", e.target.value)} />
                  ) : (
                    <div className="font-medium">{doc.softwareType || "—"}</div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Estimated Budget</label>
                  {isEditing ? (
                    <Input value={formData.budget || ""} onChange={e => handleChange("budget", e.target.value)} />
                  ) : (
                    <div className="font-medium">{doc.budget || "—"}</div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Target Start Date</label>
                  {isEditing ? (
                    <Input type="date" value={formData.startDate || ""} onChange={e => handleChange("startDate", e.target.value)} />
                  ) : (
                    <div className="font-medium">{doc.startDate ? format(new Date(doc.startDate), "MMM d, yyyy") : "Not set"}</div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Target Delivery Date</label>
                  {isEditing ? (
                    <Input type="date" value={formData.deliveryDate || ""} onChange={e => handleChange("deliveryDate", e.target.value)} />
                  ) : (
                    <div className="font-medium">{doc.deliveryDate ? format(new Date(doc.deliveryDate), "MMM d, yyyy") : "Not set"}</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Render raw sections if they exist */}
          {doc.sections && Object.keys(doc.sections).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Requirement Form Output</CardTitle>
                <CardDescription>Data captured from the client requirement form.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {Object.entries(doc.sections).map(([key, value]) => (
                  <div key={key} className="space-y-2">
                    <h3 className="font-semibold text-lg capitalize border-b pb-2">{key.replace(/([A-Z])/g, " $1").trim()}</h3>
                    {typeof value === "object" && value !== null ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                        {Object.entries(value).map(([k, v]) => (
                          <div key={k} className="bg-muted/50 p-3 rounded-md">
                            <span className="block text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
                              {k.replace(/([A-Z])/g, " $1").trim()}
                            </span>
                            <span className="text-sm">
                              {Array.isArray(v) ? v.join(", ") : String(v || "N/A")}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm">{String(value)}</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Client Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Client Name</label>
                {isEditing ? (
                  <Input value={formData.clientName || ""} onChange={e => handleChange("clientName", e.target.value)} />
                ) : (
                  <div className="font-medium">{doc.clientName}</div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Company</label>
                {isEditing ? (
                  <Input value={formData.company || ""} onChange={e => handleChange("company", e.target.value)} />
                ) : (
                  <div className="font-medium">{doc.company}</div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Email</label>
                {isEditing ? (
                  <Input type="email" value={formData.email || ""} onChange={e => handleChange("email", e.target.value)} />
                ) : (
                  <div className="font-medium">
                    <a href={`mailto:${doc.email}`} className="text-primary hover:underline">{doc.email}</a>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Phone</label>
                {isEditing ? (
                  <Input value={formData.phone || ""} onChange={e => handleChange("phone", e.target.value)} />
                ) : (
                  <div className="font-medium">
                    <a href={`tel:${doc.phone}`} className="text-primary hover:underline">{doc.phone}</a>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Industry</label>
                  {isEditing ? (
                    <Input value={formData.industry || ""} onChange={e => handleChange("industry", e.target.value)} />
                  ) : (
                    <div className="font-medium text-sm">{doc.industry}</div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">City</label>
                  {isEditing ? (
                    <Input value={formData.city || ""} onChange={e => handleChange("city", e.target.value)} />
                  ) : (
                    <div className="font-medium text-sm">{doc.city}</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this requirement document. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
