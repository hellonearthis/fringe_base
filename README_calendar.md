# Calendar Generator (generate_calendar.js)

Generates an interactive HTML calendar view from scraped Fringe Festival event data.

## Purpose
Creates `fringe_calendar.html` - a styled, interactive calendar showing all events with timeline visualization and favorites highlighting.

## Prerequisites
```bash
# No additional dependencies needed - uses built-in Node.js modules
```

## Input Files
- **`fringe_all_events.json`** - Event data from the scraper
- **`f2026.csv`** - List of priority/favorite event URLs

## Output Files
- **`fringe_calendar.html`** - The interactive calendar view
- **`fringe_data.js`** - JavaScript data file loaded by the HTML

## Usage
```bash
node generate_calendar.js
```

## Features Generated
- **Monthly Calendar Grids**: February and March 2026
- **Show Timeline**: Visual timeline of shows for selected day
- **Click-and-Drag Zoom**: Zoom into time ranges on the timeline
- **Jump to Description**: Click timeline bars to scroll to show details
- **Analogous Venue Colors**: Venues cycle through (Solid, Analogous -45°, Analogous +45°) to ensure visual distinctness even when sharing a base hue.

## How It Works
1. Loads event data and priority URLs
2. Maps venues to unique base hues
3. Processes venues sharing the same hue using an **analogous color cycle**:
    - **1st usage**: Solid base color
    - **2nd usage**: Gradient fading to hue -45°
    - **3rd usage**: Gradient fading to hue +45°
4. Generates `fringe_data.js` with data and color mappings
5. Generates self-contained `index.html` with modern, responsive styling
