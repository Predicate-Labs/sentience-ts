"use strict";
/**
 * Day 5-6 Example: Wait for element and click
 */
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../src/index");
async function main() {
    const browser = new index_1.SentienceBrowser(undefined, false);
    try {
        await browser.start();
        // Navigate to example.com
        await browser.getPage().goto('https://example.com');
        await browser.getPage().waitForLoadState('networkidle');
        // Take initial snapshot
        const snap = await (0, index_1.snapshot)(browser);
        // Find a link
        const link = (0, index_1.find)(snap, 'role=link');
        if (link) {
            console.log(`Found link: ${link.text} (id: ${link.id})`);
            // Click it
            const result = await (0, index_1.click)(browser, link.id);
            console.log(`Click result: success=${result.success}, outcome=${result.outcome}`);
            // Wait for navigation
            await browser.getPage().waitForLoadState('networkidle');
            console.log(`New URL: ${browser.getPage().url()}`);
        }
        else {
            console.log('No link found');
        }
        // Example: Wait for element using waitFor
        console.log('\n=== Wait Example ===');
        await browser.getPage().goto('https://example.com');
        await browser.getPage().waitForLoadState('networkidle');
        const waitResult = await (0, index_1.waitFor)(browser, 'role=link', 5000);
        if (waitResult.found) {
            console.log(`✅ Found element after ${waitResult.duration_ms}ms`);
        }
        else {
            console.log(`❌ Element not found (timeout: ${waitResult.timeout})`);
        }
        // Example: Expect assertion
        console.log('\n=== Expect Example ===');
        try {
            const element = await (0, index_1.expect)(browser, 'role=link').toExist(5000);
            console.log(`✅ Element exists: ${element.text}`);
        }
        catch (e) {
            console.log(`❌ Assertion failed: ${e.message}`);
        }
    }
    finally {
        await browser.close();
    }
}
main().catch(console.error);
//# sourceMappingURL=wait-and-click.js.map