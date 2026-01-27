/**
 * Fringe Calendar Generator - Phase 4 Refactor (Month View)
 */

const fs = require('fs');

// 1. LOAD DATA
const scrapedEvents = JSON.parse(fs.readFileSync('./fringe_all_events.json', 'utf8'));
const priorityShowUrls = [];

// 1b. PRE-PROCESS DATA (Compute Dates)
scrapedEvents.forEach(ev => {
    if (ev.schedule) {
        // Split "4 March 2026, 5 March 2026" into array
        ev.dateList = ev.schedule.split(',').map(s => s.trim());
    } else {
        ev.dateList = [];
    }
});

// 2. CONFIGURATION
const uniqueVenues = [...new Set(scrapedEvents.map(e => e.loc))].sort();
const venueColorMap = {};

// Carefully spaced hues (perceptually distinct)
const hues = [
    0,    // red
    20,   // orange-red
    45,   // orange
    75,   // yellow-green
    110,  // green
    160,  // teal
    200,  // cyan-blue
    245,  // blue
    290   // purple
];

// Visual tuning
const SATURATION = 80;
const BASE_LIGHTNESS = 52;

// First N buttons stay solid
const SOLID_LIMIT = 8;

// Analogous gradient accent
function gradientFor(h, targetH, s, l) {
    return `linear-gradient(to right,
    hsl(${h}, ${s}%, ${l}%) 0%,
    hsl(${h}, ${s}%, ${l}%) 50%,
    hsl(${targetH}, ${s}%, ${l}%) 100%
  )`;
}

const hueUsageCount = {};
uniqueVenues.forEach((venue, index) => {
    const hueIndex = index % hues.length;
    const hue = hues[hueIndex];

    if (hueUsageCount[hueIndex] === undefined) hueUsageCount[hueIndex] = 0;
    const count = hueUsageCount[hueIndex]++;

    if (count === 0) {
        // Clean solid colour
        venueColorMap[venue] = `hsl(${hue}, ${SATURATION}%, ${BASE_LIGHTNESS}%)`;
    } else if (count === 1) {
        // Gradient to Analogous 1 (Hue - 45)
        const h1 = (hue - 45 + 360) % 360;
        venueColorMap[venue] = gradientFor(hue, h1, SATURATION, BASE_LIGHTNESS);
    } else {
        // Gradient to Analogous 2 (Hue + 45)
        const h2 = (hue + 45) % 360;
        venueColorMap[venue] = gradientFor(hue, h2, SATURATION, BASE_LIGHTNESS);
    }
});


const genreEmojiMap = {
    'Comedy': '😂',
    'Stand Up': '🎤',
    'Theatre': '🎭',
    'Music': '🎵',
    'Cabaret': '💃',
    'Dance': '🩰',
    'Circus': '🎪',
    'Visual Art': '🎨',
    'Visual Arts': '🎨',
    'Talk': '🗣️',
    'Workshop': '🛠️',
    'Family': '👪',
    'Improvisation': '🎲',
    'Improv': '🎲',
    'Poetry': '✒️',
    'Spoken Word': '🎤',
    'Spoken word/storytelling': '📖',
    'Musical Theatre': '🎹',
    'Musical': '🎹',
    'Puppetry': '🧸',
    'Clown': '🤡',
    'Outdoor': '🌳',
    'LGBTQIA+': '🏳️‍🌈',
    'Digital Media': '💻',
    'Mixed Reality': '🕶️',
    'Audio Art': '🎧',
    'Literature': '📚',
    'Live Art': '🎨',
    'Circle show/busking': '🤹',
    'Film': '🎬',
    'Fizzing Jazz': '🎷',
    'Interactive': '🎮',
    'General': '✨',
    'Physical Theatre': '🤸',
    'Other': '❓',
    'Online': '🌐',
    'Workshop': '🛠️',
    'Magic': '🪄',
    'Devised': '⚙️',
    'Visual art': '🎨',
    'Other, Spoken word/storytelling, Theatre': '📖',
    'Other, Stand Up, Comedy': '🎤'
};

// 3. GENERATE DATA FILE
// Note: scrapedEvents now includes the computed 'dateList' property
const dataStoreContent = [
    'const ALL_EVENTS = ' + JSON.stringify(scrapedEvents) + ';',
    'const PRIORITY_URLS = ' + JSON.stringify(priorityShowUrls) + ';',
    'const VENUE_COLORS = ' + JSON.stringify(venueColorMap) + ';',
    'const GENRE_EMOJIS = ' + JSON.stringify(genreEmojiMap) + ';'
].join('\n');

fs.writeFileSync('./fringe_data.js', dataStoreContent);

// 4. HTML GENERATION HELPERS
function getEventsForDate(dateStr) {
    // New logic: Check the pre-computed array
    return scrapedEvents.filter(ev => ev.dateList.includes(dateStr));
}

function renderMonth(year, monthIndex, monthName) {
    const firstDay = new Date(year, monthIndex, 1);
    const lastDay = new Date(year, monthIndex + 1, 0);
    const totalDays = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay(); // Sunday start (0)

    let html = `<div class="month-card">
        <div class="month-title">${monthName} ${year}</div>
        <div class="weekdays-row">
            <div class="weekday">Sun</div><div class="weekday">Mon</div><div class="weekday">Tue</div>
            <div class="weekday">Wed</div><div class="weekday">Thu</div><div class="weekday">Fri</div>
            <div class="weekday">Sat</div>
        </div>
        <div class="days-grid">`;

    // Empty cells
    for (let i = 0; i < startDayOfWeek; i++) {
        html += `<div class="day-cell empty"></div>`;
    }

    // Day cells
    for (let d = 1; d <= totalDays; d++) {
        const dateObj = new Date(year, monthIndex, d);
        const fullDateStr = `${d} ${monthName} ${year}`;
        const dayEvents = getEventsForDate(fullDateStr);
        // Note: Priority stars removed per user preference earlier, but keeping variable if needed later
        // const isPriority = dayEvents.some(e => priorityShowUrls.includes(e.link));

        const hasShowsClass = dayEvents.length > 0 ? 'has-shows' : 'no-shows';

        html += `<div class="day-cell ${hasShowsClass}" data-action="select-day" data-date="${fullDateStr}">
            <span class="day-num">${d}</span>
        </div>`;
    }

    html += `</div></div>`;
    return html;
}

// 5. BOILERPLATE & ASSEMBLY
const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Wellington Fringe 2026</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="fringe_style.css">
    <script src="fringe_data.js"></script>
</head>
<body>
    <div class="container">
        <div class="title-container">
            <h1>Wellington Fringe 2026</h1>
            <p style="color: var(--text-dim)">The data on this page might not be correct so please check <a class="event-link" href="https://wellingtonfringe.co.nz/" style="text-decoration: underline;">wellingtonfringe.co.nz</a> for the latest information.</p></br>Some events might have more than one show a day and might not be displayed correctly here. This is due to the data being scraped from the website and not being able to handle multiple shows per day.</br></br>
            <p style="color: var(--text)">Click a date to see shows on that day.</p>
        </div>

        <div class="calendars-wrapper">
            ${renderMonth(2026, 1, 'February')}
            ${renderMonth(2026, 2, 'March')}
        </div>

        <div class="day-details-container" id="day-details">
            <div class="placeholder-text">Click a date above to view shows.</div>
        </div>
    </div>

    <script src="fringe_calendar_app.js"></script>
</body>
</html>`;

fs.writeFileSync('./index.html', htmlTemplate);
console.log('Successfully generated calander  index.html (Month View)');
