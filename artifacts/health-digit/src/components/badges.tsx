import { Badge } from "./ui/badge";

export function ClassificationBadge({ classification }: { classification?: string | null }) {
  if (!classification) return <Badge variant="outline">Unclassified</Badge>;
  
  const label = classification.replace(/_/g, " ");
  
  switch (classification) {
    case "glucose_reading":
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-200">{label}</Badge>;
    case "blood_pressure_reading":
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100 border-red-200">{label}</Badge>;
    case "weight_reading":
      return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100 border-purple-200">{label}</Badge>;
    case "meal_event":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200">{label}</Badge>;
    case "workout_event":
      return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100 border-orange-200">{label}</Badge>;
    case "unknown":
      return <Badge variant="secondary">{label}</Badge>;
    default:
      return <Badge variant="outline">{label}</Badge>;
  }
}

export function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "analyzed":
      return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50">Analyzed</Badge>;
    case "analyzing":
      return <Badge className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50">Analyzing</Badge>;
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
    case "pending":
      return <Badge variant="secondary">Pending</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}
