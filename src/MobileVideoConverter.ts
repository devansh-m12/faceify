// Use require for fluent-ffmpeg since its types are CommonJS style
import * as fs from 'fs';
import * as path from 'path';

// Import canvas with type assertions to work with face-api.js
import * as canvas from 'canvas';
// Import face-api.js using require to avoid TypeScript errors
// @ts-ignore
const faceapi = require('face-api.js');

// Import ffmpeg using require to match its CommonJS style module
const ffmpeg = require('fluent-ffmpeg');

// Initialize face-api.js
let modelsLoaded = false;
async function loadFaceDetectionModels() {
  if (modelsLoaded) return;
  
  // Register the canvas implementation with face-api.js
  const { Canvas, Image, ImageData } = canvas;
  // @ts-ignore - Ignore type errors when monkey patching
  faceapi.env.monkeyPatch({ Canvas, Image, ImageData });
  
  // Check if models directory exists and create it if needed
  const modelsDir = path.join(__dirname, '../models');
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
  }
  
  // Download models if they don't exist
  const modelPath = path.join(modelsDir, 'tiny_face_detector_model-weights_manifest.json');
  if (!fs.existsSync(modelPath)) {
    console.log('Downloading face detection models...');
    // Copy models from node_modules to models directory
    await downloadTinyFaceDetectorModel(modelsDir);
  }
  
  try {
    // Load tiny face detector model
    await faceapi.nets.tinyFaceDetector.loadFromDisk(modelsDir);
    modelsLoaded = true;
    console.log('Face detection models loaded successfully');
  } catch (error) {
    console.error('Error loading face detection models:', error);
    throw error;
  }
}

// Function to download the tiny face detector model
async function downloadTinyFaceDetectorModel(targetDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const modelUrl = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/tiny_face_detector_model-weights_manifest.json';
    // Using node's HTTP(S) request to download the model manifest
    const https = require('https');
    const http = require('http');
    
    // Download using the appropriate protocol
    const client = modelUrl.startsWith('https') ? https : http;
    
    client.get(modelUrl, (res: any) => {
      let data = '';
      res.on('data', (chunk: any) => { data += chunk; });
      res.on('end', () => {
        try {
          // Parse the manifest
          const manifest = JSON.parse(data);
          const weightsUrls = manifest.map((entry: any) => 
            `https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/${entry.paths[0]}`
          );
          
          // Save the manifest
          fs.writeFileSync(path.join(targetDir, 'tiny_face_detector_model-weights_manifest.json'), data);
          
          // Download each weight file
          let downloaded = 0;
          weightsUrls.forEach((url: string) => {
            const fileName = url.split('/').pop();
            const file = fs.createWriteStream(path.join(targetDir, fileName as string));
            
            client.get(url, (res: any) => {
              res.pipe(file);
              file.on('finish', () => {
                file.close();
                downloaded++;
                if (downloaded === weightsUrls.length) {
                  console.log('Models downloaded successfully');
                  resolve();
                }
              });
            }).on('error', (err: any) => {
              fs.unlink(path.join(targetDir, fileName as string), () => {});
              reject(err);
            });
          });
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', (err: any) => {
      reject(err);
    });
  });
}

export interface VideoConverterOptions {
  outputDirectory?: string;
  targetWidth?: number;
  targetHeight?: number;
  detectFaces?: boolean;
}

export interface ConversionResult {
  originalPath: string;
  convertedPath: string;
  faces?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

export class MobileVideoConverter {
  private options: Required<VideoConverterOptions>;

  constructor(options: VideoConverterOptions = {}) {
    this.options = {
      outputDirectory: options.outputDirectory || path.resolve('./converted-videos'),
      targetWidth: options.targetWidth || 1080,
      targetHeight: options.targetHeight || 1920,
      detectFaces: options.detectFaces ?? true
    };

    // Ensure output directory exists
    if (!fs.existsSync(this.options.outputDirectory)) {
      fs.mkdirSync(this.options.outputDirectory, { recursive: true });
    }
    
    // Also create segments directory in advance
    const segmentsDir = path.join(this.options.outputDirectory, 'segments');
    if (!fs.existsSync(segmentsDir)) {
      fs.mkdirSync(segmentsDir, { recursive: true });
    }
  }

  async convertVideo(inputPath: string): Promise<ConversionResult> {
    // Validate input file exists
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file not found: ${inputPath}`);
    }

    // Get video information first to determine correct crop dimensions
    const videoInfo = await this.getVideoInfo(inputPath);
    console.log('Video dimensions:', videoInfo);

    // Detect faces if option is enabled
    let faceTimeline: Array<{
      timestamp: number, 
      faces: Array<{x: number, y: number, width: number, height: number}>
    }> | undefined;
    
    if (this.options.detectFaces) {
      try {
        // Detect faces at multiple timestamps throughout the video
        faceTimeline = await this.detectFacesAcrossTimeline(inputPath, videoInfo.duration);
        console.log('Face timeline detected:', faceTimeline);
      } catch (error) {
        console.error("Face detection failed, continuing without face detection:", error);
        // Continue without face detection
      }
    }

    // Generate output filename
    const outputFilename = `mobile_${path.basename(inputPath)}`;
    const outputPath = path.join(this.options.outputDirectory, outputFilename);

    // Process video with dynamic cropping based on detected faces
    await this.processVideoWithDynamicCropping(inputPath, outputPath, faceTimeline, videoInfo);

    // Return the faces from the first timestamp for backward compatibility
    const firstFaces = faceTimeline && faceTimeline.length > 0 ? faceTimeline[0].faces : undefined;

    return {
      originalPath: inputPath,
      convertedPath: outputPath,
      faces: firstFaces
    };
  }

  // Get video information using ffmpeg
  private getVideoInfo(videoPath: string): Promise<{ width: number, height: number, duration: number }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err: Error, metadata: any) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Find video stream
        const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');
        
        if (!videoStream) {
          reject(new Error('No video stream found'));
          return;
        }
        
        // Get duration from format section if not in video stream
        const duration = videoStream.duration 
          ? parseFloat(videoStream.duration) 
          : (metadata.format.duration ? parseFloat(metadata.format.duration) : 0);
        
        resolve({
          width: videoStream.width,
          height: videoStream.height,
          duration: duration
        });
      });
    });
  }

  // Detect faces across multiple timestamps in the video
  private async detectFacesAcrossTimeline(
    videoPath: string, 
    duration: number
  ): Promise<Array<{timestamp: number, faces: Array<{x: number, y: number, width: number, height: number}>}>> {
    // Create a timeline of face detections
    const faceTimeline: Array<{
      timestamp: number, 
      faces: Array<{x: number, y: number, width: number, height: number}>
    }> = [];
    
    try {
      // Create temp directory for frames
      const frameOutputDir = path.join(this.options.outputDirectory, 'frames');
      if (!fs.existsSync(frameOutputDir)) {
        fs.mkdirSync(frameOutputDir, { recursive: true });
      }
      
      // Load face detection models
      await loadFaceDetectionModels();
      
      console.log('Detecting scene changes and key frames...');
      
      // Step 1: Detect scene changes using FFmpeg's scene detection
      const sceneChangeTimestamps = await this.detectSceneChanges(videoPath, duration);
      
      // Step 2: Add start and end frame timestamps
      const keyTimestamps = new Set<number>([
        0.5, // Start with a frame slightly after the beginning
        ...sceneChangeTimestamps,
        Math.max(0.5, duration - 2) // End with a frame slightly before the end
      ]);
      
      // Step 3: If we have too few timestamps, add some evenly distributed ones
      const minSamples = 5;
      if (keyTimestamps.size < minSamples) {
        const additionalSamples = minSamples - keyTimestamps.size;
        for (let i = 1; i <= additionalSamples; i++) {
          keyTimestamps.add(duration * i / (additionalSamples + 1));
        }
      }
      
      // Step 4: Ensure we don't have too many (for performance reasons)
      const maxSamples = 25;
      let timestamps = Array.from(keyTimestamps).sort((a, b) => a - b);
      if (timestamps.length > maxSamples) {
        // If we have too many, sample evenly
        const step = timestamps.length / maxSamples;
        const sampledTimestamps = [];
        for (let i = 0; i < timestamps.length; i += step) {
          sampledTimestamps.push(timestamps[Math.floor(i)]);
        }
        // Always include the first and last timestamps
        if (!sampledTimestamps.includes(timestamps[0])) {
          sampledTimestamps.unshift(timestamps[0]);
        }
        if (!sampledTimestamps.includes(timestamps[timestamps.length - 1])) {
          sampledTimestamps.push(timestamps[timestamps.length - 1]);
        }
        timestamps = sampledTimestamps.sort((a, b) => a - b);
      }
      
      console.log(`Analyzing ${timestamps.length} key frames across ${duration} seconds of video...`);
      
      // Sample frames at the detected timestamps
      for (let i = 0; i < timestamps.length; i++) {
        const timestamp = timestamps[i];
        
        // Extract frame at this timestamp
        const framePath = path.join(frameOutputDir, `frame_${Date.now()}_${i}.jpg`);
        
        // Format timestamp for ffmpeg
        const timestampStr = this.formatTimestamp(timestamp);
        
        // Extract the frame
        await new Promise<void>((resolve, reject) => {
          ffmpeg(videoPath)
            .outputOptions(['-vframes 1', `-ss ${timestampStr}`])
            .output(framePath)
            .on('end', () => resolve())
            .on('error', (err: Error) => reject(err))
            .run();
        });
        
        // Detect faces in this frame
        const faces = await this.detectFacesInFrame(framePath);
        
        // Add to timeline
        faceTimeline.push({
          timestamp,
          faces
        });
        
        // Clean up the temporary frame file
        fs.unlinkSync(framePath);
      }
      
      // Post-process the timeline to handle segments with no faces detected
      const videoInfo = {
        width: 0,
        height: 0,
        duration: duration
      };
      this.postProcessFaceTimeline(faceTimeline, videoInfo);
      
      return faceTimeline;
    } catch (error) {
      console.error('Face timeline detection error:', error);
      return []; // Return empty array if detection fails
    }
  }

  // Detect scene changes using FFmpeg's scene detection
  private async detectSceneChanges(
    videoPath: string,
    duration: number
  ): Promise<number[]> {
    return new Promise((resolve, reject) => {
      // Use a more reliable approach with scene filter and extracting frame data
      console.log('Analyzing video content for scene changes...');
      
      // Create temporary directory for scene detection frames
      const tempDir = path.join(this.options.outputDirectory, 'scene_detection');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Extract scene detection data using FFmpeg with a more sensitive threshold
      const sceneDetectionProcess = ffmpeg(videoPath)
        .outputOptions([
          '-vf', `select='gt(scene,0.20)',showinfo`, // Lower threshold to catch more scene changes
          '-vsync', '0',
          '-f', 'null'
        ])
        .output('/dev/null');
      
      let ffmpegOutput = '';
      
      sceneDetectionProcess
        .on('stderr', (stderr: string) => {
          ffmpegOutput += stderr;
        })
        .on('end', () => {
          try {
            // Parse the output to extract timestamps from the showinfo filter
            const timestampRegex = /pts_time:([\d.]+)/g;
            const rawTimestamps: number[] = [];
            let match;
            
            while ((match = timestampRegex.exec(ffmpegOutput)) !== null) {
              rawTimestamps.push(parseFloat(match[1]));
            }
            
            console.log(`Found ${rawTimestamps.length} raw scene change candidates`);
            
            // Filter out timestamps that are too close to each other
            let lastTimestamp = 0;
            const filteredTimestamps = rawTimestamps
              .sort((a, b) => a - b)
              .filter(ts => {
                // Ensure at least 3 seconds between scene changes
                const shouldKeep = ts - lastTimestamp >= 3;
                if (shouldKeep) lastTimestamp = ts;
                return shouldKeep;
              });
            
            console.log(`Filtered to ${filteredTimestamps.length} scene changes after removing closely spaced frames`);
            
            // If we found enough scene changes, use them
            if (filteredTimestamps.length >= 3) {
              // Add beginning and end points if needed
              const finalTimestamps = [...filteredTimestamps];
              
              if (finalTimestamps[0] > 5) {
                finalTimestamps.unshift(0.5);
                console.log('Added timestamp at beginning of video (0.5s)');
              }
              
              if (finalTimestamps[finalTimestamps.length - 1] < duration - 5) {
                finalTimestamps.push(duration - 2);
                console.log(`Added timestamp at end of video (${duration - 2}s)`);
              }
              
              // For long sections without scene changes, add intermediate points
              const maxGap = 30; // Maximum gap in seconds between timestamps
              const intermediatePoints: number[] = [];
              
              for (let i = 0; i < finalTimestamps.length - 1; i++) {
                const current = finalTimestamps[i];
                const next = finalTimestamps[i + 1];
                const gap = next - current;
                
                if (gap > maxGap) {
                  const numIntermediatePoints = Math.floor(gap / maxGap);
                  const stepSize = gap / (numIntermediatePoints + 1);
                  
                  for (let j = 1; j <= numIntermediatePoints; j++) {
                    const intermediateTime = current + (j * stepSize);
                    intermediatePoints.push(intermediateTime);
                    console.log(`Added intermediate timestamp at ${intermediateTime.toFixed(2)}s (gap was ${gap.toFixed(2)}s)`);
                  }
                }
              }
              
              const allTimestamps = [...finalTimestamps, ...intermediatePoints].sort((a, b) => a - b);
              console.log(`Final timeline has ${allTimestamps.length} key points for analysis`);
              resolve(allTimestamps);
            } else {
              // Fall back to time-based sampling but include any detected scenes
              console.log('Not enough scene changes detected, combining with time-based sampling');
              const timeBasedSamples = this.fallbackToTimeSampling(duration);
              const combinedSamples = [...new Set([...filteredTimestamps, ...timeBasedSamples])];
              combinedSamples.sort((a, b) => a - b);
              console.log(`Combined with time-based sampling, using ${combinedSamples.length} samples`);
              resolve(combinedSamples);
            }
          } catch (error) {
            console.error('Error processing scene detection data:', error);
            resolve(this.fallbackToTimeSampling(duration));
          }
        })
        .on('error', (err: Error) => {
          console.error('FFmpeg scene detection failed:', err.message);
          resolve(this.fallbackToTimeSampling(duration));
        })
        .run();
    });
  }
  
  // Helper method for time-based sampling fallback
  private fallbackToTimeSampling(duration: number): number[] {
    console.log('Using time-based sampling fallback');
    const samples = [];
    const everyNSeconds = 15; // One sample every 15 seconds
    
    // Start with the beginning of the video
    samples.push(0.5);
    
    // Add regular interval samples
    for (let time = everyNSeconds; time < duration - 5; time += everyNSeconds) {
      samples.push(time);
    }
    
    // Add the end of the video
    if (samples[samples.length - 1] < duration - 5) {
      samples.push(duration - 2);
    }
    
    return samples;
  }

  // Post-process the face timeline to fill in gaps and smooth transitions
  private postProcessFaceTimeline(
    faceTimeline: Array<{timestamp: number, faces: Array<{x: number, y: number, width: number, height: number}>}>,
    videoInfo?: { width: number, height: number, duration: number }
  ): void {
    if (!videoInfo) return;
    
    // If we have no timeline points or all points have faces, we're done
    if (faceTimeline.length === 0 || faceTimeline.every(point => point.faces.length > 0)) {
      return;
    }
    
    console.log('Post-processing face timeline to fill gaps and smooth transitions...');
    
    // Find the most reliable face detection points (those with faces)
    const reliablePoints = faceTimeline.filter(point => point.faces.length > 0);
    
    // If we don't have any reliable points, we can't do much
    if (reliablePoints.length === 0) {
      return;
    }
    
    // For each point with no faces, interpolate or extrapolate from nearby reliable points
    for (const point of faceTimeline) {
      if (point.faces.length > 0) continue; // Skip points that already have faces
      
      // Find the closest reliable points before and after this timestamp
      const before = [...reliablePoints]
        .filter(p => p.timestamp < point.timestamp)
        .sort((a, b) => b.timestamp - a.timestamp)[0]; // Closest earlier point
        
      const after = [...reliablePoints]
        .filter(p => p.timestamp > point.timestamp)
        .sort((a, b) => a.timestamp - b.timestamp)[0]; // Closest later point
      
      // If we have points before and after, interpolate
      if (before && after) {
        const totalInterval = after.timestamp - before.timestamp;
        const pointPosition = (point.timestamp - before.timestamp) / totalInterval;
        
        // Get the first face from each reference point (assuming it's the most important)
        const faceBefore = before.faces[0];
        const faceAfter = after.faces[0];
        
        // Create interpolated face
        const interpolatedFace = {
          x: Math.round(faceBefore.x + (faceAfter.x - faceBefore.x) * pointPosition),
          y: Math.round(faceBefore.y + (faceAfter.y - faceBefore.y) * pointPosition),
          width: Math.round(faceBefore.width + (faceAfter.width - faceBefore.width) * pointPosition),
          height: Math.round(faceBefore.height + (faceAfter.height - faceBefore.height) * pointPosition)
        };
        
        // Add interpolated face
        point.faces = [interpolatedFace];
        console.log(`Interpolated face at ${point.timestamp}s: ${JSON.stringify(interpolatedFace)}`);
      } 
      // If we only have points before, use the latest one
      else if (before) {
        point.faces = [...before.faces];
        console.log(`Using faces from ${before.timestamp}s for timestamp ${point.timestamp}s`);
      }
      // If we only have points after, use the earliest one
      else if (after) {
        point.faces = [...after.faces];
        console.log(`Using faces from ${after.timestamp}s for timestamp ${point.timestamp}s`);
      }
      // If we have no reliable points at all (shouldn't happen due to earlier check)
      else {
        // Use default center crop
        // This is handled by the cropping logic when faces array is empty
      }
    }
  }

  // Helper to format timestamps for ffmpeg
  private formatTimestamp(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }
  
  // Detect faces in a single frame
  private async detectFacesInFrame(
    framePath: string
  ): Promise<Array<{x: number, y: number, width: number, height: number}>> {
    try {
      // Load the image
      const img = await canvas.loadImage(framePath);
      
      // Create canvas with the same dimensions as the image
      const cvs = canvas.createCanvas(img.width, img.height);
      const ctx = cvs.getContext('2d');
      ctx.drawImage(img, 0, 0);
      
      // Try multiple face detection approaches with different parameters
      // 1. First try with stricter parameters for high confidence
      // @ts-ignore - Ignore type errors with TinyFaceDetectorOptions
      const strictOptions = new faceapi.TinyFaceDetectorOptions({ 
        inputSize: 416, // Larger input size for better detection
        scoreThreshold: 0.6 // Higher score threshold (more confident)
      });
      
      // @ts-ignore - Ignore type errors with detectAllFaces
      let detections = await faceapi.detectAllFaces(cvs, strictOptions);
      
      // 2. If no faces found, try with more lenient parameters
      if (detections.length === 0) {
        // @ts-ignore
        const lenientOptions = new faceapi.TinyFaceDetectorOptions({ 
          inputSize: 416,
          scoreThreshold: 0.3 // Lower score threshold to detect less confident faces
        });
        
        // @ts-ignore
        detections = await faceapi.detectAllFaces(cvs, lenientOptions);
        
        if (detections.length > 0) {
          console.log(`Found ${detections.length} faces using lenient parameters`);
        }
      }
      
      // 3. Apply additional heuristics for better crops
      
      // If we found multiple faces, filter out small or peripheral ones
      if (detections.length > 1) {
        // Sort by size (largest first)
        // @ts-ignore
        detections.sort((a: any, b: any) => (b.box.width * b.box.height) - (a.box.width * a.box.height));
        
        // Keep only the largest/most central faces
        // Filter out faces that are too small compared to the largest one
        const largestFaceArea = detections[0].box.width * detections[0].box.height;
        detections = detections.filter((detection: any, index: number) => {
          if (index === 0) return true; // Always keep the largest face
          
          const area = detection.box.width * detection.box.height;
          // Keep if at least 40% as large as the largest face
          return area >= largestFaceArea * 0.4;
        });
      }
      
      // Convert detections to the expected format
      return detections.map((detection: any) => {
        const box = detection.box;
        return {
          x: Math.round(box.x),
          y: Math.round(box.y),
          width: Math.round(box.width),
          height: Math.round(box.height)
        };
      });
    } catch (error) {
      console.error('Face detection error for frame:', error);
      return []; // Return empty array if detection fails
    }
  }

  // Process video with dynamic cropping based on face timeline
  private async processVideoWithDynamicCropping(
    inputPath: string, 
    outputPath: string, 
    faceTimeline?: Array<{timestamp: number, faces: Array<{x: number, y: number, width: number, height: number}>}>,
    videoInfo?: { width: number, height: number, duration: number }
  ): Promise<void> {
    if (!videoInfo) {
      videoInfo = await this.getVideoInfo(inputPath);
    }
    
    // If no face timeline or no faces detected, use the old method
    if (!faceTimeline || faceTimeline.length === 0) {
      return this.processVideoForMobile(inputPath, outputPath, undefined, videoInfo);
    }
    
    try {
      // Determine crop parameters for each timestamp
      const cropTimelinePoints = faceTimeline.map(timePoint => {
        const cropOptions = this.calculateVerticalCrop(inputPath, timePoint.faces, videoInfo);
        return {
          timestamp: timePoint.timestamp,
          cropOptions
        };
      });
      
      // If there's only one timestamp or all crop options are the same, just use a single crop
      if (cropTimelinePoints.length === 1 || this.allCropPointsEqual(cropTimelinePoints)) {
        console.log('Using static crop for the entire video');
        return this.processVideoForMobile(
          inputPath, 
          outputPath, 
          faceTimeline[0].faces, 
          videoInfo
        );
      }

      // For simplicity in debugging, let's log what we detected
      cropTimelinePoints.forEach((point, i) => {
        console.log(`Timestamp ${point.timestamp}s: Crop x=${point.cropOptions.x}, y=${point.cropOptions.y}`);
      });
      
      // Smooth the crop timeline to avoid sudden jumps
      const smoothedCropTimeline = this.smoothCropTimeline(cropTimelinePoints);
      
      // After smoothing, log the adjusted crop points
      console.log('After smoothing:');
      smoothedCropTimeline.forEach((point, i) => {
        console.log(`Timestamp ${point.timestamp}s: Crop x=${point.cropOptions.x}, y=${point.cropOptions.y}`);
      });
      
      // Create a more reliable approach - split and combine
      // We'll split the video into segments, crop each one differently, then concatenate
      console.log('Creating segmented crop with', smoothedCropTimeline.length, 'segments');
      
      // Create temporary directory for segments - use absolute path
      const segmentsDir = path.resolve(path.join(this.options.outputDirectory, 'segments'));
      if (!fs.existsSync(segmentsDir)) {
        fs.mkdirSync(segmentsDir, { recursive: true });
      }
      
      // Calculate aspect ratio for vertical video (9:16)
      const aspectRatio = 9 / 16;
      const cropWidth = Math.floor(videoInfo.height * aspectRatio);
      const cropHeight = videoInfo.height;
      
      // Create segment list
      const segments: Array<{input: string, start: number, duration: number, cropX: number, cropY: number}> = [];
      
      // Process each segment
      for (let i = 0; i < smoothedCropTimeline.length; i++) {
        const current = smoothedCropTimeline[i];
        const next = i < smoothedCropTimeline.length - 1 ? smoothedCropTimeline[i + 1] : null;
        
        // Calculate segment duration
        const segmentDuration = next ? (next.timestamp - current.timestamp) : (videoInfo.duration - current.timestamp);
        
        if (segmentDuration < 0.5) continue; // Skip very small segments
        
        // Add segment
        segments.push({
          input: inputPath,
          start: current.timestamp,
          duration: segmentDuration,
          cropX: current.cropOptions.x,
          cropY: current.cropOptions.y
        });
      }
      
      // Create a temporary segmentation script
      const segmentationScript = segments.map((segment, index) => {
        const outputSegment = path.join(segmentsDir, `segment_${index}.mp4`);
        
        return new Promise<string>((resolve, reject) => {
          ffmpeg(segment.input)
            .seekInput(segment.start)
            .duration(segment.duration)
            .videoFilters([
              {
                filter: 'crop',
                options: {
                  w: cropWidth,
                  h: cropHeight,
                  x: segment.cropX,
                  y: segment.cropY
                }
              },
              {
                filter: 'scale',
                options: `${this.options.targetWidth}:${this.options.targetHeight}`
              }
            ])
            .output(outputSegment)
            .on('end', () => {
              console.log(`Segment ${index} processed`);
              resolve(outputSegment);
            })
            .on('error', (err: Error) => {
              console.error(`Error processing segment ${index}:`, err);
              reject(err);
            })
            .run();
        });
      });
      
      // Process all segments
      try {
        const segmentPaths = await Promise.all(segmentationScript);
        
        // Create a list file for concatenation - ensure absolute paths for better compatibility
        const listFilePath = path.resolve(path.join(segmentsDir, 'segments.txt'));
        const listContent = segmentPaths
          .map(p => `file '${path.resolve(p)}'`)
          .join('\n');
        
        fs.writeFileSync(listFilePath, listContent);
        
        // Concatenate segments
        await new Promise<void>((resolve, reject) => {
          ffmpeg()
            .input(listFilePath)
            .inputOptions(['-f concat', '-safe 0'])
            .outputOptions(['-c copy']) // Just copy streams, no re-encoding
            .output(outputPath)
            .on('start', (commandLine: string) => {
              console.log('Concatenating segments with command: ' + commandLine);
            })
            .on('end', () => {
              console.log('Video concatenation complete');
              resolve();
            })
            .on('error', (err: Error) => {
              console.error('Error during concatenation:', err);
              reject(err);
            })
            .run();
        });
        
        // Clean up temporary files
        console.log('Cleaning up temporary files...');
        segmentPaths.forEach(p => {
          try { fs.unlinkSync(p); } catch (e) { /* ignore */ }
        });
        try { fs.unlinkSync(listFilePath); } catch (e) { /* ignore */ }
        
        console.log('Video conversion complete');
        return;
      } catch (error) {
        console.error('Error processing segments:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error in dynamic cropping:', error);
      // Fall back to static cropping if something goes wrong
      return this.processVideoForMobile(inputPath, outputPath, undefined, videoInfo);
    }
  }
  
  // Smooth the crop timeline to avoid sudden jumps
  private smoothCropTimeline(
    cropTimelinePoints: Array<{timestamp: number, cropOptions: any}>
  ): Array<{timestamp: number, cropOptions: any}> {
    if (cropTimelinePoints.length <= 2) return cropTimelinePoints;
    
    console.log('Smoothing crop timeline...');
    
    // Make a deep copy of the timeline
    const smoothed = JSON.parse(JSON.stringify(cropTimelinePoints));
    
    // Apply moving average smoothing to x coordinates
    // We'll use a window size of 3 (the point itself and one point on each side)
    for (let i = 1; i < smoothed.length - 1; i++) {
      const prev = smoothed[i - 1].cropOptions;
      const current = smoothed[i].cropOptions;
      const next = smoothed[i + 1].cropOptions;
      
      // Calculate time-weighted average for smoother transitions
      // Points that are closer in time should have more influence
      const totalTime = 
        (smoothed[i].timestamp - smoothed[i-1].timestamp) + 
        (smoothed[i+1].timestamp - smoothed[i].timestamp);
      
      const weightPrev = 1 - ((smoothed[i].timestamp - smoothed[i-1].timestamp) / totalTime);
      const weightNext = 1 - ((smoothed[i+1].timestamp - smoothed[i].timestamp) / totalTime);
      
      // Apply weighted average smoothing
      const smoothX = (
        (prev.x * weightPrev) + 
        (current.x) + 
        (next.x * weightNext)
      ) / (1 + weightPrev + weightNext);
      
      // Apply smoothing with a bias toward keeping the original position (70% original, 30% smoothed)
      current.x = Math.round(current.x * 0.7 + smoothX * 0.3);
      
      // Do the same for Y coordinate if needed
      const smoothY = (
        (prev.y * weightPrev) + 
        (current.y) + 
        (next.y * weightNext)
      ) / (1 + weightPrev + weightNext);
      
      current.y = Math.round(current.y * 0.7 + smoothY * 0.3);
    }
    
    // Additional step: remove redundant keyframes that are too close to each other
    // This helps reduce the number of segments and makes transitions smoother
    const filtered = [smoothed[0]]; // Always keep the first point
    
    for (let i = 1; i < smoothed.length; i++) {
      const lastAdded = filtered[filtered.length - 1];
      const current = smoothed[i];
      
      // If this point is very similar to the last added point, skip it
      // unless it's the last point (we always want to keep the last point)
      const isSimilar = 
        Math.abs(current.cropOptions.x - lastAdded.cropOptions.x) < 20 &&
        Math.abs(current.cropOptions.y - lastAdded.cropOptions.y) < 10;
      
      const minTimeDiff = 5; // At least 5 seconds between keyframes
      const isCloseInTime = (current.timestamp - lastAdded.timestamp) < minTimeDiff;
      
      if ((isSimilar && isCloseInTime) && i < smoothed.length - 1) {
        continue; // Skip this keyframe
      }
      
      filtered.push(current);
    }
    
    console.log(`Reduced from ${smoothed.length} to ${filtered.length} keyframes after smoothing`);
    
    return filtered;
  }

  // Check if all crop points are effectively the same
  private allCropPointsEqual(cropTimelinePoints: Array<{timestamp: number, cropOptions: any}>): boolean {
    if (cropTimelinePoints.length <= 1) return true;
    
    const firstCrop = cropTimelinePoints[0].cropOptions;
    // Allow a small margin of error (5 pixels) to consider crops as "same"
    const margin = 5;
    
    return cropTimelinePoints.every(point => {
      const crop = point.cropOptions;
      return (
        Math.abs(crop.x - firstCrop.x) <= margin &&
        Math.abs(crop.y - firstCrop.y) <= margin
      );
    });
  }
  
  // Create a timeline expression for FFmpeg filters
  private createTimelineExpression(
    keypoints: Array<{time: number, value: number}>
  ): string {
    if (keypoints.length === 0) return '0';
    if (keypoints.length === 1) return keypoints[0].value.toString();
    
    // For multiple keypoints, create a piecewise linear expression
    // Format: if(lt(T,t1),v0,if(lt(T,t2),v0+(v1-v0)*(T-t0)/(t1-t0),if(...)))
    
    let expr = '';
    
    for (let i = keypoints.length - 1; i >= 0; i--) {
      const current = keypoints[i];
      
      if (i === 0) {
        // First keypoint (earliest in time)
        expr = current.value.toString();
      } else if (i === keypoints.length - 1) {
        // Last keypoint (latest in time)
        expr = current.value.toString();
      } else {
        // Intermediate keypoint - linear interpolation from previous
        const next = keypoints[i + 1];
        const interpolation = `${current.value}+(${next.value}-${current.value})*(T-${current.time})/(${next.time}-${current.time})`;
        expr = `if(lt(T,${next.time}),${interpolation},${expr})`;
      }
    }
    
    // Add the variable T that represents time in the video
    expr = `${expr}`;
    
    return expr;
  }

  // Legacy method for static cropping - keeping this for fallback
  private processVideoForMobile(
    inputPath: string, 
    outputPath: string, 
    faces?: Array<{x: number, y: number, width: number, height: number}>,
    videoInfo?: { width: number, height: number, duration?: number }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Determine crop parameters
      const cropOptions = this.calculateVerticalCrop(inputPath, faces, videoInfo);

      console.log('Applying static crop with options:', cropOptions);

      // Use ffmpeg directly since we're using require
      ffmpeg(inputPath)
        .videoFilters([
          // Crop video
          {
            filter: 'crop',
            options: {
              w: cropOptions.width,
              h: cropOptions.height,
              x: cropOptions.x,
              y: cropOptions.y
            }
          },
          // Scale to mobile-friendly vertical resolution
          {
            filter: 'scale',
            options: `${this.options.targetWidth}:${this.options.targetHeight}`
          }
        ])
        .output(outputPath)
        .on('start', (commandLine: string) => {
          console.log('Spawned FFmpeg with command: ' + commandLine);
        })
        .on('end', () => {
          console.log('Video conversion complete');
          resolve();
        })
        .on('error', (err: Error) => {
          console.error('Error during video conversion:', err);
          reject(err);
        })
        .run();
    });
  }

  private calculateVerticalCrop(
    inputPath: string, 
    faces?: Array<{x: number, y: number, width: number, height: number}>,
    videoInfo?: { width: number, height: number, duration?: number }
  ): { width: number, height: number, x: number, y: number } {
    // Use video dimensions if available
    const videoWidth = videoInfo ? videoInfo.width : this.options.targetWidth;
    const videoHeight = videoInfo ? videoInfo.height : this.options.targetHeight;
    
    // Calculate aspect ratio for vertical video (9:16)
    const aspectRatio = 9 / 16;
    
    // Calculate crop width and height to maintain aspect ratio
    let cropWidth, cropHeight;
    
    if (videoWidth / videoHeight > aspectRatio) {
      // If the video is wider than 9:16, crop the width
      cropHeight = videoHeight;
      cropWidth = Math.floor(cropHeight * aspectRatio);
    } else {
      // If the video is taller than 9:16, crop the height
      cropWidth = videoWidth;
      cropHeight = Math.floor(cropWidth / aspectRatio);
    }
    
    // Center crop by default
    let x = Math.floor((videoWidth - cropWidth) / 2);
    let y = Math.floor((videoHeight - cropHeight) / 2);
    
    // If faces are detected, center crop around the first face or the average of all faces
    if (faces && faces.length > 0) {
      if (faces.length === 1) {
        // Center on the single face, but ensure the crop rect contains the face
      const face = faces[0];
        const faceCenter = {
          x: face.x + face.width / 2,
          y: face.y + face.height / 2
        };
        
        // Calculate potential crop rect centered on face
        let potentialX = Math.max(0, Math.min(videoWidth - cropWidth, faceCenter.x - cropWidth/2));
        let potentialY = Math.max(0, Math.min(videoHeight - cropHeight, faceCenter.y - cropHeight/2));
        
        // Check if this crop would include the entire face
        const faceLeft = face.x;
        const faceRight = face.x + face.width;
        const faceTop = face.y;
        const faceBottom = face.y + face.height;
        
        // Adjust to ensure face is fully visible if possible
        if (faceLeft < potentialX) {
          potentialX = Math.max(0, faceLeft);
        }
        if (faceRight > potentialX + cropWidth) {
          potentialX = Math.min(videoWidth - cropWidth, faceRight - cropWidth);
        }
        
        // Apply the adjusted coordinates
        x = potentialX;
        y = potentialY;
      } else {
        // With multiple faces, find the central point between them
        // Weight larger/more central faces more heavily
        let totalWeight = 0;
        let weightedX = 0;
        let weightedY = 0;
        
        faces.forEach(face => {
          // Weight based on face size (larger faces get higher weight)
          const faceSize = face.width * face.height;
          // Additional weight for faces in the center
          const centrality = 1 - Math.min(1, 
            (Math.abs((face.x + face.width/2) - videoWidth/2) / videoWidth) * 2 +
            (Math.abs((face.y + face.height/2) - videoHeight/2) / videoHeight) * 2
          ) / 2;
          
          const weight = faceSize * centrality;
          totalWeight += weight;
          
          // Accumulate weighted positions
          weightedX += (face.x + face.width/2) * weight;
          weightedY += (face.y + face.height/2) * weight;
        });
        
        if (totalWeight > 0) {
          // Calculate weighted center
          const centerX = weightedX / totalWeight;
          const centerY = weightedY / totalWeight;
          
          // Center crop on the weighted center
          x = Math.max(0, Math.min(videoWidth - cropWidth, centerX - cropWidth/2));
          y = Math.max(0, Math.min(videoHeight - cropHeight, centerY - cropHeight/2));
        }
      }
    }
    
    // Safety check to ensure crop remains within video boundaries
    x = Math.max(0, Math.min(x, videoWidth - cropWidth));
    y = Math.max(0, Math.min(y, videoHeight - cropHeight));
    
    return {
      width: cropWidth,
      height: cropHeight,
      x,
      y
    };
  }
}

export default MobileVideoConverter;