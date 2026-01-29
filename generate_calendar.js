/**
 * Fringe Calendar Generator - Phase 4 Refactor (Month View)
 */

const fs = require('fs');

// 1. LOAD DATA
const scrapedEventsRaw = JSON.parse(fs.readFileSync('./fringe_all_events.json', 'utf8'));
const priorityShowUrls = [];

// 1a. DEDUPLICATE DATA
// Some events appear twice with slightly different URLs (e.g. trailing slash vs no slash)
// We deduplicate based on Title + Location + Time + Schedule
const scrapedEvents = [];
const seenKeys = new Set();

scrapedEventsRaw.forEach(ev => {
    // Create a unique key for the event properties that matter for the calendar
    const key = `${ev.title}|${ev.loc}|${ev.time}|${ev.schedule}`;

    if (!seenKeys.has(key)) {
        seenKeys.add(key);
        scrapedEvents.push(ev);
    } else {
        // console.log('Skipping duplicate:', ev.title);
    }
});
console.log(`Deduplication: Reduced ${scrapedEventsRaw.length} events to ${scrapedEvents.length}.`);

// 1b. LOAD VERIFIED SCHEDULE (Ground Truth)
let verifiedSchedule = {};
try {
    verifiedSchedule = JSON.parse(fs.readFileSync('./verified_schedule.json', 'utf8'));
    console.log(`Loaded verified schedule for ${Object.keys(verifiedSchedule).length} shows.`);
} catch (e) {
    console.warn("Could not load verified_schedule.json, using scraper defaults.");
}

// Helper to convert "13/02/2026" -> "13 February 2026"
function convertVerifiedDate(dStr) {
    const [d, m, y] = dStr.split('/');
    const dateObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    return dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// 1c. PRE-PROCESS DATA (Compute Dates)
let verifiedCount = 0;
let scraperFallbackCount = 0;

scrapedEvents.forEach(ev => {
    // Try to find verified dates based on TITLE
    let verifiedVenues = verifiedSchedule[ev.title];
    let matchedDates = null;

    if (verifiedVenues) {
        // We have verified data for this title. Now check which venue matches.
        // ev.loc is the scraping location (e.g. "Circus Bar")
        // verifiedVenues keys are e.g. "Circus Bar" or "Whisky & Wood"

        const locNormal = ev.loc.toLowerCase().trim();

        // 1. Direct Match
        // 2. Fuzzy Match (substring)

        // Exact match check
        for (const [vName, dates] of Object.entries(verifiedVenues)) {
            if (vName.toLowerCase().trim() === locNormal) {
                matchedDates = dates;
                break;
            }
        }

        // Fallback: Check for substring inclusion (e.g. "Circus Bar" in "The Circus Bar")
        if (!matchedDates) {
            for (const [vName, dates] of Object.entries(verifiedVenues)) {
                const verifiedNorm = vName.toLowerCase().trim();
                if (verifiedNorm.includes(locNormal) || locNormal.includes(verifiedNorm)) {
                    matchedDates = dates;
                    break;
                }
            }
        }
    }

    if (matchedDates && matchedDates.length > 0) {
        // Use the verified dates!
        const uniqueDates = [...new Set(matchedDates)];
        ev.dateList = uniqueDates.map(convertVerifiedDate);
        verifiedCount++;
    } else {
        // Fallback to original schedule string logic
        scraperFallbackCount++;
        // console.log(`No verified venue match for "${ev.title}" at "${ev.loc}"`);
        if (ev.schedule) {
            ev.dateList = ev.schedule.split(',').map(s => s.trim());
        } else {
            ev.dateList = [];
        }
    }
});

console.log(`Verification Status: ${verifiedCount} shows verified against official schedule.`);
console.log(`Verification Status: ${scraperFallbackCount} shows using original scraper data (no match found).`);
if (scraperFallbackCount > 0) {
    console.warn("Note: Some shows did not match the verified schedule titles exactly. They are still included but use unverified dates.");
}

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
            <p style="color: var(--text-dim)">The data on this page might not be correct so please check <a class="event-link" href="https://wellingtonfringe.co.nz/" style="text-decoration: underline;">wellingtonfringe.co.nz</a> for the latest information.</br>
            Some events might have more than one show a day and might not be displayed correctly here.</br>
            Sorry about that, please check the website for the most up to date information.</br></p>
            </br>
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
