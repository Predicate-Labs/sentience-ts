/**
 * Visual Agent - Uses labeled screenshots with vision-capable LLMs
 *
 * This agent extends SentienceAgent to use visual prompts:
 * 1. Takes snapshot with screenshot enabled
 * 2. Draws bounding boxes and labels element IDs on the screenshot
 * 3. Uses anti-collision algorithm to position labels (4 sides + 4 corners)
 * 4. Sends labeled screenshot to vision-capable LLM
 * 5. Extracts element ID from LLM response
 * 6. Clicks the element using click()
 *
 * Dependencies:
 *    - sharp: Required for image processing
 *      Install with: npm install sharp
 *    - canvas: Required for drawing on images
 *      Install with: npm install canvas
 *    - Vision-capable LLM: Requires an LLM provider that supports vision (e.g., GPT-4o, Claude 3)
 */

import { SentienceBrowser } from './browser';
import { snapshot, SnapshotOptions } from './snapshot';
import { Snapshot, Element } from './types';
import { LLMProvider, LLMResponse } from './llm-provider';
import { Tracer } from './tracing/tracer';
import { randomUUID } from 'crypto';
import { TraceEventBuilder } from './utils/trace-event-builder';
import { SnapshotEventBuilder } from './utils/snapshot-event-builder';
import { SnapshotProcessor } from './utils/snapshot-processor';
import { click } from './actions';
import { SentienceAgent, AgentActResult } from './agent';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

// Check for required image processing libraries
let sharp: any;
let canvas: any;
let CANVAS_AVAILABLE = false;
let SHARP_AVAILABLE = false;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  sharp = require('sharp');
  SHARP_AVAILABLE = true;
} catch {
  sharp = undefined;
  console.warn('⚠️  Warning: sharp not available. Install with: npm install sharp');
}

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  canvas = require('canvas');
  CANVAS_AVAILABLE = true;
} catch {
  canvas = undefined;
  console.warn('⚠️  Warning: canvas not available. Install with: npm install canvas');
}

/**
 * Visual agent that uses labeled screenshots with vision-capable LLMs.
 *
 * Extends SentienceAgent to override act() method with visual prompting.
 *
 * Requirements:
 *    - sharp: Required for image processing
 *      Install with: npm install sharp
 *    - canvas: Required for drawing on images
 *      Install with: npm install canvas
 *    - Vision-capable LLM: Requires an LLM provider that supports vision (e.g., GPT-4o, Claude 3)
 */
export class SentienceVisualAgent extends SentienceAgent {
  /**
   * Initialize Visual Agent
   *
   * @param browser - SentienceBrowser instance
   * @param llm - LLM provider (must support vision, e.g., GPT-4o, Claude 3)
   * @param snapshotLimit - Default maximum elements to include
   * @param verbose - Print execution logs
   * @param tracer - Optional Tracer instance
   * @param showOverlay - Show green bbox overlay in browser
   */
  constructor(
    browser: SentienceBrowser,
    llm: LLMProvider,
    snapshotLimit: number = 50,
    verbose: boolean = true,
    tracer?: Tracer,
    showOverlay: boolean = false
  ) {
    super(browser, llm, snapshotLimit, verbose, tracer, showOverlay);

    if (!SHARP_AVAILABLE || !CANVAS_AVAILABLE) {
      throw new Error(
        'sharp and canvas are required for SentienceVisualAgent. ' +
          'Install with: npm install sharp canvas'
      );
    }

    // Track previous snapshot for diff computation (stored in base class)
  }

  /**
   * Decode base64 screenshot data URL to image buffer
   *
   * @param screenshotDataUrl - Base64-encoded data URL (e.g., "data:image/png;base64,...")
   * @returns Image buffer
   */
  private decodeScreenshot(screenshotDataUrl: string): Buffer {
    // Extract base64 data from data URL
    if (screenshotDataUrl.startsWith('data:image/')) {
      // Format: "data:image/png;base64,<base64_data>"
      const base64Data = screenshotDataUrl.split(',', 2)[1];
      return Buffer.from(base64Data, 'base64');
    } else {
      // Assume it's already base64
      return Buffer.from(screenshotDataUrl, 'base64');
    }
  }

  /**
   * Find best position for label using anti-collision algorithm.
   *
   * Tries 8 positions: 4 sides (top, bottom, left, right) + 4 corners.
   * Returns the first position that doesn't collide with existing labels.
   *
   * @param elementBbox - Element bounding box {x, y, width, height}
   * @param existingLabels - List of existing label bounding boxes
   * @param imageWidth - Image width in pixels
   * @param imageHeight - Image height in pixels
   * @param labelWidth - Label width in pixels
   * @param labelHeight - Label height in pixels
   * @returns (x, y) position for label
   */
  private findLabelPosition(
    elementBbox: { x: number; y: number; width: number; height: number },
    existingLabels: Array<{ x: number; y: number; width: number; height: number }>,
    imageWidth: number,
    imageHeight: number,
    labelWidth: number,
    labelHeight: number
  ): [number, number] {
    const { x, y, width, height } = elementBbox;

    // Offset from element edge
    const labelOffset = 15; // Increased from 5px for better separation

    // Try 8 positions: top, bottom, left, right, top-left, top-right, bottom-left, bottom-right
    const positions: Array<[number, number]> = [
      [Math.floor(x + width / 2 - labelWidth / 2), Math.floor(y - labelHeight - labelOffset)], // Top
      [Math.floor(x + width / 2 - labelWidth / 2), Math.floor(y + height + labelOffset)], // Bottom
      [Math.floor(x - labelWidth - labelOffset), Math.floor(y + height / 2 - labelHeight / 2)], // Left
      [Math.floor(x + width + labelOffset), Math.floor(y + height / 2 - labelHeight / 2)], // Right
      [Math.floor(x - labelWidth - labelOffset), Math.floor(y - labelHeight - labelOffset)], // Top-left
      [Math.floor(x + width + labelOffset), Math.floor(y - labelHeight - labelOffset)], // Top-right
      [Math.floor(x - labelWidth - labelOffset), Math.floor(y + height + labelOffset)], // Bottom-left
      [Math.floor(x + width + labelOffset), Math.floor(y + height + labelOffset)], // Bottom-right
    ];

    // Check each position for collisions
    for (const [posX, posY] of positions) {
      // Check bounds
      if (
        posX < 0 ||
        posY < 0 ||
        posX + labelWidth > imageWidth ||
        posY + labelHeight > imageHeight
      ) {
        continue;
      }

      // Check collision with existing labels
      const labelBbox = {
        x: posX,
        y: posY,
        width: labelWidth,
        height: labelHeight,
      };

      let collision = false;
      for (const existing of existingLabels) {
        // Simple AABB collision detection
        if (
          !(
            labelBbox.x + labelBbox.width < existing.x ||
            labelBbox.x > existing.x + existing.width ||
            labelBbox.y + labelBbox.height < existing.y ||
            labelBbox.y > existing.y + existing.height
          )
        ) {
          collision = true;
          break;
        }
      }

      if (!collision) {
        return [posX, posY];
      }
    }

    // If all positions collide, use top position with increased offset
    return [
      Math.floor(x + width / 2 - labelWidth / 2),
      Math.floor(y - labelHeight - labelOffset * 2),
    ];
  }

  /**
   * Draw labeled screenshot with bounding boxes and element IDs.
   *
   * @param snapshot - Snapshot with screenshot data
   * @param elements - List of elements to label
   * @returns Image buffer with labels drawn
   */
  private async drawLabeledScreenshot(snapshot: Snapshot, elements: Element[]): Promise<Buffer> {
    if (!snapshot.screenshot) {
      throw new Error('Screenshot not available in snapshot');
    }

    // Decode screenshot
    const imageBuffer = this.decodeScreenshot(snapshot.screenshot);
    if (!sharp) {
      throw new Error('sharp is not available. Install with: npm install sharp');
    }
    const img = await sharp(imageBuffer);
    const metadata = await img.metadata();
    const imageWidth = metadata.width || 0;
    const imageHeight = metadata.height || 0;

    // Create canvas for drawing
    if (!canvas) {
      throw new Error('canvas is not available. Install with: npm install canvas');
    }
    const { createCanvas, loadImage } = canvas;
    const canvasElement = createCanvas(imageWidth, imageHeight);
    const ctx = canvasElement.getContext('2d');

    // Draw original image on canvas
    const image = await loadImage(imageBuffer);
    ctx.drawImage(image, 0, 0);

    // Load font (fallback to default if not available)
    let font = '16px Arial';
    try {
      // Try to use system font
      font = '16px Helvetica';
    } catch {
      // Use default
      font = '16px Arial';
    }

    const existingLabels: Array<{ x: number; y: number; width: number; height: number }> = [];

    // Neon green color: #39FF14 (bright, vibrant green)
    const neonGreen = '#39FF14';

    // Draw bounding boxes and labels for each element
    for (const element of elements) {
      const bbox = element.bbox;
      const x = bbox.x;
      const y = bbox.y;
      const width = bbox.width;
      const height = bbox.height;

      // Draw bounding box rectangle (neon green with 2px width)
      ctx.strokeStyle = neonGreen;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, width, height);

      // Prepare label text (just the number - keep it simple and compact)
      const labelText = String(element.id);

      // Measure label text size
      ctx.font = font;
      const textMetrics = ctx.measureText(labelText);
      const labelWidth = textMetrics.width;
      const labelHeight = 16; // Approximate height for 16px font

      // Find best position for label (anti-collision)
      const [labelX, labelY] = this.findLabelPosition(
        { x, y, width, height },
        existingLabels,
        imageWidth,
        imageHeight,
        labelWidth + 8, // Add padding
        labelHeight + 4 // Add padding
      );

      // Calculate connection points for a clearer visual link
      const elementCenterX = x + width / 2;
      const elementCenterY = y + height / 2;
      const labelCenterX = labelX + labelWidth / 2;
      const labelCenterY = labelY + labelHeight / 2;

      // Determine which edge of the element is closest to the label
      const distTop = Math.abs(labelCenterY - y);
      const distBottom = Math.abs(labelCenterY - (y + height));
      const distLeft = Math.abs(labelCenterX - x);
      const distRight = Math.abs(labelCenterX - (x + width));

      const minDist = Math.min(distTop, distBottom, distLeft, distRight);

      let lineStart: [number, number];
      if (minDist === distTop) {
        lineStart = [elementCenterX, y];
      } else if (minDist === distBottom) {
        lineStart = [elementCenterX, y + height];
      } else if (minDist === distLeft) {
        lineStart = [x, elementCenterY];
      } else {
        lineStart = [x + width, elementCenterY];
      }

      // Draw connecting line from element edge to label
      ctx.strokeStyle = neonGreen;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(lineStart[0], lineStart[1]);
      ctx.lineTo(labelCenterX, labelCenterY);
      ctx.stroke();

      // Draw label background (white with neon green border)
      const labelBgX1 = labelX - 4;
      const labelBgY1 = labelY - 2;
      const labelBgX2 = labelX + labelWidth + 4;
      const labelBgY2 = labelY + labelHeight + 2;

      // Draw white background
      ctx.fillStyle = 'white';
      ctx.fillRect(labelBgX1, labelBgY1, labelBgX2 - labelBgX1, labelBgY2 - labelBgY1);

      // Draw neon green border
      ctx.strokeStyle = neonGreen;
      ctx.lineWidth = 2;
      ctx.strokeRect(labelBgX1, labelBgY1, labelBgX2 - labelBgX1, labelBgY2 - labelBgY1);

      // Draw label text (black for high contrast)
      ctx.fillStyle = 'black';
      ctx.font = font;
      ctx.fillText(labelText, labelX, labelY + labelHeight);

      // Record label position for collision detection
      existingLabels.push({
        x: labelBgX1,
        y: labelBgY1,
        width: labelBgX2 - labelBgX1,
        height: labelBgY2 - labelBgY1,
      });
    }

    // Convert canvas to buffer
    return canvasElement.toBuffer('image/png');
  }

  /**
   * Encode image buffer to base64 data URL with size optimization.
   *
   * Vision LLM APIs typically have size limits (e.g., 20MB for OpenAI).
   * This function automatically compresses images if they're too large.
   *
   * @param imageBuffer - Image buffer
   * @param format - Image format ('PNG' or 'JPEG')
   * @param maxSizeMb - Maximum size in MB before compression (default: 20MB)
   * @returns Base64-encoded data URL
   */
  private async encodeImageToBase64(
    imageBuffer: Buffer,
    format: 'PNG' | 'JPEG' = 'PNG',
    maxSizeMb: number = 20.0
  ): Promise<string> {
    if (!sharp) {
      throw new Error('sharp is not available. Install with: npm install sharp');
    }

    let quality = 95; // Start with high quality
    let outputBuffer = imageBuffer;

    // Try to fit within size limit
    for (let attempt = 0; attempt < 3; attempt++) {
      if (format === 'JPEG') {
        outputBuffer = await sharp(imageBuffer).jpeg({ quality, mozjpeg: true }).toBuffer();
      } else {
        outputBuffer = await sharp(imageBuffer).png({ compressionLevel: 9 }).toBuffer();
      }

      const sizeMb = outputBuffer.length / (1024 * 1024);

      if (sizeMb <= maxSizeMb) {
        break;
      }

      // Reduce quality for next attempt
      quality = Math.max(70, quality - 15);
      if ((this as any).verbose && attempt === 0) {
        console.log(`   ⚠️  Image size ${sizeMb.toFixed(2)}MB exceeds limit, compressing...`);
      }
    }

    const finalSizeMb = outputBuffer.length / (1024 * 1024);
    if ((this as any).verbose) {
      console.log(
        `   📸 Image encoded: ${finalSizeMb.toFixed(2)}MB (${outputBuffer.length} bytes)`
      );
    }

    const base64Data = outputBuffer.toString('base64');
    const mimeType = format === 'PNG' ? 'image/png' : 'image/jpeg';
    return `data:${mimeType};base64,${base64Data}`;
  }

  /**
   * Query LLM with vision (labeled screenshot).
   *
   * @param imageDataUrl - Base64-encoded image data URL
   * @param goal - User's goal/task
   * @returns LLMResponse with element ID
   */
  private async queryLLMWithVision(imageDataUrl: string, goal: string): Promise<LLMResponse> {
    const systemPrompt = `You are a web automation assistant. You will see a screenshot of a web page with labeled element IDs.
Each clickable element has:
- A bright neon green (#39FF14) bounding box around the element
- A white label box with a number (the element ID) connected by a green line
- The label is clearly separate from the element (not part of the UI)

CRITICAL INSTRUCTIONS:
1. Look at the screenshot carefully
2. Find the element that matches the user's goal (ignore the white label boxes - they are annotations, not UI elements)
3. Follow the green line from that element to find its label box with the ID number
4. Respond with ONLY that integer ID number (e.g., "42" or "1567")
5. Do NOT include any explanation, reasoning, or other text
6. Do NOT say "element 1" or "the first element" - just return the number
7. Do NOT confuse the white label box with an interactive element - labels are annotations connected by green lines

Example responses:
- Correct: "42"
- Correct: "1567"
- Wrong: "I see element 42"
- Wrong: "The element ID is 42"
- Wrong: "42 (the search box)"`;

    const userPrompt = `Goal: ${goal}

Look at the screenshot. Each element has a neon green bounding box with a white label showing its ID number.
Find the element that should be clicked to accomplish this goal.
Return ONLY the integer ID number from the label, nothing else.`;

    // Check if LLM provider supports vision (OpenAI GPT-4o, Claude, etc.)
    // For now, we'll use a fallback approach - try to pass image via the generate method
    // Individual LLM providers should implement vision support in their generate methods

    try {
      // Try to use vision API if available
      // This is a placeholder - actual implementation depends on LLM provider
      const response = await (this as any).llm.generate(systemPrompt, userPrompt, {
        image: imageDataUrl,
        temperature: 0.0,
      });

      return response;
    } catch {
      // Fallback: Try to pass image via text description
      const fallbackPrompt = `${userPrompt}\n\n[Image data: ${imageDataUrl.substring(0, 200)}...]`;
      const fallbackResponse = await (this as any).llm.generate(systemPrompt, fallbackPrompt, {
        temperature: 0.0,
      });

      if ((this as any).verbose) {
        console.log('   ⚠️  Using fallback method (may not support vision)');
      }

      return fallbackResponse;
    }
  }

  /**
   * Extract element ID integer from LLM response.
   *
   * @param llmResponse - LLM response text
   * @returns Element ID as integer, or undefined if not found
   */
  private extractElementId(llmResponse: string): number | undefined {
    if ((this as any).verbose) {
      console.log(`🔍 Raw LLM response: ${JSON.stringify(llmResponse)}`);
    }

    // Clean the response - remove leading/trailing whitespace
    let cleaned = llmResponse.trim();

    if ((this as any).verbose) {
      console.log(`   🧹 After strip: ${JSON.stringify(cleaned)}`);
    }

    // Remove common prefixes that LLMs might add
    const prefixesToRemove = [
      'element',
      'id',
      'the element',
      'element id',
      'the id',
      'click',
      'click on',
      'select',
      'choose',
    ];

    for (const prefix of prefixesToRemove) {
      if (cleaned.toLowerCase().startsWith(prefix)) {
        cleaned = cleaned.substring(prefix.length).trim();
        // Remove any remaining punctuation
        cleaned = cleaned.replace(/^[:.,;!?()[\]{}]+/, '').trim();
        if ((this as any).verbose) {
          console.log(`   🧹 After removing prefix '${prefix}': ${JSON.stringify(cleaned)}`);
        }
      }
    }

    // Try to find all integers in the cleaned response
    const numbers = cleaned.match(/\d+/g);

    if ((this as any).verbose) {
      console.log(`   🔢 Numbers found: ${numbers}`);
    }

    if (numbers && numbers.length > 0) {
      // If multiple numbers found, prefer the largest one (likely the actual element ID)
      // Element IDs are typically larger numbers, not small ones like "1"
      try {
        const intNumbers = numbers.map(n => parseInt(n, 10));
        if ((this as any).verbose) {
          console.log(`   🔢 As integers: ${intNumbers}`);
        }

        // Prefer larger numbers (element IDs are usually > 10)
        // But if only small numbers exist, use the first one
        const largeNumbers = intNumbers.filter(n => n > 10);
        let elementId: number;
        if (largeNumbers.length > 0) {
          elementId = Math.max(...largeNumbers); // Take the largest
          if ((this as any).verbose) {
            console.log(`   ✅ Selected largest number > 10: ${elementId}`);
          }
        } else {
          elementId = intNumbers[0]; // Fallback to first if all are small
          if ((this as any).verbose) {
            console.log(`   ⚠️  All numbers ≤ 10, using first: ${elementId}`);
          }
        }

        if ((this as any).verbose) {
          console.log(`✅ Extracted element ID: ${elementId} (from ${numbers})`);
        }
        return elementId;
      } catch {
        if ((this as any).verbose) {
          console.log('   ❌ Failed to convert numbers to integers');
        }
      }
    }

    if ((this as any).verbose) {
      console.log(`⚠️  Could not extract element ID from response: ${llmResponse}`);
    }
    return undefined;
  }

  /**
   * Override act() method to use visual prompting with full tracing support.
   *
   * @param goal - User's goal/task
   * @param maxRetries - Maximum retry attempts
   * @param snapshotOptions - Optional snapshot options (screenshot will be enabled)
   * @returns AgentActResult
   */
  async act(
    goal: string,
    _maxRetries: number = 2,
    snapshotOptions?: SnapshotOptions
  ): Promise<AgentActResult> {
    if ((this as any).verbose) {
      console.log('\n' + '='.repeat(70));
      console.log(`🤖 Visual Agent Goal: ${goal}`);
      console.log('='.repeat(70));
    }

    // Increment step counter and generate step ID
    const stepCount = (this as any).stepCount + 1;
    (this as any).stepCount = stepCount;
    const stepId = randomUUID();

    // Emit step_start event
    const tracer = (this as any).tracer as Tracer | undefined;
    if (tracer) {
      const page = (this as any).browser.getPage();
      const currentUrl = page ? page.url() : 'unknown';
      tracer.emitStepStart(stepId, stepCount, goal, 0, currentUrl);
    }

    const startTime = Date.now();

    // Track data collected during step execution for step_end emission on failure
    let stepSnapWithDiff: Snapshot | null = null;
    let stepPreUrl: string | null = null;
    let stepLlmResponse: LLMResponse | null = null;

    try {
      // Ensure screenshot is enabled
      const snapOpts: SnapshotOptions = {
        ...snapshotOptions,
        screenshot: snapshotOptions?.screenshot ?? true,
        goal: snapshotOptions?.goal ?? goal,
        limit: snapshotOptions?.limit || (this as any).snapshotLimit,
      };

      if ((this as any).verbose) {
        console.log(`🎯 Goal: ${goal}`);
        console.log('📸 Taking snapshot with screenshot...');
      }

      // 1. Take snapshot with screenshot
      const snap = await snapshot((this as any).browser, snapOpts);

      if (snap.status !== 'success') {
        throw new Error(`Snapshot failed: ${snap.error}`);
      }

      if (!snap.screenshot) {
        throw new Error('Screenshot not available in snapshot');
      }

      // Process snapshot: compute diff status and filter elements
      const processed = SnapshotProcessor.process(
        snap,
        (this as any).previousSnapshot,
        goal,
        (this as any).snapshotLimit
      );

      // Update previous snapshot for next comparison
      (this as any).previousSnapshot = snap;

      const snapWithDiff = processed.withDiff;

      // Track for step_end emission on failure
      stepSnapWithDiff = snapWithDiff;
      stepPreUrl = snap.url;

      // Emit snapshot event
      if (tracer) {
        const snapshotData = SnapshotEventBuilder.buildSnapshotEventData(snapWithDiff, stepId);
        tracer.emit('snapshot', snapshotData, stepId);
      }

      if ((this as any).verbose) {
        console.log(`✅ Snapshot taken: ${snap.elements.length} elements`);
      }

      // 2. Draw labeled screenshot
      if ((this as any).verbose) {
        console.log('🎨 Drawing bounding boxes and labels...');
        console.log(`   Elements to label: ${snap.elements.length}`);
        if (snap.elements.length > 0) {
          const elementIds = snap.elements.slice(0, 10).map(el => el.id); // Show first 10
          console.log(`   Sample element IDs: ${elementIds}`);
        }
      }

      const labeledImageBuffer = await this.drawLabeledScreenshot(snap, snap.elements);

      // Save labeled image to disk for debugging
      try {
        const cwd = process.cwd();
        let playgroundPath: string | undefined;

        // Check if current working directory contains playground
        if (fs.existsSync(path.join(cwd, 'playground'))) {
          playgroundPath = path.join(cwd, 'playground', 'images');
        } else {
          // Check if we're in a playground context via module path
          const modulePaths = require.resolve.paths('@predicate/sdk') || [];
          for (const modulePath of modulePaths) {
            const potentialPlayground = path.join(modulePath, '..', 'playground', 'images');
            if (fs.existsSync(path.dirname(potentialPlayground))) {
              playgroundPath = potentialPlayground;
              break;
            }
          }
        }

        if (!playgroundPath) {
          // Fallback: use current working directory
          playgroundPath = path.join(cwd, 'playground', 'images');
        }

        const imagesDir = playgroundPath;
        if (!fs.existsSync(imagesDir)) {
          fs.mkdirSync(imagesDir, { recursive: true });
        }

        const imageUuid = uuidv4();
        const imageFilename = `labeled_screenshot_${imageUuid}.png`;
        const imagePath = path.join(imagesDir, imageFilename);
        fs.writeFileSync(imagePath, labeledImageBuffer);
        if ((this as any).verbose) {
          console.log(`   💾 Saved labeled screenshot: ${path.resolve(imagePath)}`);
        }
      } catch (saveError: any) {
        // Don't fail if image save fails - it's just for debugging
        if ((this as any).verbose) {
          console.log(`   ⚠️  Could not save labeled screenshot: ${saveError.message}`);
        }
      }

      // Use JPEG for better compression (smaller file size for vision APIs)
      const labeledImageDataUrl = await this.encodeImageToBase64(labeledImageBuffer, 'JPEG', 20.0);

      // 3. Query LLM with vision
      if ((this as any).verbose) {
        console.log('🧠 Querying LLM with labeled screenshot...');
      }

      const llmResponse = await this.queryLLMWithVision(labeledImageDataUrl, goal);

      // Track for step_end emission on failure
      stepLlmResponse = llmResponse;

      // Emit LLM query event
      if (tracer) {
        tracer.emit(
          'llm_query',
          {
            prompt_tokens: llmResponse.promptTokens,
            completion_tokens: llmResponse.completionTokens,
            model: llmResponse.modelName,
            response_text: llmResponse.content.substring(0, 200), // Truncate for brevity
          },
          stepId
        );
      }

      if ((this as any).verbose) {
        console.log(`💭 LLM Response: ${llmResponse.content}`);
      }

      // Track token usage
      (this as any).trackTokens(goal, llmResponse);

      // 4. Extract element ID
      const elementId = this.extractElementId(llmResponse.content);

      if (elementId === undefined) {
        throw new Error(`Could not extract element ID from LLM response: ${llmResponse.content}`);
      }

      if ((this as any).verbose) {
        console.log(`🎯 Extracted Element ID: ${elementId}`);
      }

      // 5. Click the element
      if ((this as any).verbose) {
        console.log(`🖱️  Clicking element ${elementId}...`);
      }

      const clickResult = await click((this as any).browser, elementId);

      const durationMs = Date.now() - startTime;

      // Create AgentActResult from click result
      const result: AgentActResult = {
        success: clickResult.success,
        action: 'click',
        goal,
        durationMs,
        attempt: 0,
        elementId,
        outcome: clickResult.outcome,
        urlChanged: clickResult.url_changed || false,
        error: clickResult.error?.reason,
      };

      // Emit action execution event
      if (tracer) {
        const page = (this as any).browser.getPage();
        const postUrl = page ? page.url() : null;

        // Include element data for live overlay visualization
        const elementsData = snap.elements.slice(0, 50).map(el => ({
          id: el.id,
          bbox: {
            x: el.bbox.x,
            y: el.bbox.y,
            width: el.bbox.width,
            height: el.bbox.height,
          },
          role: el.role,
          text: el.text ? el.text.substring(0, 50) : '',
        }));

        tracer.emit(
          'action',
          {
            action_type: result.action,
            action: result.action,
            element_id: result.elementId,
            success: result.success,
            // Note: duration_ms and other custom fields are not in TraceEventData type
            // but are accepted at runtime for custom visualization
            post_url: postUrl,
            elements: elementsData, // Add element data for overlay
            target_element_id: result.elementId, // Highlight target in red
          } as any, // Type assertion needed for custom visualization fields
          stepId
        );
      }

      // Record history
      const history = (this as any).history as Array<any>;
      history.push({
        goal,
        action: `CLICK(${elementId})`,
        result,
        success: result.success,
        attempt: 0,
        durationMs,
      });

      if ((this as any).verbose) {
        const status = result.success ? '✅' : '❌';
        console.log(`${status} Completed in ${durationMs}ms`);
      }

      // Emit step completion event
      if (tracer) {
        const preUrl = snap.url;
        const page = (this as any).browser.getPage();
        const postUrl = page ? page.url() || null : null;
        let postSnapshotDigest: string | undefined;
        try {
          const postSnap = await snapshot((this as any).browser, {
            goal: `${goal} (post)`,
            limit: Math.min((this as any).snapshotLimit, 10),
            show_overlay: (this as any).showOverlay,
          });
          if (postSnap.status === 'success') {
            postSnapshotDigest = TraceEventBuilder.buildSnapshotDigest(postSnap);
          }
        } catch {
          postSnapshotDigest = undefined;
        }

        // Build complete step_end event
        // Note: snapshotDigest, llmResponseText, execData, and verifyData are computed
        // inside TraceEventBuilder.buildStepEndData, so we don't need them here

        // Build complete step_end event
        const stepEndData = TraceEventBuilder.buildStepEndData({
          stepId,
          stepIndex: stepCount,
          goal,
          attempt: 0,
          preUrl,
          postUrl: postUrl || preUrl,
          postSnapshotDigest,
          snapshot: snapWithDiff,
          llmResponse,
          result,
        });

        tracer.emit('step_end', stepEndData, stepId);
      }

      return result;
    } catch (error: any) {
      // Emit error event
      if (tracer) {
        tracer.emitError(stepId, error.message, 0);
      }

      // Emit step_end with whatever data we collected before failure
      // This ensures diff_status and other fields are preserved in traces
      if (tracer && stepSnapWithDiff) {
        const page = (this as any).browser.getPage();
        const postUrl = page ? page.url() || null : null;
        const durationMs = Date.now() - startTime;

        const stepEndData = TraceEventBuilder.buildPartialStepEndData({
          stepId,
          stepIndex: stepCount,
          goal,
          attempt: 0,
          preUrl: stepPreUrl,
          postUrl,
          snapshot: stepSnapWithDiff,
          llmResponse: stepLlmResponse,
          error: error.message,
          durationMs,
        });

        tracer.emit('step_end', stepEndData, stepId);
      }

      if ((this as any).verbose) {
        console.log(`❌ Error: ${error.message}`);
      }

      // Re-raise the exception
      throw error;
    }
  }
}

/**
 * Predicate rebrand alias for SentienceVisualAgent.
 * Kept as a runtime alias to avoid breaking existing integrations.
 */
export const PredicateVisualAgent = SentienceVisualAgent;
