const MAX_PROCESSING_EDGE = 760;
const CORNER_SAMPLE_EDGE = 12;

function colorDistance(red, green, blue, background) {
  return Math.sqrt(
    (red - background.red) ** 2
    + (green - background.green) ** 2
    + (blue - background.blue) ** 2,
  );
}

function cornerAverage(data, width, height, startX, startY, size) {
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  for (let y = startY; y < Math.min(height, startY + size); y += 1) {
    for (let x = startX; x < Math.min(width, startX + size); x += 1) {
      const offset = (y * width + x) * 4;
      red += data[offset];
      green += data[offset + 1];
      blue += data[offset + 2];
      count += 1;
    }
  }
  return { red: red / count, green: green / count, blue: blue / count };
}

function lightBackground(data, width, height) {
  const size = Math.min(CORNER_SAMPLE_EDGE, Math.floor(width / 8), Math.floor(height / 8));
  if (size < 2) return null;
  const corners = [
    cornerAverage(data, width, height, 0, 0, size),
    cornerAverage(data, width, height, width - size, 0, size),
    cornerAverage(data, width, height, 0, height - size, size),
    cornerAverage(data, width, height, width - size, height - size, size),
  ];
  const background = corners.reduce((sum, color) => ({
    red: sum.red + color.red / corners.length,
    green: sum.green + color.green / corners.length,
    blue: sum.blue + color.blue / corners.length,
  }), { red: 0, green: 0, blue: 0 });
  const luminance = (background.red * 0.2126) + (background.green * 0.7152) + (background.blue * 0.0722);
  const widestCornerDifference = Math.max(...corners.map((color) => colorDistance(
    color.red,
    color.green,
    color.blue,
    background,
  )));
  if (luminance < 220 || widestCornerDifference > 24) return null;
  return background;
}

function canvasBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export async function removeLightEdgeBackground(image) {
  const naturalWidth = image.naturalWidth;
  const naturalHeight = image.naturalHeight;
  if (!naturalWidth || !naturalHeight) return null;

  const scale = Math.min(1, MAX_PROCESSING_EDGE / Math.max(naturalWidth, naturalHeight));
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, width, height);

  const imageData = context.getImageData(0, 0, width, height);
  const { data } = imageData;
  const background = lightBackground(data, width, height);
  if (!background) return null;

  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Uint32Array(pixelCount);
  let head = 0;
  let tail = 0;
  let removed = 0;
  const threshold = 48;
  const thresholdSquared = threshold ** 2;

  const enqueue = (index) => {
    if (visited[index]) return;
    visited[index] = 1;
    const offset = index * 4;
    const redDifference = data[offset] - background.red;
    const greenDifference = data[offset + 1] - background.green;
    const blueDifference = data[offset + 2] - background.blue;
    const distanceSquared = (redDifference ** 2) + (greenDifference ** 2) + (blueDifference ** 2);
    const luminance = (data[offset] * 0.2126) + (data[offset + 1] * 0.7152) + (data[offset + 2] * 0.0722);
    if (distanceSquared <= thresholdSquared && luminance >= 185) {
      queue[tail] = index;
      tail += 1;
    }
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue(((height - 1) * width) + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue((y * width) + width - 1);
  }

  while (head < tail) {
    const index = queue[head];
    head += 1;
    const offset = index * 4;
    const distance = colorDistance(data[offset], data[offset + 1], data[offset + 2], background);
    data[offset + 3] = Math.round(Math.max(0, Math.min(1, (distance - 12) / (threshold - 12))) * 255);
    removed += 1;

    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueue(index - 1);
    if (x < width - 1) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y < height - 1) enqueue(index + width);
  }

  if (removed / pixelCount < 0.02) return null;
  context.putImageData(imageData, 0, 0);
  return canvasBlob(canvas);
}
