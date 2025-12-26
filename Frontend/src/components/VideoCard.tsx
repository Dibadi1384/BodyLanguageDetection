import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Video, Clock, CheckCircle2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface VideoCardProps {
  video: {
    title: string;
    uploadDate: string;
    status: "processing" | "completed" | "analyzing";
    thumbnail?: string;
    detectionsUrl?: string;
    statusMessage?: string;
    stem?: string;
  };
}

export const VideoCard = ({ video }: VideoCardProps) => {
  const navigate = useNavigate();
  const { title, uploadDate, status, thumbnail, detectionsUrl, statusMessage, stem } = video;
  const [thumbnailError, setThumbnailError] = useState(false);
  const statusConfig = {
    processing: {
      label: "Processing",
      icon: Loader2,
      className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
      iconClassName: "animate-spin",
    },
    analyzing: {
      label: "Analyzing",
      icon: Loader2,
      className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
      iconClassName: "animate-spin",
    },
    completed: {
      label: "Completed",
      icon: CheckCircle2,
      className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
      iconClassName: "",
    },
  };

  // If statusMessage contains "Annotating", show "Annotating" label instead of "Analyzing"
  const isAnnotating = statusMessage?.toLowerCase().includes('annotating');
  const config = {
    ...statusConfig[status],
    label: isAnnotating && status === 'analyzing' ? 'Annotating' : statusConfig[status].label
  };
  const StatusIcon = config.icon;

  const handleClick = () => {
    if (status === "completed" && stem) {
      navigate(`/results?stem=${encodeURIComponent(stem)}&title=${encodeURIComponent(title)}`);
    }
  };

  const isClickable = status === "completed" && stem;
  const isProcessing = status === "processing" || status === "analyzing";

  return (
    <div 
      onClick={handleClick}
      className={cn(
        "group bg-card rounded-xl overflow-hidden shadow-lg hover:shadow-2xl hover:shadow-primary/20 border border-border hover:border-primary/50 transition-all duration-300 hover:-translate-y-1",
        isClickable && "cursor-pointer"
      )}>
      <div className={cn(
        "relative bg-gradient-to-br from-accent/10 to-primary/10 overflow-hidden",
        isProcessing ? "h-32" : "aspect-video"
      )}>
        {thumbnail && !thumbnailError ? (
          <img
            src={thumbnail}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
            onError={() => setThumbnailError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Video className="w-16 h-16 text-primary/30 group-hover:text-primary/50 transition-colors" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-semibold text-foreground line-clamp-2 flex-1">
            {title}
          </h3>
          <Badge
            variant="secondary"
            className={cn("flex items-center gap-1.5 shrink-0", config.className)}
          >
            <StatusIcon className={cn("w-3.5 h-3.5", config.iconClassName)} />
            {config.label}
          </Badge>
        </div>

        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span>{uploadDate}</span>
          </div>
          {statusMessage && (
            <span className="text-xs text-muted-foreground">{statusMessage}</span>
          )}
          {detectionsUrl && (
            <a
              href={detectionsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              View JSON
            </a>
          )}
        </div>
      </div>
    </div>
  );
};