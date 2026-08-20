import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UploadCloud, X, Loader2, Camera, ImageIcon } from "lucide-react";
import { useAnalyzeUpload, getGetUploadSummaryQueryKey, getListUploadsQueryKey } from "@workspace/api-client-react";
import { apiUrl } from "@/lib/api";
import { getBrowserTimeZone } from "@/lib/utils";
import { getToken } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function UploadPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<"upload" | "camera">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [sourceApp, setSourceApp] = useState("");
  const [batchIdentifier, setBatchIdentifier] = useState("");
  const [notes, setNotes] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const analyzeUpload = useAnalyzeUpload();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
      // Reset input so the same file can be re-selected
      e.target.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const clearFile = () => setFile(null);

  const switchMode = (next: "upload" | "camera") => {
    if (next !== mode) {
      clearFile();
      setMode(next);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);

    try {
      const timezone = getBrowserTimeZone();
      const formData = new FormData();
      formData.append("file", file);
      if (sourceApp) formData.append("sourceApp", sourceApp);
      if (batchIdentifier.trim()) formData.append("batchIdentifier", batchIdentifier.trim());
      if (notes) formData.append("notes", notes);
      if (timezone) formData.append("timezone", timezone);

      // Raw fetch (multipart isn't in the OpenAPI spec) — attach the device
      // token by hand; do NOT set Content-Type or the multipart boundary breaks.
      const token = getToken();
      const response = await fetch(apiUrl("/api/uploads"), {
        method: "POST",
        body: formData,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (!response.ok) throw new Error("Upload failed");

      const upload = await response.json();

      analyzeUpload
        .mutateAsync({ id: upload.id, data: timezone ? { timezone } : {} })
        .catch((err) => console.error("Analysis kick-off failed", err))
        .finally(() => {
          queryClient.invalidateQueries({ queryKey: getGetUploadSummaryQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListUploadsQueryKey() });
        });

      queryClient.invalidateQueries({ queryKey: getGetUploadSummaryQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListUploadsQueryKey() });

      toast({ title: "Upload received", description: "Analysis started — opening details…" });
      setLocation(`/uploads/${upload.id}`);
    } catch (error) {
      console.error(error);
      toast({ title: "Upload failed", description: "There was an error uploading your file.", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Layout>
      <div className="flex-1 p-4 sm:p-6 max-w-2xl mx-auto w-full">
        <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1">New Upload</h1>
        <p className="text-sm text-muted-foreground mb-5">Upload a screenshot from your health tracker — analysis runs automatically.</p>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Data Capture</CardTitle>
            <CardDescription>Select an image from your device or take a photo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* Hidden file inputs */}
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
            <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileChange} />

            {/* Mode toggle — always visible */}
            <div className="flex rounded-lg border border-input overflow-hidden w-fit">
              <button
                type="button"
                onClick={() => switchMode("upload")}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                  mode === "upload" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                <UploadCloud className="w-4 h-4" /> Upload image
              </button>
              <button
                type="button"
                onClick={() => switchMode("camera")}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                  mode === "camera" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                <Camera className="w-4 h-4" /> Take photo
              </button>
            </div>

            {/* File selection zone */}
            {file ? (
              /* Selected file — name/size only, no preview */
              <div className="border-2 border-dashed rounded-lg p-6 flex items-center justify-between gap-4 border-primary/50 bg-primary/5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 bg-primary/10 rounded-lg text-primary shrink-0">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={clearFile} className="shrink-0 text-muted-foreground hover:text-destructive">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : mode === "upload" ? (
              /* Upload drop zone */
              <div
                className="border-2 border-dashed rounded-lg p-10 flex flex-col items-center justify-center transition-colors cursor-pointer border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="p-4 bg-muted rounded-full text-muted-foreground">
                    <UploadCloud className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Click to upload or drag and drop</p>
                    <p className="text-sm text-muted-foreground mt-1">PNG, JPG or JPEG (max 10 MB)</p>
                  </div>
                </div>
              </div>
            ) : (
              /* Camera zone */
              <div className="border-2 border-dashed rounded-lg p-10 flex flex-col items-center justify-center gap-4">
                <div className="p-4 bg-muted rounded-full text-muted-foreground">
                  <Camera className="w-8 h-8" />
                </div>
                <div className="text-center">
                  <p className="font-medium text-foreground">Capture a photo</p>
                  <p className="text-sm text-muted-foreground mt-1">Opens your device camera</p>
                </div>
                <Button variant="outline" onClick={() => cameraInputRef.current?.click()}>
                  <Camera className="w-4 h-4 mr-2" /> Open camera
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Source App <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Apple Health, MyFitnessPal, Strava"
                value={sourceApp}
                onChange={(e) => setSourceApp(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Batch identifier <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. 2026-07 morning readings"
                value={batchIdentifier}
                onChange={(e) => setBatchIdentifier(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <p className="text-xs text-muted-foreground">Free-text label to group this image with others.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Notes <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Textarea
                placeholder="Add any context about this screenshot..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="resize-none"
                rows={3}
              />
            </div>

            <Button
              onClick={handleUpload}
              disabled={!file || isUploading}
              size="lg"
              className="w-full"
            >
              {isUploading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isUploading ? "Uploading…" : "Upload & Analyze"}
            </Button>

          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
