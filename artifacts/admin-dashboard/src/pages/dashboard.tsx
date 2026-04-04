import { useLeads, useDocs } from "@/hooks/use-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, FileText, Target, PoundSterling } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function Dashboard() {
  const { leads } = useLeads();
  const { docs } = useDocs();

  const totalLeads = leads.length;
  const totalDocs = docs.length;
  const wonLeads = leads.filter((l) => l.status === "Won").length;
  const conversionRate = totalLeads ? Math.round((wonLeads / totalLeads) * 100) : 0;
  
  // Approximate pipeline value (docs with budgets)
  const pipelineValue = docs.reduce((acc, doc) => {
    // Extract max value from budget string like "£10,000 - £25,000"
    const match = doc.budget.match(/£([\d,]+)/g);
    if (match && match.length > 0) {
      const valStr = match[match.length - 1].replace(/[£,]/g, "");
      return acc + parseInt(valStr, 10);
    }
    return acc;
  }, 0);

  const formattedPipelineValue = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(pipelineValue || 0);

  const recentLeads = [...leads].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);
  const recentDocs = [...docs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);

  const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    New: "default",
    Contacted: "secondary",
    Qualified: "default",
    "Proposal Sent": "secondary",
    Won: "default",
    Lost: "destructive",
  };

  const docStatusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    Draft: "secondary",
    "Under Review": "default",
    Approved: "default",
    Archived: "outline",
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Overview of your pipeline and active documents.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-leads">{totalLeads}</div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Req Documents</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-docs">{totalDocs}</div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-conversion-rate">{conversionRate}%</div>
            <p className="text-xs text-muted-foreground mt-1">Leads won</p>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Est. Pipeline</CardTitle>
            <PoundSterling className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-pipeline-value">{formattedPipelineValue}</div>
            <p className="text-xs text-muted-foreground mt-1">Based on active documents</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Recent Leads</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            {recentLeads.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentLeads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className="font-medium">{lead.name}</TableCell>
                      <TableCell>{lead.company}</TableCell>
                      <TableCell>
                        <Badge variant={statusColors[lead.status] || "default"} className={lead.status === "Won" ? "bg-green-600 hover:bg-green-700" : ""}>
                          {lead.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-sm text-muted-foreground py-6 text-center border rounded-md border-dashed">
                No leads found.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Recent Documents</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            {recentDocs.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentDocs.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium truncate max-w-[200px]">{doc.title}</TableCell>
                      <TableCell>{doc.clientName}</TableCell>
                      <TableCell>
                        <Badge variant={docStatusColors[doc.status] || "default"} className={doc.status === "Approved" ? "bg-green-600 hover:bg-green-700" : ""}>
                          {doc.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-sm text-muted-foreground py-6 text-center border rounded-md border-dashed">
                No documents found.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}