import { useCallback, useState, useRef } from "react";
import { Upload, File as FileIcon, Video, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface VideoUploadZoneProps {
  onUpload: (files: File[]) => void;
}

export const VideoUploadZone = ({ onUpload }: VideoUploadZoneProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);

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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      
      streamRef.current = stream;
      
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        videoPreviewRef.current.play();
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp8,opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const file = new File([blob], `recording-${Date.now()}.webm`, { 
          type: 'video/webm' 
        });
        onUpload([file]);
        
        // Clean up
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = null;
        }
        
        toast.success("Recording saved!");
      };

      mediaRecorder.start();
      setIsRecording(true);
      toast.success("Recording started!");
    } catch (error) {
      toast.error("Could not access camera/microphone");
      console.error("Recording error:", error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Upload Section */}
      <div
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={cn(
          "relative rounded-2xl border-2 border-dashed transition-all duration-300",
          "bg-gradient-to-br from-card to-secondary/30",
          "hover:shadow-lg hover:scale-[1.01]",
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

      {/* Record Section */}
      <div
        className={cn(
          "relative rounded-2xl border-2 border-dashed transition-all duration-300",
          "bg-gradient-to-br from-card to-secondary/30",
          "hover:shadow-lg hover:scale-[1.01]",
          isRecording ? "border-destructive" : "border-border"
        )}
      >
        <div className="flex flex-col items-center justify-center px-6 py-12">
          {!isRecording ? (
            <>
              <div className="mb-4 p-5 rounded-full transition-all duration-300 bg-gradient-to-br from-accent to-primary shadow-lg">
                <Video className="w-10 h-10 text-primary-foreground" />
              </div>

              <h3 className="text-xl font-semibold mb-2 text-foreground">
                Record Video
              </h3>
              <p className="text-muted-foreground mb-4 text-center max-w-xs text-sm">
                Use your camera to record a video
              </p>

              <Button 
                onClick={startRecording}
                className="gap-2"
              >
                <Video className="w-4 h-4" />
                Start Recording
              </Button>
            </>
          ) : (
            <>
              <video
                ref={videoPreviewRef}
                className="w-full max-w-xs rounded-lg mb-4"
                muted
              />
              
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 bg-destructive rounded-full animate-pulse" />
                <span className="text-sm font-medium text-foreground">Recording...</span>
              </div>

              <Button 
                onClick={stopRecording}
                variant="destructive"
                className="gap-2 mt-2"
              >
                <Square className="w-4 h-4" />
                Stop Recording
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
