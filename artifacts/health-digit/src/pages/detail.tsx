import { useRoute } from "wouter";
import { Layout } from "@/components/layout";
import { useGetUpload } from "@workspace/api-client-react";
import { ClassificationBadge, StatusBadge } from "@/components/badges";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Activity, Utensils, Clock, HeartPulse, Scale, CheckCircle2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";

export default function DetailPage() {
  const [, params] = useRoute("/uploads/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  
  const { data, isLoading, error } = useGetUpload(id, {
    query: { enabled: !!id }
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="p-8 max-w-6xl mx-auto w-full space-y-6">
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
        <div className="p-8 max-w-6xl mx-auto w-full flex flex-col items-center justify-center min-h-[50vh] text-center">
          <AlertCircle className="w-12 h-12 text-destructive mb-4" />
          <h2 className="text-xl font-bold">Upload not found</h2>
          <p className="text-muted-foreground mt-2">The upload you're looking for doesn't exist or there was an error.</p>
        </div>
      </Layout>
    );
  }

  const { upload, llmRuns, events, meals, workouts, reviews } = data;

  return (
    <Layout>
      <div className="flex-1 p-8 w-full max-w-6xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground truncate max-w-2xl">
              {upload.originalFilename}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Uploaded on {format(new Date(upload.createdAt), "MMMM d, yyyy 'at' h:mm a")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ClassificationBadge classification={upload.classification} />
            <StatusBadge status={upload.status} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Image and Meta */}
          <div className="space-y-6 lg:col-span-1">
            <Card className="overflow-hidden border-border bg-card">
              <div className="bg-muted p-2 border-b border-border flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-mono">{upload.mimeType}</span>
                <span>{(upload.fileSize / 1024).toFixed(1)} KB</span>
              </div>
              <div className="p-4 bg-muted/30 flex justify-center bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZjBmMGYwIj48L3JlY3Q+CjxyZWN0IHg9IjQiIHk9IjQiIHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNmMGYwZjAiPjwvcmVjdD4KPC9zdmc+')]">
                <img 
                  src={`/api/storage/objects/${upload.filePath}`} 
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
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-medium text-foreground">
                          {review.approved ? "Approved" : "Rejected"} as {review.classification}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(review.createdAt), "MMM d")}
                        </span>
                      </div>
                      {review.notes && <p className="text-muted-foreground">{review.notes}</p>}
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
                {upload.summary ? (
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
                {events.map(event => (
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
                            {event.eventType === "blood_pressure" ? `${event.systolic}/${event.diastolic}` : event.value}
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
                ))}
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
                          <span className="font-semibold">{meal.carbs || '-'}g</span>
                        </div>
                        <div className="bg-muted/50 rounded py-2">
                          <span className="block text-muted-foreground mb-1">Protein</span>
                          <span className="font-semibold">{meal.protein || '-'}g</span>
                        </div>
                        <div className="bg-muted/50 rounded py-2">
                          <span className="block text-muted-foreground mb-1">Fat</span>
                          <span className="font-semibold">{meal.fat || '-'}g</span>
                        </div>
                        <div className="bg-muted/50 rounded py-2">
                          <span className="block text-muted-foreground mb-1">Fiber</span>
                          <span className="font-semibold">{meal.fiber || '-'}g</span>
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
