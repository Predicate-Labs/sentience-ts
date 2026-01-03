/**
 * Jest setup file - ensures Jest globals are available
 */

// This file ensures Jest types are loaded
// Jest provides expect, describe, it, etc. as globals

// Increase timeout for all tests (browser startup can be slow)
jest.setTimeout(60000); // 60 seconds
