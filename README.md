# Faceify

[![npm version](https://img.shields.io/npm/v/@devansh-m12/faceify.svg)](https://www.npmjs.com/package/@devansh-m12/faceify)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A smart video converter that transforms landscape videos to mobile-friendly vertical format with intelligent face detection. Faceify automatically tracks faces in your videos and creates perfect vertical crops optimized for mobile viewing.

## Features

- Convert landscape videos to mobile-friendly 9:16 vertical format
- Intelligent face detection and tracking
- Dynamic cropping that follows faces and important content
- High-quality video processing using FFmpeg
- Customizable output dimensions
- TypeScript support

## Prerequisites

Before installing Faceify, ensure you have the following prerequisites:

1. **Node.js** (version 14 or higher)

2. **FFmpeg** installed on your system:
   - **macOS**: Install using Homebrew with `brew install ffmpeg`
   - **Ubuntu/Debian**: Install with `sudo apt-get install ffmpeg`
   - **Windows**: Download from [FFmpeg.org](https://ffmpeg.org/download.html) and add to PATH

3. **Build tools**:
   - **macOS**: Install Xcode command line tools: `xcode-select --install`
   - **Ubuntu/Debian**: `sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev`
   - **Windows**: Install Visual Studio Build Tools with C++ workload

## Installation

Install Faceify via npm:

```bash
npm install @devansh-m12/faceify
```

Or using yarn:

```bash
yarn add @devansh-m12/faceify
```

Or using pnpm:

```bash
pnpm add @devansh-m12/faceify
```

## Usage

Basic example:

```typescript
import { MobileVideoConverter } from '@devansh-m12/faceify';
import * as path from 'path';

async function convertVideo() {
  try {
    // Create converter instance
    const converter = new MobileVideoConverter({
      outputDirectory: './converted-videos',
      detectFaces: true
    });

    // Convert a video
    const result = await converter.convertVideo('path/to/your/video.mp4');

    console.log('Original Video:', result.originalPath);
    console.log('Converted Video:', result.convertedPath);
    
    // Access detected faces information
    if (result.faces && result.faces.length > 0) {
      console.log('Detected Faces:', result.faces);
    }
  } catch (error) {
    console.error('Video conversion failed:', error);
  }
}

convertVideo();
```

## API Reference

### MobileVideoConverter

The main class for converting videos.

#### Constructor

```typescript
new MobileVideoConverter(options?: VideoConverterOptions)
```

##### VideoConverterOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `outputDirectory` | string | `'./converted-videos'` | Directory where converted videos will be saved |
| `targetWidth` | number | `1080` | Target width of the converted video |
| `targetHeight` | number | `1920` | Target height of the converted video |
| `detectFaces` | boolean | `true` | Enable/disable face detection |

#### Methods

##### convertVideo(inputPath: string): Promise<ConversionResult>

Converts a video to mobile-friendly vertical format.

- **inputPath**: Path to the video file to convert
- **Returns**: Promise that resolves to a ConversionResult object

##### ConversionResult

| Property | Type | Description |
|----------|------|-------------|
| `originalPath` | string | Path to the original video file |
| `convertedPath` | string | Path to the converted video file |
| `faces` | Array<{x: number, y: number, width: number, height: number}> | Information about detected faces |

## How It Works

Faceify uses advanced computer vision and video processing techniques to intelligently convert landscape videos to vertical format:

1. **Face Detection**: Uses TensorFlow.js and face-api.js to detect and track faces throughout the video.
2. **Scene Analysis**: Identifies important scene changes to create optimal crop points.
3. **Dynamic Cropping**: Creates a smooth cropping timeline that follows faces and important content.
4. **Video Processing**: Uses FFmpeg to create high-quality output videos with proper aspect ratio.

## Advanced Usage

### Custom Dimensions

You can specify custom dimensions for the output video:

```typescript
const converter = new MobileVideoConverter({
  outputDirectory: './converted-videos',
  targetWidth: 720,    // Custom width
  targetHeight: 1280,  // Custom height
  detectFaces: true
});
```

### Disable Face Detection

If you want to convert videos without face detection (using center cropping):

```typescript
const converter = new MobileVideoConverter({
  outputDirectory: './converted-videos',
  detectFaces: false  // Disable face detection
});
```

## Troubleshooting

### Common Issues

1. **Missing FFmpeg**: Ensure FFmpeg is properly installed and in your system PATH.
2. **Build Errors**: Make sure you have the necessary build tools installed for your platform.
3. **Memory Issues**: For large videos, increase the Node.js memory limit: `node --max-old-space-size=4096 your-script.js`

### Debug Logs

If you're experiencing issues, check the console logs for detailed error messages that can help diagnose problems.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 