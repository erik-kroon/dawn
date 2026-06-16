import { Loader2 } from "lucide-react";

export default function Loader() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background pt-8 text-foreground">
      <Loader2 aria-label="Loading" className="animate-spin" />
    </div>
  );
}
