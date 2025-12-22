// background.js - Service Worker for screenshot capture
// Chrome extensions can only capture screenshots from the background script
// Listen for screenshot requests from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'captureScreenshot') {
    handleScreenshotCapture(sender.tab.id, request.options)
      .then(screenshot => {
        sendResponse({ success: true, screenshot });
      })
      .catch(error => {
        console.error('[Sentience] Screenshot capture failed:', error);
        sendResponse({
          success: false,
          error: error.message || 'Screenshot capture failed'
        });
      });

    // Return true to indicate we'll send response asynchronously
    return true;
  }
});

/**
 * Capture screenshot of the active tab
 * @param {number} tabId - Tab ID to capture
 * @param {Object} options - Screenshot options
 * @returns {Promise<string>} Base64-encoded PNG data URL
 */
async function handleScreenshotCapture(tabId, options = {}) {
  try {
    const {
      format = 'png',      // 'png' or 'jpeg'
      quality = 90         // JPEG quality (0-100), ignored for PNG
    } = options;

    // Capture visible tab as data URL
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: format,
      quality: quality
    });

    console.log(`[Sentience] Screenshot captured: ${format}, size: ${dataUrl.length} bytes`);

    return dataUrl;
  } catch (error) {
    console.error('[Sentience] Screenshot error:', error);
    throw new Error(`Failed to capture screenshot: ${error.message}`);
  }
}

/**
 * Optional: Add viewport-specific capture (requires additional setup)
 * This would allow capturing specific regions, not just visible area
 */
async function captureRegion(tabId, region) {
  // For region capture, you'd need to:
  // 1. Capture full visible tab
  // 2. Use Canvas API to crop to region
  // 3. Return cropped image

  // Not implemented in this basic version
  throw new Error('Region capture not yet implemented');
}
