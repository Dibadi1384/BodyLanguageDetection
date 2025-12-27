import { useCallback, useState } from "react";
import { Upload, File as FileIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoUploadZoneProps {
  onUpload: (files: File[]) => void;
}

export const VideoUploadZone = ({ onUpload }: VideoUploadZoneProps) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files).filter((file) =>
        file.type.startsWith("video/")
      );

      if (files.length > 0) {
        onUpload(files);
      }
    },
    [onUpload]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      if (files.length > 0) {
        onUpload(files);
      }
    },
    [onUpload]
  );

  return (
    <>
      {/* Upload Section */}
      <div
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={cn(
          "relative rounded-2xl border-2 border-dashed transition-all duration-300",
          "bg-gradient-to-br from-card to-secondary/30",
          "hover:shadow-lg hover:scale-[1.01] hover:border-primary",
          "w-full",
          isDragging
            ? "border-primary bg-primary/5 shadow-xl scale-[1.02]"
            : "border-border"
        )}
      >
        <label
          htmlFor="video-upload"
          className="flex flex-col items-center justify-center px-6 py-12 cursor-pointer"
        >
          <div
            className={cn(
              "mb-4 p-5 rounded-full transition-all duration-300",
              "bg-gradient-to-br from-primary to-accent shadow-lg",
              isDragging ? "scale-110 rotate-12" : "scale-100"
            )}
          >
            <Upload className="w-10 h-10 text-primary-foreground" />
          </div>

          <h3 className="text-xl font-semibold mb-2 text-foreground">
            Upload Video
          </h3>
          <p className="text-muted-foreground mb-2 text-center max-w-xs text-sm">
            Drop files here or click to browse
          </p>
          <p className="text-xs text-muted-foreground/70">
            MP4, AVI, MOV, WebM, MKV
          </p>

          <input
            id="video-upload"
            type="file"
            multiple
            accept="video/*"
            className="hidden"
            onChange={handleFileInput}
          />
        </label>

        {isDragging && (
          <div className="absolute inset-0 rounded-2xl bg-primary/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <FileIcon className="w-12 h-12 text-primary mx-auto mb-2 animate-bounce" />
              <p className="text-base font-medium text-primary">Release to upload</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
};
