const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: true }); // Headless for speed
    const page = await browser.newPage();
    const url = "https://tickets.fringe.co.nz/event/446:8221/"; // Example from f2026.csv

    try {
        console.log(`Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded' });

        // Attempt to identify selectors
        const title = await page.evaluate(() => document.querySelector('h1')?.innerText);
        const schedule = await page.evaluate(() => document.querySelector('.schedule')?.innerText);
        const description = await page.evaluate(() => document.querySelector('.description')?.innerText || document.querySelector('.event-description')?.innerText); // Guessing class

        // Dump some body HTML to help find selectors if guesses fail
        const bodysample = await page.content();

        console.log("--- PROBE RESULTS ---");
        console.log({ title, schedule, description_found: !!description });

        if (!title || !description || !schedule) {
            console.log("--- HTML DUMP (Partial) ---");
            console.log(bodysample.slice(0, 2000)); // First 2000 chars
        }

    } catch (error) {
        console.error(error);
    } finally {
        await browser.close();
    }
})();
