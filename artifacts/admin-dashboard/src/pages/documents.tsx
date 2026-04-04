import { useState, useMemo } from "react";
import { useDocs } from "@/hooks/use-data";
import { useAuth } from "@/contexts/auth-context";
import { RequirementDoc, DocStatus } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Search, MoreHorizontal, Trash2, Eye, FileText, Save, Edit, Lock, X, Share2, Check } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { Link } from "wouter";

const DOC_STATUSES: DocStatus[] = ["Draft", "Under Review", "Approved", "Archived"];

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  Draft: "secondary",
  "Under Review": "default",
  Approved: "default",
  Archived: "outline",
};

function statusBadgeClass(status: string) {
  return status === "Approved" ? "bg-green-600 hover:bg-green-700 text-white" : "";
}

export default function Documents() {
  const { docs, removeDoc, editDoc } = useDocs();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [docToDelete, setDocToDelete] = useState<string | null>(null);

  const [selectedDoc, setSelectedDoc] = useState<RequirementDoc | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<RequirementDoc>>({});

  const filteredDocs = useMemo(() => {
    return docs.filter((doc) => {
      const searchContent = (doc.title + doc.clientName + doc.company + doc.industry).toLowerCase();
      const matchesSearch = searchContent.includes(search.toLowerCase());
      const matchesStatus = statusFilter === "All" || doc.status === statusFilter;
      return matchesSearch && matchesStatus;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [docs, search, statusFilter]);

  const openDoc = (doc: RequirementDoc) => {
    setSelectedDoc(doc);
    setFormData(doc);
    setIsEditing(false);
  };

  const closeSheet = () => {
    setSelectedDoc(null);
    setIsEditing(false);
  };

  const handleChange = (field: keyof RequirementDoc, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    if (!selectedDoc) return;
    editDoc(selectedDoc.id, formData);
    const updated = { ...selectedDoc, ...formData } as RequirementDoc;
    setSelectedDoc(updated);
    setIsEditing(false);
    toast({ title: "Saved successfully", description: "Document details have been updated." });
  };

  const handleDelete = () => {
    if (!docToDelete) return;
    removeDoc(docToDelete);
    if (selectedDoc?.id === docToDelete) closeSheet();
    setDocToDelete(null);
    toast({ title: "Document deleted", description: "The document has been removed." });
  };

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyShareLink = (docId: string) => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const url = `${window.location.origin}${base}/share/${docId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(docId);
      toast({ title: "Link copied!", description: "The public share link has been copied to your clipboard." });
      setTimeout(() => setCopiedId(null), 2500);
    });
  };

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="text-sm font-medium">{children}</div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Requirement Documents</h1>
          <p className="text-muted-foreground mt-1">Manage client project requirements and scoping.</p>
        </div>
        {isAuthenticated && (
          <Button asChild data-testid="btn-create-doc">
            <Link href="/documents/new">
              <FileText className="mr-2 h-4 w-4" /> New Document
            </Link>
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex items-start gap-3 text-sm text-foreground">
        <FileText className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
        <span>
          {isAuthenticated ? (
            <>Click <strong>New Document</strong> to open the full requirement collection form and save it directly to this list.</>
          ) : (
            <>Login as admin to create and manage requirement documents.</>
          )}
        </span>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-docs"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-filter-doc-status">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Statuses</SelectItem>
            {DOC_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date Created</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDocs.length > 0 ? (
              filteredDocs.map((doc) => (
                <TableRow
                  key={doc.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => openDoc(doc)}
                  data-testid={`row-doc-${doc.id}`}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center">
                      <FileText className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                      {doc.title}
                    </div>
                  </TableCell>
                  <TableCell>
                    {doc.clientName}
                    <span className="text-muted-foreground text-xs block">{doc.company}</span>
                  </TableCell>
                  <TableCell>{doc.softwareType}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {isAuthenticated ? (
                      <Select value={doc.status} onValueChange={(val: DocStatus) => {
                        editDoc(doc.id, { status: val });
                        if (selectedDoc?.id === doc.id) setSelectedDoc(prev => prev ? { ...prev, status: val } : prev);
                        toast({ title: "Status updated", description: `Status changed to ${val}.` });
                      }}>
                        <SelectTrigger className="h-8 w-[140px] bg-transparent border-0 shadow-none focus:ring-0 p-0">
                          <Badge variant={statusColors[doc.status] || "default"} className={`whitespace-nowrap ${statusBadgeClass(doc.status)}`}>
                            {doc.status}
                          </Badge>
                        </SelectTrigger>
                        <SelectContent>
                          {DOC_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={statusColors[doc.status] || "default"} className={`whitespace-nowrap ${statusBadgeClass(doc.status)}`}>
                        {doc.status}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(doc.createdAt), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openDoc(doc)}>
                          <Eye className="mr-2 h-4 w-4" /> View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyShareLink(doc.id)}>
                          {copiedId === doc.id ? (
                            <Check className="mr-2 h-4 w-4 text-green-600" />
                          ) : (
                            <Share2 className="mr-2 h-4 w-4" />
                          )}
                          {copiedId === doc.id ? "Link Copied!" : "Copy Share Link"}
                        </DropdownMenuItem>
                        {isAuthenticated && (
                          <DropdownMenuItem
                            onClick={() => setDocToDelete(doc.id)}
                            className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No documents found.{" "}
                  {search || statusFilter !== "All" ? "Try adjusting your filters." : "Create your first one!"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Document Detail / Edit Sheet */}
      <Sheet open={!!selectedDoc} onOpenChange={(open) => { if (!open) closeSheet(); }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          {selectedDoc && (
            <>
              {/* Sheet Header */}
              <div className="flex items-start justify-between gap-4 px-6 py-5 border-b sticky top-0 bg-background z-10">
                <div className="min-w-0">
                  <SheetTitle className="text-xl font-bold leading-tight truncate">{selectedDoc.title}</SheetTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Created on {format(new Date(selectedDoc.createdAt), "MMMM d, yyyy")}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Share link — always available */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyShareLink(selectedDoc.id)}
                    data-testid="btn-share-doc"
                  >
                    {copiedId === selectedDoc.id ? (
                      <><Check className="mr-1.5 h-3.5 w-3.5 text-green-600" /> Copied!</>
                    ) : (
                      <><Share2 className="mr-1.5 h-3.5 w-3.5" /> Share</>
                    )}
                  </Button>

                  {isAuthenticated ? (
                    isEditing ? (
                      <>
                        <Button variant="outline" size="sm" onClick={() => { setIsEditing(false); setFormData(selectedDoc); }}>
                          <X className="mr-1.5 h-3.5 w-3.5" /> Cancel
                        </Button>
                        <Button size="sm" onClick={handleSave} data-testid="btn-save-doc">
                          <Save className="mr-1.5 h-3.5 w-3.5" /> Save
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} data-testid="btn-edit-doc">
                          <Edit className="mr-1.5 h-3.5 w-3.5" /> Edit Document
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setDocToDelete(selectedDoc.id)}
                          data-testid="btn-delete-doc"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )
                  ) : (
                    <Link href="/login">
                      <Button variant="outline" size="sm" data-testid="btn-login-to-edit">
                        <Lock className="mr-1.5 h-3.5 w-3.5" /> Login to Edit
                      </Button>
                    </Link>
                  )}
                </div>
              </div>

              {/* Sheet Body */}
              <div className="px-6 py-5 space-y-5">
                {/* Project Details */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Project Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Document Title</p>
                        {isEditing ? (
                          <Input value={formData.title || ""} onChange={e => handleChange("title", e.target.value)} className="h-8 text-sm" />
                        ) : (
                          <p className="text-sm font-medium">{selectedDoc.title}</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</p>
                        {isEditing ? (
                          <Select value={formData.status} onValueChange={(val) => handleChange("status", val)}>
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DOC_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant={statusColors[selectedDoc.status] || "default"} className={statusBadgeClass(selectedDoc.status)}>
                            {selectedDoc.status}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Software Type</p>
                        {isEditing ? (
                          <Input value={formData.softwareType || ""} onChange={e => handleChange("softwareType", e.target.value)} className="h-8 text-sm" />
                        ) : (
                          <p className="text-sm font-medium">{selectedDoc.softwareType || "—"}</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Estimated Budget</p>
                        {isEditing ? (
                          <Input value={formData.budget || ""} onChange={e => handleChange("budget", e.target.value)} className="h-8 text-sm" />
                        ) : (
                          <p className="text-sm font-medium">{selectedDoc.budget || "—"}</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Target Start Date</p>
                        {isEditing ? (
                          <Input type="date" value={formData.startDate || ""} onChange={e => handleChange("startDate", e.target.value)} className="h-8 text-sm" />
                        ) : (
                          <p className="text-sm font-medium">
                            {selectedDoc.startDate ? format(new Date(selectedDoc.startDate), "MMM d, yyyy") : "Not set"}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Target Delivery Date</p>
                        {isEditing ? (
                          <Input type="date" value={formData.deliveryDate || ""} onChange={e => handleChange("deliveryDate", e.target.value)} className="h-8 text-sm" />
                        ) : (
                          <p className="text-sm font-medium">
                            {selectedDoc.deliveryDate ? format(new Date(selectedDoc.deliveryDate), "MMM d, yyyy") : "Not set"}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Client Information */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Client Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Client Name</p>
                        {isEditing ? (
                          <Input value={formData.clientName || ""} onChange={e => handleChange("clientName", e.target.value)} className="h-8 text-sm" />
                        ) : (
                          <p className="text-sm font-medium">{selectedDoc.clientName}</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Company</p>
                        {isEditing ? (
                          <Input value={formData.company || ""} onChange={e => handleChange("company", e.target.value)} className="h-8 text-sm" />
                        ) : (
                          <p className="text-sm font-medium">{selectedDoc.company}</p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</p>
                        {isEditing ? (
                          <Input type="email" value={formData.email || ""} onChange={e => handleChange("email", e.target.value)} className="h-8 text-sm" />
                        ) : (
                          <a href={`mailto:${selectedDoc.email}`} className="text-sm font-medium text-primary hover:underline">
                            {selectedDoc.email}
                          </a>
                        )}
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Phone</p>
                        {isEditing ? (
                          <Input value={formData.phone || ""} onChange={e => handleChange("phone", e.target.value)} className="h-8 text-sm" />
                        ) : (
                          <a href={`tel:${selectedDoc.phone}`} className="text-sm font-medium text-primary hover:underline">
                            {selectedDoc.phone}
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Industry</p>
                        {isEditing ? (
                          <Input value={formData.industry || ""} onChange={e => handleChange("industry", e.target.value)} className="h-8 text-sm" />
                        ) : (
                          <p className="text-sm font-medium">{selectedDoc.industry}</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">City</p>
                        {isEditing ? (
                          <Input value={formData.city || ""} onChange={e => handleChange("city", e.target.value)} className="h-8 text-sm" />
                        ) : (
                          <p className="text-sm font-medium">{selectedDoc.city}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Requirement Form Sections */}
                {selectedDoc.sections && Object.keys(selectedDoc.sections).length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Requirement Form Data</CardTitle>
                      <CardDescription className="text-xs">Captured from the client requirement form.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      {Object.entries(selectedDoc.sections).map(([key, value]) => (
                        <div key={key}>
                          <h4 className="text-sm font-semibold capitalize border-b pb-1.5 mb-2">
                            {key.replace(/([A-Z])/g, " $1").trim()}
                          </h4>
                          {typeof value === "object" && value !== null ? (
                            <div className="grid grid-cols-2 gap-3">
                              {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
                                <div key={k} className="bg-muted/50 p-2.5 rounded-md">
                                  <span className="block text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
                                    {k.replace(/([A-Z])/g, " $1").trim()}
                                  </span>
                                  <span className="text-xs">
                                    {Array.isArray(v) ? (v as unknown[]).join(", ") : String(v || "N/A")}
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
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!docToDelete} onOpenChange={(open) => !open && setDocToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the requirement document.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="btn-confirm-delete-doc"
            >
              Delete Document
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
