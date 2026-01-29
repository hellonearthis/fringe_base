
const https = require('https');
const fs = require('fs');
const path = require('path');

const START_DATE = new Date('2026-02-13');
const END_DATE = new Date('2026-03-07');

const verifiedSchedule = {}; // { "Show Title": { "Venue A": ["13/02/2026"], "Venue B": ["18/02/2026"] } }

function formatDate(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

function decodeHtml(html) {
    return html.replace(/&#039;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function fetchPage(dateStr) {
    return new Promise((resolve, reject) => {
        const urlEncoded = encodeURIComponent(dateStr);
        const url = `https://tickets.fringe.co.nz/events?s=&venue=&subvenue=&event_type=&start_date=${urlEncoded}`;

        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', (err) => reject(err));
    });
}

function extractEvents(html) {
    const events = [];

    // Using pair-based logic to capture Title + Venue for each card.

    // HTML Structure assumption:
    // ...
    //   <h4 class="primary-color two-line-clamp">TITLE</h4>
    // ...
    //   <p class="dt-loc event-location"> ... <span class="one-line-clamp">VENUE</span> ... </p>
    // ...

    const titleRegex = /<h4 class="primary-color two-line-clamp">([^<]+)<\/h4>/g;
    const venueRegex = /<p class="dt-loc event-location">[\s\S]*?<span class="one-line-clamp">([^<]+)<\/span>/g;

    let titleMatch, venueMatch;

    while ((titleMatch = titleRegex.exec(html)) !== null) {
        const title = decodeHtml(titleMatch[1].trim());

        // Find the next venue after this title
        venueRegex.lastIndex = titleRegex.lastIndex; // Start searching for venue AFTER the title
        venueMatch = venueRegex.exec(html);

        if (venueMatch) {
            const location = decodeHtml(venueMatch[1].trim());
            events.push({ title, location });
        } else {
            console.warn(`Found title "${title}" but could not find associated venue.`);
        }
    }

    return events;
}

async function run() {
    let currentDate = new Date(START_DATE);

    console.log('Starting venue-aware verification scrape...');

    while (currentDate <= END_DATE) {
        const dateStr = formatDate(currentDate);
        console.log(`Checking date: ${dateStr}`);

        try {
            const html = await fetchPage(dateStr);
            const events = extractEvents(html);

            console.log(`  Found ${events.length} shows.`);

            events.forEach(ev => {
                const { title, location } = ev;

                if (!verifiedSchedule[title]) {
                    verifiedSchedule[title] = {};
                }
                if (!verifiedSchedule[title][location]) {
                    verifiedSchedule[title][location] = [];
                }

                verifiedSchedule[title][location].push(dateStr);
            });

        } catch (err) {
            console.error(`  Failed to fetch ${dateStr}:`, err.message);
        }

        currentDate.setDate(currentDate.getDate() + 1);
        await new Promise(r => setTimeout(r, 200));
    }

    fs.writeFileSync('verified_schedule.json', JSON.stringify(verifiedSchedule, null, 2));
    console.log(`Verification complete. Data saved to verified_schedule.json.`);
}

run();
