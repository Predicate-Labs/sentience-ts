/**
 * Example: Grid Overlay Visualization
 *
 * Demonstrates how to use the grid overlay feature to visualize detected grids
 * on a webpage, including highlighting specific grids and identifying the dominant group.
 */

import { SentienceBrowser, snapshot, getGridBounds } from '../src/index';

async function main() {
  // Get API key from environment variable (optional - uses free tier if not set)
  const apiKey = process.env.SENTIENCE_API_KEY as string | undefined;

  const browser = new SentienceBrowser(apiKey, undefined, false);

  try {
    await browser.start();

    // Navigate to a page with grid layouts (e.g., product listings, article feeds)
    const page = browser.getPage();
    if (!page) {
      throw new Error('Failed to get page after browser.start()');
    }
    await page.goto('https://google.com', {
      waitUntil: 'domcontentloaded',
    });
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for page to fully load

    console.log('='.repeat(60));
    console.log('Example 1: Show all detected grids');
    console.log('='.repeat(60));
    // Show all grids (all in purple)
    // Use local extension mode (use_api: false) to ensure layout data is computed
    const snap = await snapshot(browser, { show_grid: true, use_api: false });
    console.log(`✅ Found ${snap.elements.length} elements`);
    console.log('   Purple borders appear around all detected grids for 5 seconds');
    await new Promise((resolve) => setTimeout(resolve, 6000)); // Wait to see the overlay

    console.log('\n' + '='.repeat(60));
    console.log('Example 2: Highlight a specific grid in red');
    console.log('='.repeat(60));
    // Get grid information first
    const grids = getGridBounds(snap);
    if (grids.length > 0) {
      console.log(`✅ Found ${grids.length} grids:`);
      for (const grid of grids) {
        console.log(
          `   Grid ${grid.grid_id}: ${grid.item_count} items, ` +
            `${grid.row_count}x${grid.col_count} rows/cols, ` +
            `label: ${grid.label || 'none'}`
        );
      }

      // Highlight the first grid in red
      if (grids.length > 0) {
        const targetGridId = grids[0].grid_id;
        console.log(`\n   Highlighting Grid ${targetGridId} in red...`);
        await snapshot(browser, {
          show_grid: true,
          grid_id: targetGridId, // This grid will be highlighted in red
          use_api: false, // Use local extension mode
        });
        await new Promise((resolve) => setTimeout(resolve, 6000)); // Wait to see the overlay
      }
    } else {
      console.log('   ⚠️  No grids detected on this page');
    }

    console.log('\n' + '='.repeat(60));
    console.log('Example 3: Highlight the dominant group');
    console.log('='.repeat(60));
    // Find and highlight the dominant grid
    const allGrids = getGridBounds(snap);
    const dominantGrid = allGrids.find((g) => g.is_dominant);

    if (dominantGrid) {
      console.log(`✅ Dominant group detected: Grid ${dominantGrid.grid_id}`);
      console.log(`   Label: ${dominantGrid.label || 'none'}`);
      console.log(`   Items: ${dominantGrid.item_count}`);
      console.log(`   Size: ${dominantGrid.row_count}x${dominantGrid.col_count}`);
      console.log(`\n   Highlighting dominant grid in red...`);
      await snapshot(browser, {
        show_grid: true,
        grid_id: dominantGrid.grid_id, // Highlight dominant grid in red
        use_api: false, // Use local extension mode
      });
      await new Promise((resolve) => setTimeout(resolve, 6000)); // Wait to see the overlay
    } else {
      console.log('   ⚠️  No dominant group detected');
    }

    console.log('\n' + '='.repeat(60));
    console.log('Example 4: Combine element overlay and grid overlay');
    console.log('='.repeat(60));
    // Show both element borders and grid borders simultaneously
    await snapshot(browser, {
      show_overlay: true, // Show element borders (green/blue/red)
      show_grid: true, // Show grid borders (purple/orange/red)
      use_api: false, // Use local extension mode
    });
    console.log('✅ Both overlays are now visible:');
    console.log('   - Element borders: Green (regular), Blue (primary), Red (target)');
    console.log('   - Grid borders: Purple (regular), Orange (dominant), Red (target)');
    await new Promise((resolve) => setTimeout(resolve, 6000)); // Wait to see the overlay

    console.log('\n' + '='.repeat(60));
    console.log('Example 5: Grid information analysis');
    console.log('='.repeat(60));
    // Analyze grid structure
    const allGridsForAnalysis = getGridBounds(snap);
    console.log(`✅ Grid Analysis:`);
    for (const grid of allGridsForAnalysis) {
      const dominantIndicator = grid.is_dominant ? '⭐ DOMINANT' : '';
      console.log(`\n   Grid ${grid.grid_id} ${dominantIndicator}:`);
      console.log(`      Label: ${grid.label || 'none'}`);
      console.log(`      Items: ${grid.item_count}`);
      console.log(`      Size: ${grid.row_count} rows × ${grid.col_count} cols`);
      console.log(
        `      BBox: (${grid.bbox.x.toFixed(0)}, ${grid.bbox.y.toFixed(0)}) ` +
          `${grid.bbox.width.toFixed(0)}×${grid.bbox.height.toFixed(0)}`
      );
      console.log(`      Confidence: ${grid.confidence}`);
    }

    console.log('\n✅ All examples completed!');
  } catch (e: any) {
    console.error(`❌ Error: ${e.message}`);
    console.error(e.stack);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
