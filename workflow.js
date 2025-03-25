const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

// Create canvas with dimensions for the workflow diagram
const width = 1200;
const height = 800;
const canvas = createCanvas(width, height);
const ctx = canvas.getContext('2d');

// Add roundRect polyfill if not available
if (!ctx.roundRect) {
  ctx.roundRect = function(x, y, width, height, radius) {
    if (typeof radius === 'number') {
      radius = {tl: radius, tr: radius, br: radius, bl: radius};
    } else if (Array.isArray(radius)) {
      // Handle array case - convert to object
      const defaultRadius = 0;
      radius = {
        tl: radius[0] || defaultRadius,
        tr: radius[1] || defaultRadius,
        br: radius[2] || defaultRadius,
        bl: radius[3] || defaultRadius
      };
    } else {
      radius = radius || {tl: 0, tr: 0, br: 0, bl: 0};
    }
    
    this.beginPath();
    this.moveTo(x + radius.tl, y);
    this.lineTo(x + width - radius.tr, y);
    this.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
    this.lineTo(x + width, y + height - radius.br);
    this.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
    this.lineTo(x + radius.bl, y + height);
    this.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
    this.lineTo(x, y + radius.tl);
    this.quadraticCurveTo(x, y, x + radius.tl, y);
    this.closePath();
    return this;
  };
}

// Set up the background with a gradient
const gradient = ctx.createLinearGradient(0, 0, 0, height);
gradient.addColorStop(0, '#f5f7fa');
gradient.addColorStop(1, '#e5e9f2');
ctx.fillStyle = gradient;
ctx.fillRect(0, 0, width, height);

// Define workflow steps
const steps = [
  { 
    title: '1. Input Video Analysis',
    description: 'Analyze the original landscape video',
    items: [
      'Extract video metadata',
      'Detect scene changes',
      'Sample key frames'
    ],
    icon: '🎬',
    color: '#4299e1'
  },
  { 
    title: '2. Face Detection',
    description: 'Identify and track faces across timeline',
    items: [
      'Detect faces using TensorFlow.js',
      'Map facial landmarks',
      'Create face timeline'
    ],
    icon: '👁️',
    color: '#48bb78'
  },
  { 
    title: '3. Dynamic Crop Planning',
    description: 'Calculate optimal crop regions',
    items: [
      'Prioritize important faces',
      'Handle multiple subjects',
      'Create smooth transitions'
    ],
    icon: '🎯',
    color: '#ed8936'
  },
  { 
    title: '4. Video Processing',
    description: 'Convert to vertical format with FFmpeg',
    items: [
      'Apply dynamic cropping',
      'Maintain content quality',
      'Optimize for mobile viewing'
    ],
    icon: '📱',
    color: '#9f7aea'
  }
];

// Draw workflow title
ctx.fillStyle = '#2d3748';
ctx.font = 'bold 40px Arial';
ctx.textAlign = 'center';
ctx.fillText('Faceify Workflow', width / 2, 70);

ctx.fillStyle = '#4a5568';
ctx.font = '20px Arial';
ctx.fillText('Transform landscape videos to mobile-friendly vertical format with intelligent face tracking', width / 2, 105);

// Draw flow diagram shape
const boxWidth = 220;
const boxHeight = 280;
const startX = 120;
const startY = 160;
const spacing = 30;

// Arrow function
function drawArrow(fromX, fromY, toX, toY) {
  const headSize = 15;
  const arrowColor = '#718096';
  
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.strokeStyle = arrowColor;
  ctx.lineWidth = 3;
  ctx.stroke();
  
  // Calculate angle for arrowhead
  const angle = Math.atan2(toY - fromY, toX - fromX);
  
  // Draw arrowhead
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - headSize * Math.cos(angle - Math.PI / 6),
    toY - headSize * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    toX - headSize * Math.cos(angle + Math.PI / 6),
    toY - headSize * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fillStyle = arrowColor;
  ctx.fill();
}

// Helper function to draw a rounded rectangle
function drawRoundedRect(x, y, width, height, radius) {
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
}

// Draw boxes and arrows
steps.forEach((step, index) => {
  const x = startX + index * (boxWidth + spacing);
  const y = startY;
  
  // Draw shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
  ctx.shadowBlur = 15;
  ctx.shadowOffsetX = 5;
  ctx.shadowOffsetY = 5;
  
  // Draw box
  ctx.fillStyle = 'white';
  drawRoundedRect(x, y, boxWidth, boxHeight, 15);
  
  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  
  // Draw colored header
  ctx.fillStyle = step.color;
  ctx.beginPath();
  ctx.roundRect(x, y, boxWidth, 60, [15, 15, 0, 0]);
  ctx.fill();
  
  // Draw icon
  ctx.font = '30px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(step.icon, x + boxWidth / 2, y + 37);
  
  // Draw title
  ctx.fillStyle = 'white';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(step.title, x + boxWidth / 2, y + 65);
  
  // Draw description
  ctx.fillStyle = '#4a5568';
  ctx.font = '14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(step.description, x + boxWidth / 2, y + 95);
  
  // Draw items
  ctx.fillStyle = '#2d3748';
  ctx.font = '14px Arial';
  ctx.textAlign = 'left';
  step.items.forEach((item, itemIndex) => {
    ctx.fillText(`• ${item}`, x + 15, y + 130 + itemIndex * 25);
  });
  
  // Draw arrow to next step
  if (index < steps.length - 1) {
    drawArrow(
      x + boxWidth + 5,
      y + boxHeight / 2,
      x + boxWidth + spacing - 5,
      y + boxHeight / 2
    );
  }
});

// Draw example video transformation visualization
const exampleY = startY + boxHeight + 80;
const beforeWidth = 320;
const beforeHeight = 180;
const afterWidth = 120;
const afterHeight = 213;

// Draw "before" video placeholder
ctx.fillStyle = '#1a202c';
ctx.fillRect((width / 4) - (beforeWidth / 2), exampleY, beforeWidth, beforeHeight);

// Draw "after" video placeholder
ctx.fillStyle = '#1a202c';
ctx.fillRect((3 * width / 4) - (afterWidth / 2), exampleY, afterWidth, afterHeight);

// Add labels
ctx.fillStyle = '#2d3748';
ctx.font = 'bold 20px Arial';
ctx.textAlign = 'center';
ctx.fillText('Original Landscape Video', width / 4, exampleY - 15);
ctx.fillText('Mobile-Optimized Video', 3 * width / 4, exampleY - 15);

// Draw transformation arrow
drawArrow(
  width / 4 + beforeWidth / 2 + 20, 
  exampleY + beforeHeight / 2,
  3 * width / 4 - afterWidth / 2 - 20,
  exampleY + afterHeight / 2
);

// Add face tracking visualization in the transformation
const arrowMidX = width / 2;
const arrowMidY = exampleY + (beforeHeight + afterHeight) / 4;
ctx.fillStyle = 'rgba(66, 153, 225, 0.6)';
ctx.beginPath();
ctx.arc(arrowMidX, arrowMidY, 25, 0, Math.PI * 2);
ctx.fill();
ctx.strokeStyle = '#4299e1';
ctx.lineWidth = 2;
ctx.stroke();

// Draw miniature face in the circle
ctx.fillStyle = '#fff';
ctx.beginPath();
ctx.arc(arrowMidX - 8, arrowMidY - 5, 4, 0, Math.PI * 2); // left eye
ctx.arc(arrowMidX + 8, arrowMidY - 5, 4, 0, Math.PI * 2); // right eye
ctx.fill();
ctx.beginPath();
ctx.arc(arrowMidX, arrowMidY + 7, 10, 0.1 * Math.PI, 0.9 * Math.PI); // smile
ctx.strokeStyle = '#fff';
ctx.lineWidth = 2;
ctx.stroke();

// Add footer with tech stack
ctx.fillStyle = '#4a5568';
ctx.font = '16px Arial';
ctx.textAlign = 'center';
ctx.fillText('Powered by: FFmpeg • TensorFlow.js • face-api.js • Node.js', width / 2, height - 40);

// Save the image
const buffer = canvas.toBuffer('image/png');
fs.writeFileSync('public/workflow.png', buffer);

console.log('Workflow diagram created and saved to public/workflow.png'); 