import { useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Cpu, FileText, BookOpen } from "lucide-react";
import {
  useGetSettings,
  useUpdateSettings,
  useListDocs,
  useGetDoc,
  getGetSettingsQueryKey,
} from "@workspace/api-client-react";
import type { SettingsAnalysisModel } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Markdown } from "@/components/markdown";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

// Keep in sync with ANALYSIS_MODELS in artifacts/api-server/src/lib/analysis.ts
const MODEL_OPTIONS: { id: SettingsAnalysisModel; label: string; hint: string }[] = [
  { id: "claude-opus-4-8", label: "Claude Opus 4.8", hint: "Most capable (default)" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5", hint: "Balanced speed and intelligence" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", hint: "Previous-generation Sonnet" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", hint: "Fastest and cheapest" },
];

// Mounted only while a doc is open, so useGetDoc runs (and refetches) exactly
// when a document is selected — no need for a disabled-query options object.
function DocViewer({ name }: { name: string }) {
  const { data, isLoading } = useGetDoc({ name });
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">Could not load this document.</p>;
  }
  return <Markdown text={data.content} />;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetSettings();
  const updateSettings = useUpdateSettings();

  const [model, setModel] = useState<SettingsAnalysisModel | undefined>(undefined);
  const [openDoc, setOpenDoc] = useState<string | null>(null);

  const { data: docList } = useListDocs();

  // Seed the local selection once the current setting loads.
  useEffect(() => {
    if (settings?.analysisModel) setModel(settings.analysisModel);
  }, [settings?.analysisModel]);

  const dirty = model !== undefined && model !== settings?.analysisModel;

  const handleSave = async () => {
    if (!model) return;
    try {
      await updateSettings.mutateAsync({ data: { analysisModel: model } });
      await queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      toast({ title: "Settings saved", description: "New analyses will use this model." });
    } catch {
      toast({ title: "Could not save settings", variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="flex-1 p-4 sm:p-6 max-w-2xl mx-auto w-full">
        <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1">Settings</h1>
        <p className="text-sm text-muted-foreground mb-5">Configure how HealthDigits analyzes your uploads.</p>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Cpu className="w-4 h-4 text-primary" /> Analysis model
            </CardTitle>
            <CardDescription>
              The Claude model used to read screenshots and extract structured data. Applies to every
              new analysis, on all devices.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading current setting…
              </div>
            ) : (
              <>
                <Select value={model} onValueChange={(v) => setModel(v as SettingsAnalysisModel)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_OPTIONS.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        <span className="font-medium">{opt.label}</span>
                        <span className="text-muted-foreground"> — {opt.hint}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground font-mono">{model}</p>
                <div className="flex justify-end">
                  <Button onClick={handleSave} disabled={!dirty || updateSettings.isPending}>
                    {updateSettings.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Save
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" /> Documentation
            </CardTitle>
            <CardDescription>
              Read-only views of the in-repo guides. Served from the running deploy, so you always
              see the docs for the code that's live.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {(docList?.docs ?? []).map((d) => (
                <Button
                  key={d.name}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setOpenDoc(d.name)}
                >
                  <FileText className="w-3.5 h-3.5" />
                  {d.title}
                </Button>
              ))}
              {docList && docList.docs.length === 0 && (
                <p className="text-sm text-muted-foreground">No documents available.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Dialog open={!!openDoc} onOpenChange={(o) => !o && setOpenDoc(null)}>
          <DialogContent className="max-w-3xl w-[calc(100vw-2rem)] max-h-[85vh] flex flex-col p-0 gap-0">
            <DialogHeader className="px-5 py-3 border-b border-border">
              <DialogTitle className="font-mono text-sm">{openDoc}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-auto px-5 py-4">
              {openDoc && <DocViewer name={openDoc} />}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
