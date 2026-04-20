import { useRoute, Link } from "wouter";
import { resolveUploadImageUrl } from "@/lib/api";
import { Layout } from "@/components/layout";
import {
  useGetUpload,
  useAnalyzeUpload,
  getGetUploadQueryKey,
  getGetUploadSummaryQueryKey,
  getListUploadsQueryKey,
} from "@workspace/api-client-react";
import { ClassificationBadge, StatusBadge } from "@/components/badges";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  Activity,
  Utensils,
  Clock,
  HeartPulse,
  CheckCircle2,
  XCircle,
  RotateCw,
  Loader2,
  ClipboardCheck,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

function ReviewAnswer({ label, value }: { label: string; value: number | boolean | null | undefined }) {
  const v = value === true || value === 1 ? true : value === false || value === 0 ? false : null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      {v === true ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
      ) : v === false ? (
        <XCircle className="w-3.5 h-3.5 text-destructive" />
      ) : (
        <span className="w-3.5 h-3.5 inline-block rounded-full border border-muted-foreground/30" />
      )}
      {label}
    </span>
  );
}

export default function DetailPage() {
  const [, params] = useRoute("/uploads/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useGetUpload(id, {
    query: {
      enabled: !!id,
      refetchInterval: (query) => {
        const status = query.state.data?.upload?.status;
        return status === "analyzing" || status === "pending" ? 2000 : false;
      },
    },
  });

  const analyzeUpload = useAnalyzeUpload();

  const handleRetry = async () => {
    try {
      await analyzeUpload.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getGetUploadQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getGetUploadSummaryQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListUploadsQueryKey() });
      toast({ title: "Re-analysis started" });
    } catch {
      toast({ title: "Could not start analysis", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto w-full space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Skeleton className="h-[400px] md:col-span-1" />
            <Skeleton className="h-[400px] md:col-span-2" />
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout>
        <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto w-full flex flex-col items-center justify-center min-h-[50vh] text-center">
          <AlertCircle className="w-12 h-12 text-destructive mb-4" />
          <h2 className="text-xl font-bold">Upload not found</h2>
          <p className="text-muted-foreground mt-2">The upload you're looking for doesn't exist or there was an error.</p>
        </div>
      </Layout>
    );
  }

  const { upload, llmRuns, events, meals, workouts, reviews } = data;
  const isAnalyzing = upload.status === "analyzing" || upload.status === "pending";
  const isFailed = upload.status === "failed";
  const isAnalyzed = upload.status === "analyzed";
  const hasReview = reviews.length > 0;

  const titleLabel = upload.classification
    ? upload.classification.replace(/_/g, " ")
    : "Untitled upload";

  return (
    <Layout>
      <div className="flex-1 p-4 sm:p-6 lg:p-8 w-full max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground capitalize truncate">
              {titleLabel}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 truncate">
              {upload.sourceApp ? <><span className="font-medium text-foreground">{upload.sourceApp}</span> · </> : null}
              {upload.originalFilename}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ClassificationBadge classification={upload.classification} />
            <StatusBadge status={upload.status} />
            {hasReview && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                <CheckCircle2 className="w-3 h-3" /> Reviewed
              </span>
            )}
          </div>
        </div>

        {/* Status banner */}
        {isAnalyzing && (
          <Card className="mb-6 border-blue-200 bg-blue-50/60">
            <CardContent className="p-4 flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-blue-700" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900">Analysis in progress</p>
                <p className="text-xs text-blue-800/80">Reading the screenshot and extracting structured data. This page updates automatically.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {isFailed && (
          <Card className="mb-6 border-destructive/30 bg-destructive/5">
            <CardContent className="p-4 flex items-center gap-3 flex-wrap">
              <AlertCircle className="w-5 h-5 text-destructive" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Analysis failed</p>
                <p className="text-xs text-muted-foreground">Try running it again. If it keeps failing, the image may not be readable.</p>
              </div>
              <Button size="sm" onClick={handleRetry} disabled={analyzeUpload.isPending}>
                {analyzeUpload.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RotateCw className="w-4 h-4 mr-1" />}
                Re-analyze
              </Button>
            </CardContent>
          </Card>
        )}

        {isAnalyzed && !hasReview && (
          <Card className="mb-6 border-amber-200 bg-amber-50/60">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 w-full">
                <ClipboardCheck className="w-5 h-5 text-amber-700 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-900">Ready for review</p>
                  <p className="text-xs text-amber-800/80">Confirm the classification and extracted values to lock this entry in.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Link href="/review" className="flex-1">
                  <Button size="sm" variant="outline" className="w-full border-amber-300 bg-white">
                    Review now
                  </Button>
                </Link>
                <Button size="sm" variant="ghost" className="flex-1" onClick={handleRetry} disabled={analyzeUpload.isPending}>
                  {analyzeUpload.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RotateCw className="w-4 h-4 mr-1" />}
                  Re-analyze
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Left Column: Image and Meta */}
          <div className="space-y-6 lg:col-span-1">
            <Card className="overflow-hidden border-border bg-card">
              <div className="border-b border-border divide-y divide-border text-xs">
                {upload.capturedAt && (
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Clock className="w-3 h-3" /> Screen Capture
                    </span>
                    <span className="font-medium text-foreground">
                      {format(new Date(upload.capturedAt), "MMM d, yyyy 'at' h:mm a")}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Clock className="w-3 h-3" /> Uploaded
                  </span>
                  <span className="font-medium text-foreground">
                    {format(new Date(upload.createdAt), "MMM d, yyyy 'at' h:mm a")}
                  </span>
                </div>
              </div>
              <div className="bg-muted p-2 border-b border-border flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-mono">{upload.mimeType}</span>
                <span>{(upload.fileSize / 1024).toFixed(1)} KB</span>
              </div>
              <div className="p-4 bg-muted/30 flex justify-center bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZjBmMGYwIj48L3JlY3Q+CjxyZWN0IHg9IjQiIHk9IjQiIHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNmMGYwZjAiPjwvcmVjdD4KPC9zdmc+')]">
                <img
                  src={resolveUploadImageUrl(upload.filePath)}
                  alt={upload.originalFilename}
                  className="max-w-full h-auto rounded shadow-sm border border-border/50 max-h-[500px] object-contain"
                />
              </div>
            </Card>

            {upload.notes && (
              <Card>
                <CardHeader className="py-3 px-4 border-b border-border">
                  <CardTitle className="text-sm">User Notes</CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <p className="text-sm text-foreground whitespace-pre-wrap">{upload.notes}</p>
                </CardContent>
              </Card>
            )}

            {reviews.length > 0 && (
              <Card>
                <CardHeader className="py-3 px-4 border-b border-border">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Review History
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  {reviews.map(review => (
                    <div key={review.id} className="text-sm border-l-2 border-primary/30 pl-3 py-1">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="font-medium text-foreground">
                          {review.approved ? "Approved" : "Rejected"}
                          {review.classification ? <> as <span className="capitalize">{review.classification.replace(/_/g, " ")}</span></> : null}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(review.createdAt), "MMM d")}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mb-1">
                        <ReviewAnswer label="Classification" value={review.classificationCorrect} />
                        <ReviewAnswer label="Values" value={review.valuesCorrect} />
                        <ReviewAnswer label="Useful" value={review.useful} />
                      </div>
                      {review.notes && <p className="text-muted-foreground mt-1">{review.notes}</p>}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column: Extracted Data & LLM Run */}
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader className="py-4 border-b border-border bg-muted/20">
                <CardTitle className="text-lg flex justify-between items-center">
                  <span>Analysis Summary</span>
                  {upload.confidence !== null && upload.confidence !== undefined && (
                    <span className="text-sm font-normal text-muted-foreground bg-background px-2 py-1 rounded-md border border-border">
                      {(upload.confidence * 100).toFixed(1)}% confidence
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {isAnalyzing ? (
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Waiting for analysis to complete…</span>
                  </div>
                ) : upload.summary ? (
                  <p className="text-foreground leading-relaxed">{upload.summary}</p>
                ) : (
                  <p className="text-muted-foreground italic">No summary available.</p>
                )}
              </CardContent>
            </Card>

            {/* Extracted Data Sections */}
            {(events.length > 0 || meals.length > 0 || workouts.length > 0) && (
              <h3 className="text-lg font-semibold mt-8 mb-4 border-b border-border pb-2">Extracted Data</h3>
            )}

            {events.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                {events.map(event => {
                  const isBp = event.eventType === "blood_pressure_reading" || event.eventType === "blood_pressure";
                  return (
                    <Card key={event.id} className="overflow-hidden">
                      <div className="h-1 bg-primary/20 w-full" />
                      <CardContent className="p-4 flex items-start gap-4">
                        <div className="bg-primary/10 p-2 rounded-lg text-primary mt-1">
                          <Activity className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                            {event.eventType.replace(/_/g, " ")}
                          </p>
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-bold text-foreground">
                              {isBp
                                ? `${event.systolic ?? "?"}/${event.diastolic ?? "?"}`
                                : event.value ?? "—"}
                            </span>
                            {event.unit && <span className="text-sm font-medium text-muted-foreground">{event.unit}</span>}
                          </div>
                          {event.eventTime && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                              <Clock className="w-3 h-3" />
                              {format(new Date(event.eventTime), "PPp")}
                            </div>
                          )}
                          {event.notes && <p className="text-sm mt-2 text-muted-foreground border-t border-border pt-2">{event.notes}</p>}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {meals.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                {meals.map(meal => (
                  <Card key={meal.id}>
                    <CardHeader className="pb-2 pt-4 px-4 border-b border-border">
                      <CardTitle className="text-base flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <Utensils className="w-4 h-4 text-primary" />
                          <span className="capitalize">{meal.mealType || 'Meal'}</span>
                        </div>
                        {meal.calories && <span className="text-sm font-normal bg-muted px-2 py-0.5 rounded">{meal.calories} kcal</span>}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      {meal.name && <p className="font-medium text-foreground mb-2">{meal.name}</p>}
                      {meal.foods && <p className="text-sm text-muted-foreground mb-4">{meal.foods}</p>}

                      <div className="grid grid-cols-4 gap-2 text-center text-xs">
                        <div className="bg-muted/50 rounded py-2">
                          <span className="block text-muted-foreground mb-1">Carbs</span>
                          <span className="font-semibold">{meal.carbs ?? '—'}g</span>
                        </div>
                        <div className="bg-muted/50 rounded py-2">
                          <span className="block text-muted-foreground mb-1">Protein</span>
                          <span className="font-semibold">{meal.protein ?? '—'}g</span>
                        </div>
                        <div className="bg-muted/50 rounded py-2">
                          <span className="block text-muted-foreground mb-1">Fat</span>
                          <span className="font-semibold">{meal.fat ?? '—'}g</span>
                        </div>
                        <div className="bg-muted/50 rounded py-2">
                          <span className="block text-muted-foreground mb-1">Fiber</span>
                          <span className="font-semibold">{meal.fiber ?? '—'}g</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {workouts.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                {workouts.map(workout => (
                  <Card key={workout.id}>
                    <CardHeader className="pb-2 pt-4 px-4 border-b border-border">
                      <CardTitle className="text-base flex items-center gap-2">
                        <HeartPulse className="w-4 h-4 text-primary" />
                        <span className="capitalize">{workout.workoutType || 'Workout'}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-sm">
                        {workout.duration && (
                          <div>
                            <span className="block text-xs text-muted-foreground">Duration</span>
                            <span className="font-medium">{workout.duration} min</span>
                          </div>
                        )}
                        {workout.calories && (
                          <div>
                            <span className="block text-xs text-muted-foreground">Calories</span>
                            <span className="font-medium">{workout.calories} kcal</span>
                          </div>
                        )}
                        {workout.averageHeartRate && (
                          <div>
                            <span className="block text-xs text-muted-foreground">Avg HR</span>
                            <span className="font-medium">{workout.averageHeartRate} bpm</span>
                          </div>
                        )}
                        {workout.distance && (
                          <div>
                            <span className="block text-xs text-muted-foreground">Distance</span>
                            <span className="font-medium">{workout.distance} km</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Raw LLM Run Output */}
            {llmRuns.length > 0 && (
              <div className="mt-8">
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      View Raw LLM Output
                      <span className="text-xs text-muted-foreground font-mono">{llmRuns[0].modelName}</span>
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <Card className="bg-slate-950 text-slate-50 border-slate-800 overflow-hidden">
                      <div className="overflow-x-auto p-4 max-h-[400px]">
                        <pre className="text-xs font-mono">
                          {JSON.stringify(llmRuns[0].rawOutput, null, 2)}
                        </pre>
                      </div>
                    </Card>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
