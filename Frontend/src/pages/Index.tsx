import { useState } from "react";
import { VideoUploadZone } from "@/components/VideoUploadZone";
import { UploadProgress } from "@/components/UploadProgress";
import { VideoCard } from "@/components/VideoCard";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RefreshCw, Video } from "lucide-react";
import { toast } from "sonner";

interface UploadingFile {
  id: string;
  fileName: string;
  progress: number;
  status: "uploading" | "processing" | "completed";
}

interface UploadedVideo {
  id: string;
  title: string;
  uploadDate: string;
  status: "processing" | "completed" | "analyzing";
}

const Index = () => {
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [uploadedVideos, setUploadedVideos] = useState<UploadedVideo[]>([]);
  const [detectionDescription, setDetectionDescription] = useState("");

  const handleUpload = (files: File[]) => {
    files.forEach((file) => {
      const id = Math.random().toString(36).substr(2, 9);
      const newUpload: UploadingFile = {
        id,
        fileName: file.name,
        progress: 0,
        status: "uploading",
      };

      setUploadingFiles((prev) => [...prev, newUpload]);
      toast.success(`Started uploading ${file.name}`);

      // Simulate upload progress
      const uploadInterval = setInterval(() => {
        setUploadingFiles((prev) =>
          prev.map((upload) => {
            if (upload.id === id) {
              const newProgress = Math.min(upload.progress + 10, 100);
              const newStatus =
                newProgress === 100
                  ? "processing"
                  : upload.progress >= 50
                  ? "processing"
                  : "uploading";

              return {
                ...upload,
                progress: newProgress,
                status: newStatus,
              };
            }
            return upload;
          })
        );
      }, 500);

      // Complete upload after simulation
      setTimeout(() => {
        clearInterval(uploadInterval);
        setUploadingFiles((prev) =>
          prev.map((upload) =>
            upload.id === id
              ? { ...upload, progress: 100, status: "completed" }
              : upload
          )
        );

        // Add to uploaded videos
        setTimeout(() => {
          const newVideo: UploadedVideo = {
            id,
            title: file.name.replace(/\.[^/.]+$/, ""),
            uploadDate: new Date().toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
            status: "analyzing",
          };

          setUploadedVideos((prev) => [newVideo, ...prev]);
          setUploadingFiles((prev) => prev.filter((upload) => upload.id !== id));
          toast.success("Video uploaded and analysis started!");

          // Simulate analysis completion
          setTimeout(() => {
            setUploadedVideos((prev) =>
              prev.map((video) =>
                video.id === id ? { ...video, status: "completed" } : video
              )
            );
            toast.success("Analysis completed!");
          }, 3000);
        }, 1000);
      }, 5000);
    });
  };

  const handleRefresh = () => {
    toast.info("Refreshing videos...");
    // In a real app, this would fetch from the backend
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <AnimatedBackground />
      <div className="container mx-auto px-4 py-12 max-w-7xl relative z-10">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-3 mb-6">
            <div className="p-3 rounded-xl bg-gradient-to-br from-accent to-primary shadow-lg shadow-primary/30">
              <Video className="w-8 h-8 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-6xl font-bold mb-6 bg-gradient-to-r from-accent via-primary to-accent bg-clip-text text-transparent animate-in" style={{ backgroundSize: "200% auto", animation: "gradient 3s linear infinite" }}>
            Video Upload Center
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Upload your videos for AI-powered analysis. Our advanced models will
            generate action tasks and analyze body language.
          </p>
        </div>

        {/* Detection Description */}
        <div className="mb-8 max-w-3xl mx-auto">
          <label htmlFor="detection-description" className="block text-sm font-medium text-foreground mb-2">
            What would you like to detect?
          </label>
          <div className="space-y-4">
            <Textarea
              id="detection-description"
              placeholder="Specify the body language, gestures, or behaviors you want to analyze. For example: 'Detect hand gestures and facial expressions during presentations', 'Identify posture changes and body positioning', 'Track eye contact patterns and head movements'..."
              value={detectionDescription}
              onChange={(e) => setDetectionDescription(e.target.value)}
              className="min-h-[100px] resize-none"
            />
            <div className="flex justify-end">
              <Button 
                onClick={() => {
                  if (detectionDescription.trim()) {
                    toast.success("Detection preferences saved!");
                  } else {
                    toast.error("Please describe what you want to detect");
                  }
                }}
                className="gap-2"
              >
                <Video className="w-4 h-4" />
                Save Detection Settings
              </Button>
            </div>
          </div>
        </div>

        {/* Upload Zone */}
        <div className="mb-12">
          <VideoUploadZone onUpload={handleUpload} />
        </div>

        {/* Upload Progress */}
        {uploadingFiles.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-semibold mb-6 text-foreground">
              Uploading
            </h2>
            <div className="space-y-4">
              {uploadingFiles.map((file) => (
                <UploadProgress
                  key={file.id}
                  fileName={file.fileName}
                  progress={file.progress}
                  status={file.status}
                />
              ))}
            </div>
          </div>
        )}

        {/* Uploaded Videos */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold text-foreground">
              Uploaded Videos
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
          </div>

          {uploadedVideos.length === 0 ? (
            <div className="bg-card rounded-xl p-12 text-center border border-border shadow-md">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
                <Video className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-foreground">
                No videos yet
              </h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Upload your first video to get started with AI-powered analysis
              </p>
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
    </div>
  );
};

export default Index;