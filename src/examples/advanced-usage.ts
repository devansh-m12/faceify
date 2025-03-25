import { MobileVideoConverter } from '../index';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Advanced example demonstrating various features of the Facify package
 */
async function advancedConversionExample() {
  try {
    // Create output directory if it doesn't exist
    const outputDir = path.join(__dirname, '../../converted-videos/advanced');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Create converter instance with customized options
    const converter = new MobileVideoConverter({
      outputDirectory: outputDir,
      targetWidth: 720,     // Custom width for better performance
      targetHeight: 1280,   // Custom height (maintains 9:16 aspect ratio)
      detectFaces: true     // Enable face detection
    });

    // Path to input video (replace with your video path)
    const inputVideoPath = path.join(__dirname, '../../public/before.mp4');

    console.log('Starting video conversion with face detection...');
    console.time('Conversion Time');

    // Convert video with face detection
    const result = await converter.convertVideo(inputVideoPath);

    console.timeEnd('Conversion Time');
    console.log('Conversion completed successfully!');
    console.log('Original Video:', result.originalPath);
    console.log('Converted Video:', result.convertedPath);

    // Log detailed information about detected faces
    if (result.faces && result.faces.length > 0) {
      console.log(`Detected ${result.faces.length} faces:`);
      result.faces.forEach((face, index) => {
        console.log(`Face #${index + 1}:`);
        console.log(`  Position: (${face.x}, ${face.y})`);
        console.log(`  Size: ${face.width} x ${face.height}`);
      });
    } else {
      console.log('No faces detected in the video.');
    }

    // Create another converter instance with different options
    console.log('\nCreating a version without face detection (center cropping)...');
    
    const simpleConverter = new MobileVideoConverter({
      outputDirectory: path.join(outputDir, 'simple'),
      detectFaces: false    // Disable face detection (uses center cropping)
    });

    console.time('Simple Conversion Time');
    
    // Convert the same video without face detection
    const simpleResult = await simpleConverter.convertVideo(inputVideoPath);
    
    console.timeEnd('Simple Conversion Time');
    console.log('Simple conversion completed successfully!');
    console.log('Original Video:', simpleResult.originalPath);
    console.log('Converted Video:', simpleResult.convertedPath);

    // Compare the two approaches
    console.log('\nComparison:');
    console.log('- Face detection: Creates a video that follows faces');
    console.log('- Simple center crop: Faster but may cut off important content');
    
  } catch (error) {
    console.error('Video conversion failed:', error);
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  advancedConversionExample();
}

export { advancedConversionExample }; 