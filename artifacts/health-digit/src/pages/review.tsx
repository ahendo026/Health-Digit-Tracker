import { useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { useListUploads, useCreateReview, getListUploadsQueryKey, getGetUploadSummaryQueryKey } from "@workspace/api-client-react";
import { ClassificationBadge, StatusBadge } from "@/components/badges";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, X, Loader2, ArrowRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export default function ReviewPage() {
  const [page] = useState(1);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const limit = 20;
  
  // We fetch uploads that are pending review
  // The API doesn't have a status filter in the generated schema, 
  // so we'll fetch general uploads and filter on the frontend for this MVP,
  // or rely on the fact that we process them. Actually we'll just show them all and highlight pending.
  const { data, isLoading } = useListUploads({ page, limit });
  
  const createReview = useCreateReview();
  
  const [reviewStates, setReviewStates] = useState<Record<number, { classification: string, notes: string }>>({});

  const pendingUploads = data?.uploads.filter(u => u.status === "analyzed" || u.status === "pending") || [];

  const handleApprove = async (uploadId: number, originalClassification: string | null) => {
    try {
      const state = reviewStates[uploadId] || {};
      const classification = state.classification || originalClassification || "unknown";
      
      await createReview.mutateAsync({
        data: {
          uploadId,
          approved: true,
          classification,
          notes: state.notes || null
        }
      });
      
      queryClient.invalidateQueries({ queryKey: getListUploadsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetUploadSummaryQueryKey() });
      
      toast({ title: "Review submitted", description: "The upload has been approved." });
    } catch (err) {
      toast({ title: "Error", description: "Failed to submit review.", variant: "destructive" });
    }
  };

  const handleReject = async (uploadId: number) => {
    try {
      const state = reviewStates[uploadId] || {};
      
      await createReview.mutateAsync({
        data: {
          uploadId,
          approved: false,
          classification: "unknown",
          notes: state.notes || null
        }
      });
      
      queryClient.invalidateQueries({ queryKey: getListUploadsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetUploadSummaryQueryKey() });
      
      toast({ title: "Review submitted", description: "The upload has been rejected." });
    } catch (err) {
      toast({ title: "Error", description: "Failed to submit review.", variant: "destructive" });
    }
  };

  const updateState = (id: number, key: string, value: string) => {
    setReviewStates(prev => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [key]: value }
    }));
  };

  return (
    <Layout>
      <div className="flex-1 p-8 w-full max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">Review Queue</h1>
        <p className="text-muted-foreground mb-8">Verify automated classifications to improve data quality.</p>
        
        {isLoading ? (
          <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : pendingUploads.length === 0 ? (
          <Card className="bg-muted/30 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Check className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
              <h3 className="text-lg font-semibold">All Caught Up</h3>
              <p className="text-muted-foreground mt-2 max-w-sm">There are no pending uploads requiring your review right now.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-8 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {pendingUploads.map(upload => (
              <Card key={upload.id} className="flex flex-col">
                <CardHeader className="pb-3 border-b border-border bg-muted/20">
                  <div className="flex justify-between items-start">
                    <Link href={`/uploads/${upload.id}`} className="text-sm font-medium hover:underline truncate max-w-[180px]">
                      {upload.originalFilename}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(upload.createdAt), "MMM d")}
                    </span>
                  </div>
                </CardHeader>
                
                <div className="h-48 bg-muted border-b border-border p-2 flex justify-center items-center">
                  <img 
                    src={`/api/storage/objects/${upload.filePath}`} 
                    alt={upload.originalFilename}
                    className="max-h-full max-w-full object-contain rounded-sm shadow-sm"
                  />
                </div>
                
                <CardContent className="p-4 flex-1 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Detected:</span>
                    <ClassificationBadge classification={upload.classification} />
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">Confirm Classification</label>
                    <Select 
                      value={reviewStates[upload.id]?.classification || upload.classification || "unknown"}
                      onValueChange={(val) => updateState(upload.id, "classification", val)}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select classification" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="glucose_reading">Glucose Reading</SelectItem>
                        <SelectItem value="blood_pressure_reading">Blood Pressure</SelectItem>
                        <SelectItem value="weight_reading">Weight Reading</SelectItem>
                        <SelectItem value="meal_event">Meal Event</SelectItem>
                        <SelectItem value="workout_event">Workout Event</SelectItem>
                        <SelectItem value="unknown">Unknown / Reject</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">Reviewer Notes (optional)</label>
                    <Textarea 
                      placeholder="Add context..." 
                      className="resize-none h-16 text-sm"
                      value={reviewStates[upload.id]?.notes || ""}
                      onChange={(e) => updateState(upload.id, "notes", e.target.value)}
                    />
                  </div>
                </CardContent>
                
                <CardFooter className="p-4 pt-0 flex gap-2">
                  <Button 
                    variant="outline" 
                    className="flex-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleReject(upload.id)}
                    disabled={createReview.isPending}
                  >
                    <X className="w-4 h-4 mr-1" /> Reject
                  </Button>
                  <Button 
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => handleApprove(upload.id, upload.classification)}
                    disabled={createReview.isPending}
                  >
                    <Check className="w-4 h-4 mr-1" /> Approve
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
