/**
 * Data mappers for transforming backend API responses to frontend format
 */

// Get API base URL from environment or use relative path for proxy
const getApiBase = () => {
  const viteApi = ((import.meta as any).env?.VITE_API_URL as string) || '';
  return viteApi ? viteApi.replace(/\/$/, '') : '';
};

// Convert backend paths to public URLs
const toPublicUrl = (p?: string | null): string | undefined => {
  if (!p) return undefined;
  const apiBase = getApiBase();
  const norm = p.replace(/\\/g, '/');
  
  // Check for absolute paths containing Backend directory structure
  const uploadsIdx = norm.indexOf('/Backend/uploads/');
  const workIdx = norm.indexOf('/Backend/work/');
  
  if (uploadsIdx !== -1) {
    const sub = norm.substring(uploadsIdx + '/Backend/uploads/'.length);
    return apiBase ? `${apiBase}/uploads/${sub}` : `/uploads/${sub}`;
  }
  if (workIdx !== -1) {
    const sub = norm.substring(workIdx + '/Backend/work/'.length);
    return apiBase ? `${apiBase}/work/${sub}` : `/work/${sub}`;
  }
  
  // Check for paths that might be relative to work directory (just filename)
  // If it ends with _detections.json or _annotated.mp4, assume it's in work directory
  if (norm.endsWith('_detections.json') || norm.endsWith('_annotated.mp4')) {
    const filename = norm.split('/').pop() || norm.split('\\').pop() || norm;
    return apiBase ? `${apiBase}/work/${filename}` : `/work/${filename}`;
  }
  
  // Already relative paths
  if (norm.startsWith('/uploads/') || norm.startsWith('/work/')) return norm;
  
  // If path contains 'work' directory (case-insensitive), try to extract filename
  const workMatch = norm.match(/[\/\\]work[\/\\]([^\/\\]+)$/i);
  if (workMatch) {
    return apiBase ? `${apiBase}/work/${workMatch[1]}` : `/work/${workMatch[1]}`;
  }
  
  // Handle paths that might be in Backend/work but with different structure
  // e.g., "C:\Users\...\BodyLanguageDetection\Backend\work\video-xxx_annotated.mp4"
  const backendWorkMatch = norm.match(/[\/\\]Backend[\/\\]work[\/\\]([^\/\\]+)$/i);
  if (backendWorkMatch) {
    return apiBase ? `${apiBase}/work/${backendWorkMatch[1]}` : `/work/${backendWorkMatch[1]}`;
  }
  
  return undefined;
};

// Backend detection format
interface BackendBoundingBox {
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
}

interface BackendPerson {
  person_id: number;
  bbox: BackendBoundingBox;
  bbox_confidence: number;
  analysis_result: Record<string, any>;
  visual_description: string;
}

interface BackendFrameDetection {
  frame_index: number;
  frame_filename: string;
  timestamp_s: number;
  image_width: number;
  image_height: number;
  people_detected: number;
  people: BackendPerson[];
}

interface BackendDetectionsData {
  video_info: {
    video_path: string;
    video_stem: string;
    fps: number;
    total_frames: number;
  };
  task_description: string;
  frame_detections: BackendFrameDetection[];
}

interface BackendStatusData {
  status: string;
  videoPath?: string;
  detectionsPath?: string | null;
  annotatedVideoPath?: string | null;
  taskDescription?: string;
  refinedTask?: string;
  error?: string;
  createdAt?: string;
  completedAt?: string;
}

// Frontend data format expected by Results.tsx
export interface Detection {
  id: string;
  timestamp: number;
  label: string;
  confidence: number;
  duration: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  personId?: number;
}

export interface PersonStat {
  personId: number;
  frameCount: number;
  avgConfidence: number;
  timeRange: {
    firstSeen: number;
    lastSeen: number;
  };
  labels: Record<string, number>; // label -> count
  primaryLabel: string;
}

export interface PersonDetection {
  personId: number;
  timestamp: number;
  frameIndex: number;
  label: string;
  confidence: number;
  analysisResult: Record<string, any>;
  bbox: BackendBoundingBox;
}

export interface Segment {
  startTime: number;
  endTime: number;
  primaryDetection: string;
  detectionCount: number;
}

export interface AnalysisSummary {
  totalDetections: number;
  avgConfidence: number;
  totalPeopleDetected: number;
}

export interface FrontendAnalysisData {
  videoTitle: string;
  videoDuration: number;
  videoWidth: number;
  videoHeight: number;
  fps: number;
  annotatedVideoUrl?: string;
  detectionsUrl?: string;
  detections: Detection[];
  segments: Segment[];
  summary: AnalysisSummary;
  peopleStats: PersonStat[];
  personDetections: PersonDetection[]; // All detections grouped by person and frame
}

/**
 * Fetch and transform analysis data from backend
 */
export async function fetchAnalysisData(videoStem: string): Promise<FrontendAnalysisData> {
  const apiBase = getApiBase();
  
  // First, fetch the status to get paths
  const statusUrl = apiBase ? `${apiBase}/status/${encodeURIComponent(videoStem)}` : `/status/${encodeURIComponent(videoStem)}`;
  console.log('[fetchAnalysisData] Fetching status from:', statusUrl);
  const statusResp = await fetch(statusUrl);
  
  if (!statusResp.ok) {
    throw new Error(`Failed to fetch status: ${statusResp.statusText}`);
  }
  
  const statusData: BackendStatusData = await statusResp.json();
  console.log('[fetchAnalysisData] Status data:', statusData);
  
  if (statusData.status !== 'completed') {
    throw new Error(`Analysis not completed. Status: ${statusData.status}`);
  }
  
  // Debug: Print annotated video path from status
  console.log('[fetchAnalysisData] DEBUG - Annotated video path from status:', statusData.annotatedVideoPath);
  console.log('[fetchAnalysisData] DEBUG - Video stem used for construction:', videoStem);
  console.log('[fetchAnalysisData] DEBUG - Expected annotated filename:', `${videoStem}_annotated.mp4`);
  
  // Get the public URLs - use actual paths from status, not constructed ones
  const detectionsUrl = toPublicUrl(statusData.detectionsPath);
  const annotatedVideoUrl = toPublicUrl(statusData.annotatedVideoPath);
  
  // Fallback: if toPublicUrl didn't work, try constructing from videoStem
  const finalAnnotatedVideoUrl = annotatedVideoUrl || (apiBase 
    ? `${apiBase}/work/${videoStem}_annotated.mp4`
    : `/work/${videoStem}_annotated.mp4`);
  
  console.log('[fetchAnalysisData] Detections URL:', detectionsUrl);
  console.log('[fetchAnalysisData] Annotated video URL (from status):', annotatedVideoUrl);
  console.log('[fetchAnalysisData] Annotated video URL (final):', finalAnnotatedVideoUrl);
  console.log('[fetchAnalysisData] Video stem:', videoStem);
  console.log('[fetchAnalysisData] Original paths - detections:', statusData.detectionsPath);
  console.log('[fetchAnalysisData] Annotated video path from status:', statusData.annotatedVideoPath);
  
  // Fetch the detections JSON
  if (!detectionsUrl) {
    throw new Error('No detections data available');
  }
  
  const detectionsResp = await fetch(detectionsUrl);
  if (!detectionsResp.ok) {
    throw new Error(`Failed to fetch detections: ${detectionsResp.statusText}`);
  }
  
  const detectionsData: BackendDetectionsData = await detectionsResp.json();
  console.log('[fetchAnalysisData] Detections data loaded:', {
    frameCount: detectionsData.frame_detections?.length || 0,
    totalFrames: detectionsData.video_info?.total_frames || 0
  });
  
  // Transform to frontend format
  const transformed = transformDetectionsData(detectionsData, finalAnnotatedVideoUrl, detectionsUrl, videoStem);
  console.log('[fetchAnalysisData] Transformed data:', {
    detectionsCount: transformed.detections.length,
    segmentsCount: transformed.segments.length,
    hasAnnotatedVideo: !!transformed.annotatedVideoUrl
  });
  
  return transformed;
}

/**
 * Transform backend detections to frontend format
 */
function transformDetectionsData(
  data: BackendDetectionsData,
  annotatedVideoUrl?: string,
  detectionsUrl?: string,
  videoStem?: string
): FrontendAnalysisData {
  const frameDetections = data.frame_detections || [];
  
  // Get detection_key from data (stored in detections.json)
  // If detection_key is explicitly set, use it; otherwise use null to indicate "find most confident"
  const detectionKey = (data as any).detection_key || null;
  
  // Get video dimensions from first frame detection
  const firstFrame = frameDetections[0];
  const videoWidth = firstFrame?.image_width || 1920;
  const videoHeight = firstFrame?.image_height || 1080;
  
  // Calculate duration from actual video total frames
  const fps = data.video_info?.fps || 30;
  const totalFrames = data.video_info?.total_frames || 0;
  const videoDuration = totalFrames > 0 && fps > 0 ? totalFrames / fps : 0;
  
  // Transform detections and track people
  const detections: Detection[] = [];
  const personDetections: PersonDetection[] = [];
  const peopleMap = new Map<number, {
    timestamps: number[];
    confidences: number[];
    labels: Record<string, number>;
  }>();
  let detectionId = 0;
  
  for (const frame of frameDetections) {
    if (!frame || !frame.people || !Array.isArray(frame.people)) continue;
    
    // Calculate timestamp from frame_index if timestamp_s is null
    const frameIndex = frame.frame_index ?? 0;
    const timestamp = frame.timestamp_s ?? (frameIndex / fps);
    
    for (const person of frame.people) {
      if (!person) continue;
      
      const personId = person.person_id ?? -1;
      
      // Extract primary label from analysis_result using the selected detection key
      const analysisResult = person.analysis_result || {};
      // Pass null if no key selected (will find most confident), otherwise pass the key
      const label = extractLabel(analysisResult, detectionKey) || `Person ${personId}`;
      const confidence = (person.bbox_confidence ?? 0) * 100;
      
      // Track person stats
      if (!peopleMap.has(personId)) {
        peopleMap.set(personId, {
          timestamps: [],
          confidences: [],
          labels: {},
        });
      }
      const personData = peopleMap.get(personId)!;
      personData.timestamps.push(timestamp);
      personData.confidences.push(confidence);
      personData.labels[label] = (personData.labels[label] || 0) + 1;
      
      // Ensure bbox exists and has valid values
      const bbox: BackendBoundingBox = person.bbox || { x_min: 0, y_min: 0, x_max: 0, y_max: 0 };
      const xMin = bbox.x_min ?? 0;
      const yMin = bbox.y_min ?? 0;
      const xMax = bbox.x_max ?? 0;
      const yMax = bbox.y_max ?? 0;
      
      detections.push({
        id: `detection-${detectionId++}`,
        timestamp,
        label,
        confidence,
        duration: 1 / fps, // Duration until next frame
        personId,
        boundingBox: {
          x: xMin,
          y: yMin,
          width: Math.max(0, xMax - xMin),
          height: Math.max(0, yMax - yMin),
        },
      });
      
      personDetections.push({
        personId,
        timestamp,
        frameIndex,
        label,
        confidence,
        analysisResult,
        bbox: bbox as BackendBoundingBox,
      });
    }
  }
  
  // Generate people stats
  const peopleStats: PersonStat[] = Array.from(peopleMap.entries()).map(([personId, data]) => {
    const timestamps = data.timestamps.sort((a, b) => a - b);
    const avgConfidence = data.confidences.length > 0
      ? data.confidences.reduce((sum, c) => sum + c, 0) / data.confidences.length
      : 0;
    
    // Find primary label
    const primaryLabel = Object.entries(data.labels)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';
    
    return {
      personId,
      frameCount: data.confidences.length,
      avgConfidence: Math.round(avgConfidence),
      timeRange: {
        firstSeen: timestamps[0] ?? 0,
        lastSeen: timestamps[timestamps.length - 1] ?? 0,
      },
      labels: data.labels,
      primaryLabel,
    };
  });
  
  // Sort people stats by person ID
  peopleStats.sort((a, b) => a.personId - b.personId);
  
  // Generate segments from frame detections
  const segments: Segment[] = generateSegments(frameDetections, fps, detectionKey);
  
  // Calculate summary
  const totalDetections = detections.length;
  const avgConfidence = totalDetections > 0
    ? Math.round(detections.reduce((sum, d) => sum + d.confidence, 0) / totalDetections)
    : 0;
  const totalPeopleDetected = peopleMap.size;
  
  return {
    videoTitle: videoStem || data.video_info?.video_stem || 'Video Analysis',
    videoDuration,
    videoWidth,
    videoHeight,
    fps,
    annotatedVideoUrl,
    detectionsUrl,
    detections,
    segments,
    summary: {
      totalDetections,
      avgConfidence,
      totalPeopleDetected,
    },
    peopleStats,
    personDetections,
  };
}

/**
 * Extract a string value from a value that might be a string, number, or object
 */
function extractStringValue(value: any, key: string): string | null {
  if (!value) return null;
  
  // If it's already a string or number, return it as string
  if (typeof value === 'string' && value) {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  
  // If it's an object, try to extract the actual value
  if (typeof value === 'object' && value !== null) {
    // Try the same key name first (e.g., emotion.emotion)
    if (key in value && typeof value[key] === 'string' && value[key]) {
      return value[key];
    }
    // Try common property names
    if ('value' in value && typeof value.value === 'string' && value.value) {
      return value.value;
    }
    if ('name' in value && typeof value.name === 'string' && value.name) {
      return value.name;
    }
    // Try to find any string property (excluding metadata fields)
    for (const [propKey, propValue] of Object.entries(value)) {
      if (typeof propValue === 'string' && propValue && 
          !['confidence', 'intensity', 'score'].includes(propKey.toLowerCase())) {
        return propValue;
      }
    }
  }
  
  return null;
}

/**
 * Check if a key represents an emotion (common emotion names)
 */
function isEmotionKey(key: string): boolean {
  const emotionKeys = [
    'emotion', 'anger', 'angry', 'happy', 'happiness', 'sad', 'sadness',
    'fear', 'surprise', 'disgust', 'neutral', 'joy', 'excitement',
    'calm', 'anxious', 'frustrated', 'confused', 'pleased', 'disappointed'
  ];
  return emotionKeys.includes(key.toLowerCase());
}

/**
 * Get confidence score from a value (handles different formats)
 */
function getConfidenceScore(value: any, key: string): number {
  // If value is a number, use it as confidence
  if (typeof value === 'number') {
    return value;
  }
  
  // If value is an object, check for confidence fields
  if (typeof value === 'object' && value !== null) {
    // Check for explicit confidence field
    if ('confidence' in value && typeof value.confidence === 'number') {
      return value.confidence;
    }
    if ('score' in value && typeof value.score === 'number') {
      return value.score;
    }
    // If object has the key itself as a number (e.g., {anger: 0.9})
    if (key in value && typeof value[key] === 'number') {
      return value[key];
    }
  }
  
  // Default confidence for string values (lower priority)
  if (typeof value === 'string' && value) {
    return 0.5;
  }
  
  return 0;
}

/**
 * Find the most confident detection across all keys in analysis_result
 */
function findMostConfidentDetection(analysisResult: Record<string, any>): { key: string; value: any; confidence: number } | null {
  let maxConfidence = -1;
  let bestKey: string | null = null;
  let bestValue: any = null;
  
  // Skip metadata keys
  const skipKeys = ['confidence', 'intensity', 'score'];
  
  for (const [key, value] of Object.entries(analysisResult)) {
    if (skipKeys.includes(key.toLowerCase())) {
      continue;
    }
    
    const confidence = getConfidenceScore(value, key);
    
    // Only consider if we can extract a meaningful string value
    const extracted = extractStringValue(value, key);
    if (extracted && confidence > maxConfidence) {
      maxConfidence = confidence;
      bestKey = key;
      bestValue = value;
    }
  }
  
  if (bestKey && maxConfidence >= 0) {
    return { key: bestKey, value: bestValue, confidence: maxConfidence };
  }
  
  return null;
}

/**
 * Extract a human-readable label from analysis_result, prioritizing the selected detection key
 * If no key is selected (null), prioritize the most confident detection
 */
function extractLabel(analysisResult: Record<string, any>, detectionKey: string | null = null): string {
  // If user explicitly selected a key, prioritize it
  if (detectionKey && detectionKey in analysisResult && analysisResult[detectionKey]) {
    const extracted = extractStringValue(analysisResult[detectionKey], detectionKey);
    if (extracted) {
      return `${capitalize(detectionKey)}: ${extracted}`;
    }
  }
  
  // If no explicit key or key not found, find the most confident detection
  const mostConfident = findMostConfidentDetection(analysisResult);
  if (mostConfident) {
    const extracted = extractStringValue(mostConfident.value, mostConfident.key);
    if (extracted) {
      return `${capitalize(mostConfident.key)}: ${extracted}`;
    }
  }
  
  // Fallback: try common fields in order
  if (analysisResult.emotion) {
    const extracted = extractStringValue(analysisResult.emotion, 'emotion');
    if (extracted) {
      return `Emotion: ${extracted}`;
    }
  }
  if (analysisResult.action) {
    const extracted = extractStringValue(analysisResult.action, 'action');
    if (extracted) {
      return `Action: ${extracted}`;
    }
  }
  if (analysisResult.expression) {
    const extracted = extractStringValue(analysisResult.expression, 'expression');
    if (extracted) {
      return `Expression: ${extracted}`;
    }
  }
  if (analysisResult.pose) {
    const extracted = extractStringValue(analysisResult.pose, 'pose');
    if (extracted) {
      return `Pose: ${extracted}`;
    }
  }
  
  // Last resort: find any key with a string value
  for (const [key, value] of Object.entries(analysisResult)) {
    if (key !== 'confidence') {
      const extracted = extractStringValue(value, key);
      if (extracted) {
        return `${capitalize(key)}: ${extracted}`;
      }
    }
  }
  
  return 'Person Detected';
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ');
}

/**
 * Generate time-based segments from frame detections
 */
function generateSegments(frameDetections: BackendFrameDetection[], fps: number, detectionKey: string | null = null): Segment[] {
  if (frameDetections.length === 0) return [];
  
  const segments: Segment[] = [];
  const segmentDuration = 5; // Group into 5-second segments
  
  let currentSegmentStart = 0;
  let currentSegmentDetections: BackendFrameDetection[] = [];
  
  for (const frame of frameDetections) {
    const segmentIndex = Math.floor(frame.timestamp_s / segmentDuration);
    const segmentStart = segmentIndex * segmentDuration;
    
    if (segmentStart !== currentSegmentStart && currentSegmentDetections.length > 0) {
      // Finalize previous segment
      segments.push(createSegment(currentSegmentStart, currentSegmentDetections, segmentDuration, detectionKey));
      currentSegmentDetections = [];
    }
    
    currentSegmentStart = segmentStart;
    currentSegmentDetections.push(frame);
  }
  
  // Add final segment
  if (currentSegmentDetections.length > 0) {
    segments.push(createSegment(currentSegmentStart, currentSegmentDetections, segmentDuration, detectionKey));
  }
  
  return segments;
}

function createSegment(startTime: number, frames: BackendFrameDetection[], duration: number, detectionKey: string | null = null): Segment {
  const totalPeople = frames.reduce((sum, f) => sum + f.people_detected, 0);
  
  // Find most common label across frames
  const labelCounts: Record<string, number> = {};
  for (const frame of frames) {
    for (const person of frame.people) {
      const label = extractLabel(person.analysis_result, detectionKey);
      labelCounts[label] = (labelCounts[label] || 0) + 1;
    }
  }
  
  const primaryDetection = Object.entries(labelCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'No detections';
  
  return {
    startTime,
    endTime: startTime + duration,
    primaryDetection,
    detectionCount: totalPeople,
  };
}

