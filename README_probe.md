# Probe Utility (probe.js)

A debug/testing utility for inspecting Fringe Festival event page structure.

## Purpose
Tests page selectors and dumps HTML content to help identify correct CSS selectors for scraping.

## Prerequisites
```bash
npm install puppeteer
```

## Usage
```bash
node probe.js
```

## What It Does
1. Opens a sample event page (hardcoded URL)
2. Attempts to find title, schedule, and description elements
3. Logs what was found
4. Dumps partial HTML if elements weren't found

## Use Case
Run this when:
- The scraper isn't finding data correctly
- The website structure has changed
- You need to identify new CSS selectors
