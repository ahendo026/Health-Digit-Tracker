import { useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { useListUploads, useCreateReview, getListUploadsQueryKey, getGetUploadSummaryQueryKey } from "@workspace/api-client-react";
import { ClassificationBadge, StatusBadge } from "@/components/badges";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type Tri = "yes" | "no" | "";

interface ReviewState {
  classificationCorrect: Tri;
  valuesCorrect: Tri;
  useful: Tri;
  notes: string;
}

const triToBool = (v: Tri): boolean | null =>
  v === "yes" ? true : v === "no" ? false : null;

function YesNo({
  value,
  onChange,
}: {
  value: Tri;
  onChange: (v: Tri) => void;
}) {
  return (
    <div className="flex gap-2">
      <Button
        type="button"
        size="sm"
        variant={value === "yes" ? "default" : "outline"}
        className={value === "yes" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
        onClick={() => onChange(value === "yes" ? "" : "yes")}
      >
        Yes
      </Button>
      <Button
        type="button"
        size="sm"
        variant={value === "no" ? "default" : "outline"}
        className={value === "no" ? "bg-destructive hover:bg-destructive/90 text-white" : ""}
        onClick={() => onChange(value === "no" ? "" : "no")}
      >
        No
      </Button>
    </div>
  );
}

export default function ReviewPage() {
  const [page] = useState(1);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const limit = 20;

  const { data, isLoading } = useListUploads({ page, limit });
  const createReview = useCreateReview();

  const [reviewStates, setReviewStates] = useState<Record<number, ReviewState>>({});

  const pendingUploads = data?.uploads.filter(u => u.status === "analyzed" || u.status === "pending") || [];

  const getState = (id: number): ReviewState =>
    reviewStates[id] || { classificationCorrect: "", valuesCorrect: "", useful: "", notes: "" };

  const updateState = (id: number, patch: Partial<ReviewState>) => {
    setReviewStates(prev => ({
      ...prev,
      [id]: { ...getState(id), ...patch },
    }));
  };

  const handleSubmit = async (uploadId: number, classification: string | null) => {
    const state = getState(uploadId);
    const approved = state.classificationCorrect === "yes" && state.valuesCorrect !== "no";

    try {
      await createReview.mutateAsync({
        data: {
          uploadId,
          approved,
          classification: classification ?? "unknown",
          classificationCorrect: triToBool(state.classificationCorrect),
          valuesCorrect: triToBool(state.valuesCorrect),
          useful: triToBool(state.useful),
          notes: state.notes || null,
        },
      });

      queryClient.invalidateQueries({ queryKey: getListUploadsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetUploadSummaryQueryKey() });

      setReviewStates(prev => {
        const next = { ...prev };
        delete next[uploadId];
        return next;
      });

      toast({ title: "Review submitted" });
    } catch (err) {
      toast({ title: "Error", description: "Failed to submit review.", variant: "destructive" });
    }
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
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
            {pendingUploads.map(upload => {
              const state = getState(upload.id);
              return (
                <Card key={upload.id} className="flex flex-col">
                  <CardHeader className="pb-3 border-b border-border bg-muted/20">
                    <div className="flex justify-between items-start gap-3">
                      <Link href={`/uploads/${upload.id}`} className="text-sm font-medium hover:underline truncate">
                        {upload.originalFilename}
                      </Link>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(upload.createdAt), "MMM d, HH:mm")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <StatusBadge status={upload.status} />
                      <ClassificationBadge classification={upload.classification} />
                      {upload.sourceApp && (
                        <span className="text-xs text-muted-foreground">· {upload.sourceApp}</span>
                      )}
                    </div>
                  </CardHeader>

                  <div className="grid grid-cols-[160px_1fr] border-b border-border">
                    <div className="bg-muted border-r border-border p-2 flex justify-center items-center">
                      <img
                        src={`/api/storage/objects/${upload.filePath}`}
                        alt={upload.originalFilename}
                        className="max-h-36 max-w-full object-contain rounded-sm"
                      />
                    </div>
                    <div className="p-3 text-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Summary</p>
                      <p className="text-foreground line-clamp-5">
                        {upload.summary || <span className="text-muted-foreground italic">No summary</span>}
                      </p>
                    </div>
                  </div>

                  <CardContent className="p-4 flex-1 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Classification correct?</label>
                      <YesNo value={state.classificationCorrect} onChange={(v) => updateState(upload.id, { classificationCorrect: v })} />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Values correct?</label>
                      <YesNo value={state.valuesCorrect} onChange={(v) => updateState(upload.id, { valuesCorrect: v })} />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Useful?</label>
                      <YesNo value={state.useful} onChange={(v) => updateState(upload.id, { useful: v })} />
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
                      <Textarea
                        placeholder="Add context..."
                        className="resize-none h-16 text-sm"
                        value={state.notes}
                        onChange={(e) => updateState(upload.id, { notes: e.target.value })}
                      />
                    </div>
                  </CardContent>

                  <CardFooter className="p-4 pt-0">
                    <Button
                      className="w-full"
                      onClick={() => handleSubmit(upload.id, upload.classification)}
                      disabled={createReview.isPending || (state.classificationCorrect === "" && state.valuesCorrect === "" && state.useful === "")}
                    >
                      {createReview.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                      Submit Review
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
