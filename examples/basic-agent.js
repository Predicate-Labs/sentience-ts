"use strict";
/**
 * Day 3 Example: Basic snapshot functionality
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../src/index");
const fs = __importStar(require("fs"));
async function main() {
    const browser = new index_1.SentienceBrowser(undefined, false);
    try {
        await browser.start();
        // Navigate to a test page
        await browser.getPage().goto('https://example.com');
        await browser.getPage().waitForLoadState('networkidle');
        // Take snapshot
        const snap = await (0, index_1.snapshot)(browser);
        console.log(`Status: ${snap.status}`);
        console.log(`URL: ${snap.url}`);
        console.log(`Elements found: ${snap.elements.length}`);
        // Show top 5 elements
        console.log('\nTop 5 elements:');
        snap.elements.slice(0, 5).forEach((el, i) => {
            console.log(`${i + 1}. [${el.role}] ${el.text || '(no text)'} (importance: ${el.importance})`);
        });
        // Save snapshot
        fs.writeFileSync('snapshot_example.json', JSON.stringify(snap, null, 2));
        console.log('\n✅ Snapshot saved to snapshot_example.json');
    }
    finally {
        await browser.close();
    }
}
main().catch(console.error);
//# sourceMappingURL=basic-agent.js.map