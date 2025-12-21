"use strict";
/**
 * Day 4 Example: Query engine demonstration
 */
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../src/index");
async function main() {
    const browser = new index_1.SentienceBrowser(undefined, false);
    try {
        await browser.start();
        // Navigate to a page with links
        await browser.getPage().goto('https://example.com');
        await browser.getPage().waitForLoadState('networkidle');
        const snap = await (0, index_1.snapshot)(browser);
        // Query examples
        console.log('=== Query Examples ===\n');
        // Find all buttons
        const buttons = (0, index_1.query)(snap, 'role=button');
        console.log(`Found ${buttons.length} buttons`);
        // Find all links
        const links = (0, index_1.query)(snap, 'role=link');
        console.log(`Found ${links.length} links`);
        // Find clickable elements
        const clickables = (0, index_1.query)(snap, 'clickable=true');
        console.log(`Found ${clickables.length} clickable elements`);
        // Find element with text containing "More"
        const moreLink = (0, index_1.find)(snap, "text~'More'");
        if (moreLink) {
            console.log(`\nFound 'More' link: ${moreLink.text} (id: ${moreLink.id})`);
        }
        else {
            console.log('\nNo "More" link found');
        }
        // Complex query: clickable links
        const clickableLinks = (0, index_1.query)(snap, 'role=link clickable=true');
        console.log(`\nFound ${clickableLinks.length} clickable links`);
    }
    finally {
        await browser.close();
    }
}
main().catch(console.error);
//# sourceMappingURL=query-demo.js.map