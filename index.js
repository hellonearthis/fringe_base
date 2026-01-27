/**
 * Fringe Event Scraper
 * Extracts event details from tickets.fringe.co.nz using Puppeteer.
 * 
 * This tool was originally developed to scrape past years' data for personal use.
 * It is now part of the WellyFringe 2026 toolset.
 */

const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  try {
    // Initialize headless browser
    const browser = await puppeteer.launch({ headless: true });
    if (!browser) throw new Error('Browser initialization failed');

    const browserPage = await browser.newPage();

    // 1. DISCOVERY PHASE: Find all event pages
    console.log('--- Phase 1: Discovering all events ---');

    // We navigate to the events listing with an empty query to show all available shows
    const eventsListingUrl = 'https://tickets.fringe.co.nz/events?s=&venue=&subvenue=&event_type=';
    await browserPage.goto(eventsListingUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for the "Book Now" buttons which point to individual event pages
    const eventLinkSelector = 'a.btn.btn-success.secondary-border-color';
    await browserPage.waitForSelector(eventLinkSelector, { timeout: 30000 });

    const allDiscoveredEventUrls = await browserPage.evaluate((selector) => {
      const links = Array.from(document.querySelectorAll(selector))
        .map(anchor => anchor.href);
      return [...new Set(links)]; // Deduplicate URLs
    }, eventLinkSelector);

    console.log(`Discovered ${allDiscoveredEventUrls.length} unique event URLs.`);

    // 2. PRIORITY PHASE: Load user favorites and build the full queue
    console.log('--- Phase 2: Processing Priorities ---');
    const priorityDataFile = './f2026.csv';
    const rawPriorityData = fs.readFileSync(priorityDataFile, 'utf8');

    let userDefinedPriorityUrls = [];
    try {
      // Try parsing as JSON first, then fallback to CSV/line-based format
      userDefinedPriorityUrls = JSON.parse(rawPriorityData);
    } catch (parseError) {
      userDefinedPriorityUrls = rawPriorityData
        .split('\n')
        .filter(line => line.trim() !== '')
        .map(line => line.trim().replace(/['",]/g, ''));
    }

    // Define the full queue: Favorites first, then the rest
    const priorityUrlSet = new Set(userDefinedPriorityUrls);
    const nonPriorityUrls = allDiscoveredEventUrls.filter(url => !priorityUrlSet.has(url));
    const fullScrapeQueue = [...userDefinedPriorityUrls, ...nonPriorityUrls];

    console.log(`Queue ready: ${fullScrapeQueue.length} total events (${userDefinedPriorityUrls.length} prioritized).`);

    const scrapedResults = [];

    // 3. SCRAPING PHASE: Visit each event page
    console.log('--- Phase 3: Scraping Event Data ---');
    for (let currentQueueIndex = 0; currentQueueIndex < fullScrapeQueue.length; currentQueueIndex++) {
      const currentEventUrl = fullScrapeQueue[currentQueueIndex];
      if (!currentEventUrl) continue;

      console.log(`[${currentQueueIndex + 1}/${fullScrapeQueue.length}] Scraping: ${currentEventUrl}`);

      try {
        await browserPage.goto(currentEventUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await browserPage.waitForSelector('body', { timeout: 10000 });

        // Extract metadata from the current event page
        const eventMetadata = await browserPage.evaluate(() => {
          /**
           * Extracts the event title
           */
          const title = document.querySelector('h2.primary-color')?.innerText.trim();

          /**
           * Extracts the venue name by finding the "Venue" header
           */
          let venueLocation = "";
          const venueHeading = Array.from(document.querySelectorAll('h2, h3, h4'))
            .find(el => el.innerText.trim() === 'Venue');

          if (venueHeading && venueHeading.nextElementSibling) {
            venueLocation = venueHeading.nextElementSibling.innerText.trim().split('\n')[0];
          }

          /**
           * Extracts a brief description (usually the first substantial paragraph)
           */
          let description = "";
          const contentContainer = document.querySelector('.container.py-5') || document.body;
          const paragraphs = Array.from(contentContainer.querySelectorAll('p'));
          const targetParagraph = paragraphs.find(p => p.innerText.length > 50) || paragraphs[0];
          if (targetParagraph) description = targetParagraph.innerText.trim();

          const monthNames = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
          ];

          /**
           * Helper to resolve the correct date based on calendar state (new/old month classes)
           */
          function resolveFullDate(day, monthYearText, classList) {
            if (!monthYearText) return day;
            const textParts = monthYearText.split(' ');
            if (textParts.length < 2) return `${day} ${monthYearText}`;

            const monthName = textParts[0];
            const year = textParts[1];
            let monthIndex = monthNames.indexOf(monthName);
            let currentYear = parseInt(year);

            if (classList.contains('new')) {
              monthIndex++;
              if (monthIndex > 11) { monthIndex = 0; currentYear++; }
            } else if (classList.contains('old')) {
              monthIndex--;
              if (monthIndex < 0) { monthIndex = 11; currentYear--; }
            }
            return `${day} ${monthNames[monthIndex]} ${currentYear}`;
          }

          /**
           * Helper to turn "3-7 March 2026" into a comma-separated list of days
           */
          function expandDateRange(text) {
            const rangePattern = /^(\d+)-(\d+)\s+([a-zA-Z]+)\s+(\d{4})$/;
            const match = text.match(rangePattern);
            if (match) {
              const startDay = parseInt(match[1]);
              const endDay = parseInt(match[2]);
              const month = match[3];
              const year = match[4];
              const daysInRange = [];
              for (let d = startDay; d <= endDay; d++) {
                daysInRange.push(`${d} ${month} ${year}`);
              }
              return daysInRange.join(', ');
            }
            return text;
          }

          // Search for scheduled days using the calendar widget
          const calendarMonthYear = document.querySelector('.datepicker-days th.datepicker-switch')?.innerText.trim();
          let availableDates = Array.from(document.querySelectorAll('td.day.green'))
            .map(cell => resolveFullDate(cell.innerText.trim(), calendarMonthYear, cell.classList))
            .join(', ');

          // Fallback: Check for schedule lists if no calendar is found
          if (!availableDates) {
            const listItems = Array.from(document.querySelectorAll('ul.schedule li'));
            const dateListItem = listItems.find(li => li.querySelector('img[src*="calendar.svg"]'));
            if (dateListItem) {
              availableDates = expandDateRange(dateListItem.innerText.trim());
            }
          }

          // Find performance time from hidden JSON or page text
          let performanceTime = "";
          const pageHtmlContent = document.documentElement.innerHTML;
          const timeDataMatch = pageHtmlContent.match(/"performanceTime":"([^"]+)"/) ||
            pageHtmlContent.match(/&quot;performanceTime&quot;:&quot;([^&]+)&quot;/);

          if (timeDataMatch) {
            performanceTime = timeDataMatch[1];
          }

          // Fallback: Look for HH:MM pattern in the schedule section
          if (!performanceTime) {
            const timeListItem = Array.from(document.querySelectorAll('ul.schedule li'))
              .find(li => li.innerText.match(/\d{1,2}:\d{2}/));
            if (timeListItem) performanceTime = timeListItem.innerText.trim();
          }

          // --- DETAILED SCHEDULE EXTRACTION ---
          // Parse the data-performances attribute which contains the authoritative schedule
          let detailedSchedule = [];
          try {
            const eventDataEl = document.querySelector('#event-data');
            if (eventDataEl) {
              const rawJson = eventDataEl.getAttribute('data-performances');
              if (rawJson) {
                const perfData = JSON.parse(rawJson);
                // perfData.times is an object: { "20/02/2026": [ { performanceTime: "7:00 pm", ... } ], ... }
                if (perfData.times) {
                  Object.keys(perfData.times).forEach(dateKey => {
                    const dailyShows = perfData.times[dateKey];
                    dailyShows.forEach(show => {
                      // Convert dateKey "20/02/2026" to "20 February 2026"
                      // But show.performanceDate often has "20th February 2026 7:00 pm"
                      // We can use the date key or the object.

                      // Let's rely on our own formatting to match the app's standard: 
                      // dateKey is DD/MM/YYYY.
                      const [d, m, y] = dateKey.split('/');
                      const monthIndex = parseInt(m) - 1;
                      const dateObj = new Date(y, monthIndex, d);
                      const dateStr = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

                      detailedSchedule.push({
                        date: dateStr, // e.g., "20 February 2026"
                        time: show.performanceTime, // e.g., "7:00 pm"
                        iso: show.performanceRealTime // e.g., "2026-02-20 19:00:00"
                      });
                    });
                  });
                }
              }
            }
          } catch (e) {
            console.error("Error parsing detailed schedule", e);
          }

          return {
            title,
            venue: venueLocation,
            description,
            scheduleList: availableDates,
            time: performanceTime,
            genre: genre,
            detailedSchedule: detailedSchedule // Return the new rich data
          };
        });

        console.log(`Scraped: ${eventMetadata.title} [${eventMetadata.genre}]`);

        scrapedResults.push({
          title: eventMetadata.title,
          loc: eventMetadata.venue,
          desc: eventMetadata.description,
          link: currentEventUrl,
          schedule: eventMetadata.scheduleList,
          time: eventMetadata.time,
          genre: eventMetadata.genre,
          detailedSchedule: eventMetadata.detailedSchedule
        });

        // Periodic save every 10 items to preserve progress
        if (scrapedResults.length % 10 === 0) {
          fs.writeFileSync('./fringe_all_events.json', JSON.stringify(scrapedResults, null, 2));
        }

      } catch (scrapeError) {
        console.error(`Error on ${currentEventUrl}: ${scrapeError.message}`);
      }
    }

    // Final data save
    const outputFileName = './fringe_all_events.json';
    fs.writeFileSync(outputFileName, JSON.stringify(scrapedResults, null, 2));

    console.log(`Scraping finished. Results saved to ${outputFileName}`);

    await browser.close();

  } catch (globalError) {
    console.log(`Fatal Error: ${globalError.stack || globalError}`);
  }
})();
