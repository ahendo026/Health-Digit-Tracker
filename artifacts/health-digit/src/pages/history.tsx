import { useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useListUploads, useGetUploadSummary } from "@workspace/api-client-react";
import { ClassificationBadge, StatusBadge } from "@/components/badges";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, FileImage } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const classLabel = (c: string | null | undefined) =>
  c ? c.replace(/_/g, " ") : "Unknown";

export default function HistoryPage() {
  const [, setLocation] = useLocation();
  const [page, setPage] = useState(1);
  const [classification, setClassification] = useState<string | null>(null);
  const limit = 20;
  const { data: summary } = useGetUploadSummary();
  const { data, isLoading } = useListUploads({
    page,
    limit,
    ...(classification ? { classification } : {}),
  });

  const selectClass = (value: string | null) => {
    setClassification(value);
    setPage(1);
  };

  return (
    <Layout>
      <div className="flex-1 p-4 sm:p-6 lg:p-8 w-full max-w-6xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-2">Upload History</h1>
        <p className="text-sm text-muted-foreground mb-4">All screenshots you've uploaded — newest first. Click a row to inspect the analysis.</p>

        {/* Classification filters — mirror the Overview labels in the sidebar */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Button
            variant={classification === null ? "default" : "outline"}
            size="sm"
            className="h-8"
            onClick={() => selectClass(null)}
          >
            All
            {summary?.total != null && (
              <span className="ml-1.5 opacity-70">{summary.total}</span>
            )}
          </Button>
          {(summary?.byClassification ?? [])
            .filter((c) => c.classification)
            .map((c) => (
              <Button
                key={c.classification}
                variant={classification === c.classification ? "default" : "outline"}
                size="sm"
                className="h-8 capitalize"
                onClick={() => selectClass(c.classification ?? null)}
              >
                {classLabel(c.classification)}
                <span className="ml-1.5 opacity-70">{c.count}</span>
              </Button>
            ))}
        </div>

        <Card>
          <CardHeader className="pb-4 border-b border-border">
            <CardTitle className="text-lg capitalize">
              {classification ? classLabel(classification) : "All Screenshots"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Uploaded</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Classification</TableHead>
                  <TableHead className="text-right pr-6">Confidence</TableHead>
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
                      <TableCell><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : data?.uploads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                      {classification ? (
                        <>No <span className="capitalize font-medium">{classLabel(classification)}</span> uploads. <button className="text-primary underline" onClick={() => selectClass(null)}>Clear filter</button></>
                      ) : (
                        <>No uploads yet. Head to <span className="font-medium">New Upload</span> to add your first screenshot.</>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.uploads.map((upload) => (
                    <TableRow
                      key={upload.id}
                      className="hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => setLocation(`/uploads/${upload.id}`)}
                    >
                      <TableCell className="pl-6">
                        <div className="flex items-center gap-2 font-medium text-primary whitespace-nowrap">
                          <FileImage className="w-4 h-4 text-muted-foreground" />
                          {format(new Date(upload.createdAt), "MMM d, yyyy HH:mm")}
                        </div>
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
                      <TableCell className="text-sm text-muted-foreground text-right pr-6">
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
