# Fringe Event Scraper (index.js)

A Puppeteer-based web scraper that extracts event information from the Fringe Festival website.

## Purpose
Scrapes event details (title, venue, description, schedule, time) from `tickets.fringe.co.nz` and saves them to JSON.

## Prerequisites
```bash
npm install puppeteer
```

## Input Files
- **`f2026.csv`** - List of priority/favorite event URLs (one per line)

## Output Files
- **`fringe_all_events.json`** - All scraped event data

## Usage
```bash
node index.js
```

## How It Works
1. **Discovery Phase**: Navigates to the events page and discovers all available event URLs
2. **Priority Phase**: Reads priority URLs from `f2026.csv` and merges with discovered URLs
3. **Scraping Phase**: Visits each event page and extracts:
   - Title
   - Venue/Location
   - Description
   - Available dates (from calendar or schedule list)
   - Performance time

Data is auto-saved every 10 events to prevent data loss.
