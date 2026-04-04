import { useState, useMemo } from "react";
import { useDocs } from "@/hooks/use-data";
import { RequirementDoc, DocStatus } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Search, MoreHorizontal, Trash2, Edit, ExternalLink, FileText } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { Link, useLocation } from "wouter";

const DOC_STATUSES: DocStatus[] = ["Draft", "Under Review", "Approved", "Archived"];

export default function Documents() {
  const { docs, removeDoc, editDoc } = useDocs();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [docToDelete, setDocToDelete] = useState<string | null>(null);

  const filteredDocs = useMemo(() => {
    return docs.filter((doc) => {
      const searchContent = (doc.title + doc.clientName + doc.company + doc.industry).toLowerCase();
      const matchesSearch = searchContent.includes(search.toLowerCase());
      const matchesStatus = statusFilter === "All" || doc.status === statusFilter;
      return matchesSearch && matchesStatus;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [docs, search, statusFilter]);

  const handleDelete = () => {
    if (!docToDelete) return;
    removeDoc(docToDelete);
    setDocToDelete(null);
    toast({ title: "Document deleted", description: "The document has been removed." });
  };

  const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    Draft: "secondary",
    "Under Review": "default",
    Approved: "default",
    Archived: "outline",
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Requirement Documents</h1>
          <p className="text-muted-foreground mt-1">Manage client project requirements and scoping.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild data-testid="btn-create-doc">
            <a href="/" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" /> Create New Document
            </a>
          </Button>
        </div>
      </div>

      {/* Info banner */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex items-start gap-3 text-sm text-foreground">
        <FileText className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
        <span>
          Documents are created using the{" "}
          <a href="/" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">
            Customer Requirement Form
          </a>
          . Fill in the form, then click{" "}
          <strong className="font-semibold">Submit to Admin Dashboard</strong> to add the document here.
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
                <TableRow key={doc.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setLocation(`/documents/${doc.id}`)} data-testid={`row-doc-${doc.id}`}>
                  <TableCell className="font-medium">
                    <div className="flex items-center">
                      <FileText className="h-4 w-4 mr-2 text-muted-foreground" />
                      {doc.title}
                    </div>
                  </TableCell>
                  <TableCell>{doc.clientName} <span className="text-muted-foreground text-xs block">{doc.company}</span></TableCell>
                  <TableCell>{doc.softwareType}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Select value={doc.status} onValueChange={(val: DocStatus) => {
                      editDoc(doc.id, { status: val });
                      toast({ title: "Status updated", description: `Document status changed to ${val}.` });
                    }}>
                      <SelectTrigger className="h-8 w-[140px] bg-transparent border-0 shadow-none focus:ring-0 p-0">
                        <Badge variant={statusColors[doc.status] || "default"} className={`whitespace-nowrap ${doc.status === "Approved" ? "bg-green-600 hover:bg-green-700" : ""}`}>
                          {doc.status}
                        </Badge>
                      </SelectTrigger>
                      <SelectContent>
                        {DOC_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{format(new Date(doc.createdAt), "MMM d, yyyy")}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/documents/${doc.id}`}>
                            <Edit className="mr-2 h-4 w-4" /> Edit Details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDocToDelete(doc.id)} className="text-destructive focus:bg-destructive focus:text-destructive-foreground">
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No documents found. {search || statusFilter !== "All" ? "Try adjusting your filters." : "Create your first one!"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

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
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="btn-confirm-delete-doc">
              Delete Document
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}