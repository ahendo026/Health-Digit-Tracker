import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageOff } from "lucide-react";
import { getToken } from "@/lib/auth";

/**
 * Drop-in replacement for <img> pointing at a protected storage URL. Plain img
 * tags can't send an Authorization header, so this fetches the image with the
 * device token and renders it from an object URL (revoked on unmount).
 */
export function AuthedImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setObjectUrl(null);
    setFailed(false);

    const token = getToken();
    fetch(src, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setObjectUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [src]);

  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-muted text-muted-foreground ${className ?? ""}`}>
        <ImageOff className="w-6 h-6" />
      </div>
    );
  }
  if (!objectUrl) return <Skeleton className={className} />;
  return <img src={objectUrl} alt={alt} className={className} />;
}
