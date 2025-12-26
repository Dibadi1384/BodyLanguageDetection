import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { VideoCard } from "@/components/VideoCard";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw, Video } from "lucide-react";
import { toast } from "sonner";

interface UploadedVideo {
  id: string;
  title: string;
  uploadDate: string;
  status: "processing" | "completed" | "analyzing";
  annotatedUrl?: string;
  detectionsUrl?: string;
  stem?: string;
  statusMessage?: string;
}

const MyDetections = () => {
  const navigate = useNavigate();
  const [uploadedVideos, setUploadedVideos] = useState<UploadedVideo[]>([]);
  const [loading, setLoading] = useState(true);

  const handleRefresh = async (showToasts: boolean = true) => {
    if (showToasts) {
      toast.info("Refreshing videos...");
    }
    try {
      setLoading(true);
      const response = await fetch('/videos');
      if (!response.ok) {
        throw new Error(`Failed to fetch videos: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Fetched videos:', data);
      
      // Convert backend video data to frontend format
      // Filter to only show completed videos
      const backendVideos: UploadedVideo[] = data.videos
        .map((video: any) => {
          const stem = video.filename.replace(/\.[^/.]+$/, "");
          // Try to get stored description from localStorage, otherwise use filename
          const storedDesc = localStorage.getItem(`video_desc_${stem}`);
          const title = storedDesc || video.filename.replace(/\.[^/.]+$/, "");
          
          return {
            id: video.filename,
            title: title,
            uploadDate: new Date(video.uploadedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
            status: "completed" as const,
            stem: stem,
            thumbnail: `/thumbnail/${stem}`, // Thumbnail URL - endpoint generates it
          };
        })
        .filter((video: UploadedVideo) => video.status === "completed");
      
      setUploadedVideos(backendVideos);
      if (showToasts) {
        toast.success(`Loaded ${backendVideos.length} videos`);
      }
    } catch (error) {
      console.error('Error fetching videos:', error);
      if (showToasts) {
        toast.error("Failed to refresh videos from server");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleRefresh(false); // Load on mount without toasts
  }, []);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <AnimatedBackground />
      <div className="container mx-auto px-4 py-12 max-w-7xl relative z-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/")}
                className="gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-accent via-primary to-accent bg-clip-text text-transparent">
                My Detections
              </h1>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleRefresh(true)}
              className="gap-2"
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Videos Grid */}
        {loading ? (
          <div className="bg-card rounded-xl p-12 text-center border border-border shadow-md">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <RefreshCw className="w-8 h-8 text-muted-foreground animate-spin" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-foreground">
              Loading videos...
            </h3>
          </div>
        ) : uploadedVideos.length === 0 ? (
          <div className="bg-card rounded-xl p-12 text-center border border-border shadow-md">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <Video className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-foreground">
              No videos yet
            </h3>
            <p className="text-muted-foreground max-w-md mx-auto mb-4">
              Your completed video analyses will appear here
            </p>
            <Button
              variant="outline"
              onClick={() => navigate("/")}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Go to Upload Page
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {uploadedVideos.map((video) => (
              <VideoCard
                key={video.id}
                video={video}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyDetections;

