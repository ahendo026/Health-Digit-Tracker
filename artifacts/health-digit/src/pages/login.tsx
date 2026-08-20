import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Lock } from "lucide-react";
import { useLogin, ApiError } from "@workspace/api-client-react";
import { setToken } from "@/lib/auth";

// Standalone page — deliberately NOT wrapped in Layout, which fires an
// authenticated query on mount and would bounce straight back here.
export default function LoginPage() {
  const login = useLogin();
  const [password, setPassword] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || login.isPending) return;
    setError(null);
    try {
      const result = await login.mutateAsync({
        data: { password, deviceName: deviceName.trim() || undefined },
      });
      setToken(result.token);
      window.location.assign(import.meta.env.BASE_URL.replace(/\/$/, "") + "/");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Incorrect password.");
      } else if (err instanceof ApiError && err.status === 429) {
        setError("Too many failed attempts — wait 30 seconds and try again.");
      } else if (err instanceof ApiError && err.status === 503) {
        setError("This server has no password configured yet.");
      } else {
        setError("Could not reach the server. Check your connection and try again.");
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary" /> HealthDigits
          </CardTitle>
          <CardDescription>
            Enter the master password to authenticate this device. You'll only need to do this once
            per device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="password"
              placeholder="Master password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
            />
            <Input
              type="text"
              placeholder="Device name (optional, e.g. My iPhone)"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              maxLength={100}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={!password || login.isPending}>
              {login.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Log in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
