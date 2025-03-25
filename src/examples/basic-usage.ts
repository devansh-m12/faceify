import { MobileVideoConverter } from '../index';
import * as path from 'path';

async function convertVideoExample() {
  try {
    // Create converter instance
    const converter = new MobileVideoConverter({
      outputDirectory: path.join(__dirname, '../../converted-videos'),
      detectFaces: true
    });

    // Path to input video (replace with your video path)
    const inputVideoPath = path.join(__dirname, '../../public/before.mp4');

    // Convert video
    const result = await converter.convertVideo(inputVideoPath);

    console.log('Original Video:', result.originalPath);
    console.log('Converted Video:', result.convertedPath);

    // Log detected faces
    if (result.faces && result.faces.length > 0) {
      console.log('Detected Faces:', result.faces);
    }
  } catch (error) {
    console.error('Video conversion failed:', error);
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  convertVideoExample();
}