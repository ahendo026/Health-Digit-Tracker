import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UploadCloud, File, X, Loader2 } from "lucide-react";
import { useAnalyzeUpload, getGetUploadSummaryQueryKey, getListUploadsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function UploadPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [sourceApp, setSourceApp] = useState("");
  const [notes, setNotes] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  
  const analyzeUpload = useAnalyzeUpload();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (sourceApp) formData.append("sourceApp", sourceApp);
      if (notes) formData.append("notes", notes);

      const response = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Upload failed");
      
      const upload = await response.json();
      
      // Trigger analysis immediately
      await analyzeUpload.mutateAsync({ id: upload.id });
      
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: getGetUploadSummaryQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListUploadsQueryKey() });
      
      toast({ title: "Upload successful", description: "Image is being analyzed." });
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
      <div className="flex-1 p-8 max-w-3xl mx-auto w-full">
        <h1 className="text-3xl font-bold tracking-tight text-foreground mb-6">New Upload</h1>
        
        <Card>
          <CardHeader>
            <CardTitle>Data Capture</CardTitle>
            <CardDescription>Upload a screenshot from your health tracker or wearable app.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            
            <div 
              className={`border-2 border-dashed rounded-lg p-10 flex flex-col items-center justify-center transition-colors cursor-pointer ${
                file ? "border-primary/50 bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
              }`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleFileChange}
              />
              
              {file ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="p-3 bg-primary/10 rounded-full text-primary">
                    <File className="w-8 h-8" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-foreground">{file.name}</p>
                    <p className="text-sm text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                  >
                    <X className="w-4 h-4 mr-2" /> Remove
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="p-4 bg-muted rounded-full text-muted-foreground">
                    <UploadCloud className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Click to upload or drag and drop</p>
                    <p className="text-sm text-muted-foreground mt-1">PNG, JPG or JPEG (max 10MB)</p>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Source App <span className="text-muted-foreground font-normal">(optional)</span></label>
              <input
                type="text"
                placeholder="e.g. Apple Health, MyFitnessPal, Strava"
                value={sourceApp}
                onChange={(e) => setSourceApp(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Notes <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Textarea 
                placeholder="Add any context about this screenshot..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="resize-none"
                rows={3}
              />
            </div>

            <div className="flex justify-end">
              <Button 
                onClick={handleUpload} 
                disabled={!file || isUploading}
                size="lg"
              >
                {isUploading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isUploading ? "Uploading & Analyzing..." : "Upload Screenshot"}
              </Button>
            </div>
            
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
