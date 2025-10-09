import { CheckCircle, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface UploadProgressProps {
  fileName: string;
  progress: number;
  status: "uploading" | "processing" | "completed";
}

export const UploadProgress = ({
  fileName,
  progress,
  status,
}: UploadProgressProps) => {
  return (
    <div className="bg-card rounded-xl p-6 shadow-md border border-border transition-all duration-300 hover:shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className={cn(
              "p-2 rounded-lg transition-colors duration-300",
              status === "completed"
                ? "bg-green-100 dark:bg-green-900/30"
                : "bg-primary/10"
            )}
          >
            {status === "completed" ? (
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
            ) : (
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground truncate">{fileName}</p>
            <p className="text-sm text-muted-foreground">
              {status === "uploading" && "Uploading..."}
              {status === "processing" && "Processing with AI..."}
              {status === "completed" && "Analysis complete"}
            </p>
          </div>
        </div>
        <span className="text-sm font-medium text-primary ml-4">
          {progress}%
        </span>
      </div>

      <Progress value={progress} className="h-2" />
    </div>
  );
};
