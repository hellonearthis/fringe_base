const puppeteer = require('puppeteer');
const fs = require('fs');

// const fringe = require('./fringe_events.json'); // Legacy input

(async () => {
  try {
    const browser = await puppeteer.launch({ headless: true });
    if (!browser) throw new Error('Browser not defined');

    const page = await browser.newPage();

    // 1. DISCOVERY PHASE
    console.log('Discovering all events...');
    // We navigate to the events page with an empty search to list all events
    await page.goto('https://tickets.fringe.co.nz/events?s=&venue=&subvenue=&event_type=', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for the "Book Now" buttons which link to event pages
    await page.waitForSelector('a.btn.btn-success.secondary-border-color', { timeout: 30000 });

    const discoveredUrls = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a.btn.btn-success.secondary-border-color'))
        .map(a => a.href);
      return [...new Set(links)]; // Deduplicate
    });

    console.log(`Discovered ${discoveredUrls.length} unique event URLs.`);

    // 2. PRIORITY PHASE
    const rawData = fs.readFileSync('./f2026.csv', 'utf8');
    let priorityUrls = [];
    try {
      priorityUrls = JSON.parse(rawData);
    } catch (e) {
      priorityUrls = rawData.split('\n').filter(line => line.trim() !== '').map(line => line.trim().replace(/['",]/g, ''));
    }

    // Merge: Priority first, then all others discovered (excluding duplicates)
    const prioritySet = new Set(priorityUrls);
    const otherUrls = discoveredUrls.filter(url => !prioritySet.has(url));
    const allUrls = [...priorityUrls, ...otherUrls];

    console.log(`Total queue size: ${allUrls.length} (${priorityUrls.length} priority, ${otherUrls.length} others)`);

    const results = [];

    // 3. SCRAPING PHASE
    for (let i = 0; i < allUrls.length; i++) {
      const link = allUrls[i];
      if (!link) continue;

      console.log(`[${i + 1}/${allUrls.length}] Loading page: ${link}`);

      try {
        // Relaxed navigation to avoid timeouts on slow assets
        await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Ensure at least the main content wrapper or title is loaded
        await page.waitForSelector('body', { timeout: 10000 });

        // Scrape details
        const details = await page.evaluate(() => {
          const title = document.querySelector('h2.primary-color')?.innerText.trim();

          // Location: Find header saying "Venue" and get next element
          let loc = "";
          const venueHeader = Array.from(document.querySelectorAll('h2, h3, h4')).find(el => el.innerText.trim() === 'Venue');
          if (venueHeader && venueHeader.nextElementSibling) {
            loc = venueHeader.nextElementSibling.innerText.trim().split('\n')[0];
          }

          // Description: Look for paragraphs in the main container (usually .container.py-5)
          let desc = "";
          const mainContainer = document.querySelector('.container.py-5') || document.body;
          const ps = Array.from(mainContainer.querySelectorAll('p'));
          const descP = ps.find(p => p.innerText.length > 50) || ps[0];
          if (descP) desc = descP.innerText.trim();

          // Date Helpers
          const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

          function getFullDate(day, monthYearStr, classList) {
            if (!monthYearStr) return day;
            const parts = monthYearStr.split(' ');
            if (parts.length < 2) return `${day} ${monthYearStr}`;
            const monthName = parts[0];
            const year = parts[1];
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

          function expandRange(text) {
            // Handle range like "3-7 March 2026"
            const rangeMatch = text.match(/^(\d+)-(\d+)\s+([a-zA-Z]+)\s+(\d{4})$/);
            if (rangeMatch) {
              const startDay = parseInt(rangeMatch[1]);
              const endDay = parseInt(rangeMatch[2]);
              const month = rangeMatch[3];
              const year = rangeMatch[4];
              const expanded = [];
              for (let d = startDay; d <= endDay; d++) {
                expanded.push(`${d} ${month} ${year}`);
              }
              return expanded.join(', ');
            }
            return text;
          }

          // Schedule: Look for green days in calendar
          const monthYear = document.querySelector('.datepicker-days th.datepicker-switch')?.innerText.trim();
          let availableDays = Array.from(document.querySelectorAll('td.day.green'))
            .map(el => getFullDate(el.innerText.trim(), monthYear, el.classList))
            .join(', ');

          // Fallback: If no calendar days found, look for the schedule list with calendar icon
          if (!availableDays) {
            const scheduleListItems = Array.from(document.querySelectorAll('ul.schedule li'));
            const dateItem = scheduleListItems.find(li => li.querySelector('img[src*="calendar.svg"]'));
            if (dateItem) {
              availableDays = expandRange(dateItem.innerText.trim());
            }
          }

          // Time: Look for performanceTime in the page source
          let time = "";
          const html = document.documentElement.innerHTML;
          const timeMatch = html.match(/"performanceTime":"([^"]+)"/) || html.match(/&quot;performanceTime&quot;:&quot;([^&]+)&quot;/);
          if (timeMatch) {
            time = timeMatch[1];
          }

          // Fallback: search for HH:MM pattern in schedule list
          if (!time) {
            const timeLi = Array.from(document.querySelectorAll('ul.schedule li')).find(li => li.innerText.match(/\d{1,2}:\d{2}/));
            if (timeLi) time = timeLi.innerText.trim();
          }

          return { title, loc, desc, schedule: availableDays, time };
        });

        console.log(`Scraped: ${details.title} [${details.time || 'No Time'}]`);

        results.push({
          title: details.title,
          loc: details.loc,
          desc: details.desc,
          link: link,
          schedule: details.schedule,
          time: details.time
        });

        // Periodic save to avoid losing data in case of crash
        if (results.length % 10 === 0) {
          fs.writeFileSync('./fringe_all_events.json', JSON.stringify(results, null, 2));
        }

      } catch (err) {
        console.error(`Failed to scrape ${link}: ${err.message}`);
      }
    }

    // Save final output
    fs.writeFileSync('./fringe_all_events.json', JSON.stringify(results, null, 2));

    console.log('Scraping complete. Data saved to fringe_all_events.json');

    await browser.close();

  } catch (error) {
    console.log(`Error occurred: ${error}`);
  }
})();
