import { useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { useListUploads } from "@workspace/api-client-react";
import { ClassificationBadge, StatusBadge } from "@/components/badges";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, FileImage } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function HistoryPage() {
  const [page, setPage] = useState(1);
  const limit = 10;
  const { data, isLoading } = useListUploads({ page, limit });

  return (
    <Layout>
      <div className="flex-1 p-4 sm:p-6 lg:p-8 w-full max-w-6xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-6">Upload History</h1>
        
        <Card>
          <CardHeader className="pb-4 border-b border-border">
            <CardTitle className="text-lg">All Screenshots</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Uploaded At</TableHead>
                  <TableHead>Source App</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Classification</TableHead>
                  <TableHead>Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell className="pl-6"><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    </TableRow>
                  ))
                ) : data?.uploads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                      No uploads found.
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.uploads.map((upload) => (
                    <TableRow key={upload.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="pl-6">
                        <Link href={`/uploads/${upload.id}`} className="flex items-center gap-2 font-medium text-primary hover:underline whitespace-nowrap">
                          <FileImage className="w-4 h-4 text-muted-foreground" />
                          {format(new Date(upload.createdAt), "MMM d, yyyy HH:mm")}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">
                        {upload.sourceApp || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={upload.status} />
                      </TableCell>
                      <TableCell>
                        <ClassificationBadge classification={upload.classification} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {upload.confidence !== null && upload.confidence !== undefined
                          ? `${(upload.confidence * 100).toFixed(0)}%`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            
            {data && data.total > 0 && (
              <div className="flex items-center justify-between p-4 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Showing {(page - 1) * limit + 1} to {Math.min(page * limit, data.total)} of {data.total} entries
                </p>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" /> Prev
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setPage(p => p + 1)}
                    disabled={page * limit >= data.total}
                  >
                    Next <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
