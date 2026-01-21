/**
 * Fringe Calendar Frontend JavaScript
 * ====================================
 * This file contains all the interactive logic for the Wellington Fringe 2026 calendar.
 * 
 * Dependencies (loaded before this script):
 * - fringe_data.js: Contains ALL_EVENTS, PRIORITY_URLS, VENUE_COLORS, GENRE_EMOJIS
 */

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initCalendar);

// Global state for drag prevention (prevents clicking after dragging)
let didDrag = false;

// Global state for filtering
let currentDayOriginalEvents = [];
let currentDateString = "";
let activeGenres = new Set();
let activeVenues = new Set();

// =============================================================================
// INITIALIZATION & EVENT DELEGATION
// =============================================================================

function initCalendar() {
    const appContainer = document.body;

    // CENTRALIZED EVENT LISTENER
    appContainer.addEventListener('click', (event) => {
        // Prevent click logic if we just finished a drag
        if (didDrag) return;

        const target = event.target;

        // 1. Day Selection
        const dayCell = target.closest('[data-action="select-day"]');
        if (dayCell) {
            const dateStr = dayCell.dataset.date;
            selectDay(dateStr, dayCell);
            return;
        }

        // 2. Event Card Click (Popup)
        const eventCard = target.closest('[data-action="open-popup"]');
        if (eventCard) {
            const title = eventCard.dataset.title;
            openPopup(title);
            return;
        }

        // 3. Close Popup (X button)
        if (target.closest('[data-action="close-popup"]')) {
            closePopup();
            return;
        }

        // 4. Close Popup (Overlay click)
        if (target.id === 'popup-overlay') {
            closePopup();
            return;
        }
    });

    // AUTO-SELECT TODAY IF IN RANGE
    const today = new Date();
    const todayStr = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const todayCell = document.querySelector(`[data-date="${todayStr}"]`);

    if (todayCell) {
        console.log('Auto-selecting today:', todayStr);
        selectDay(todayStr, todayCell);
    }

    console.log('Calendar initialized.');
}

// =============================================================================
// TIME PARSING
// =============================================================================

function parseTime(timeString) {
    if (!timeString) return 9999;
    const match = timeString.match(/(\d+):(\d+)\s*(am|pm)/i);
    if (!match) return 9999;

    let hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const period = match[3].toLowerCase();

    if (period === 'pm' && hours < 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;

    return hours * 60 + minutes;
}

// =============================================================================
// GENRE EMOJI HELPERS
// =============================================================================

function getGenreEmoji(genreStr) {
    if (!genreStr || typeof GENRE_EMOJIS === 'undefined') return '';
    // Split by comma and trim
    const genres = genreStr.split(',').map(g => g.trim());
    // Find the first matching emoji
    for (const g of genres) {
        if (GENRE_EMOJIS[g]) return GENRE_EMOJIS[g] + ' ';
    }
    return '';
}

function renderLegends(events, container, type, currentFilters = {}) {
    if (!events || events.length === 0 || typeof GENRE_EMOJIS === 'undefined' || typeof VENUE_COLORS === 'undefined') return;

    const legendDiv = document.createElement('div');
    legendDiv.className = `legend-container ${type}-legend`;

    const title = document.createElement('div');
    title.className = 'legend-title';
    title.innerText = type === 'genre' ? 'Show Style Legend' : 'Venue Color Legend';
    legendDiv.appendChild(title);

    // Calculate which items ARE actually present given OTHER filters
    const availableItems = new Set();
    events.forEach(ev => {
        // For genre legend, check if show matches venue filter
        // For venue legend, check if show matches genre filter
        let matchesOther = true;
        if (type === 'genre' && currentFilters.venues) {
            matchesOther = currentFilters.venues.has(ev.loc);
        } else if (type === 'venue' && currentFilters.genres) {
            const evGenres = ev.genre ? ev.genre.split(',').map(g => g.trim()) : [];
            matchesOther = evGenres.length === 0 || evGenres.some(g => currentFilters.genres.has(g));
        }

        if (matchesOther) {
            if (type === 'genre' && ev.genre) {
                ev.genre.split(',').forEach(g => availableItems.add(g.trim()));
            } else if (type === 'venue') {
                availableItems.add(ev.loc);
            }
        }
    });

    let addedItems = false;
    if (type === 'genre') {
        const uniqueGenres = new Set();
        events.forEach(ev => {
            if (ev.genre) {
                ev.genre.split(',').forEach(g => uniqueGenres.add(g.trim()));
            }
        });

        [...uniqueGenres].sort().forEach(genre => {
            const emoji = GENRE_EMOJIS[genre];
            if (emoji) {
                // If it's NOT available after OTHER filters, hide it entirely (as requested)
                if (!availableItems.has(genre)) return;

                const item = document.createElement('div');
                item.className = 'legend-item';
                if (!activeGenres.has(genre)) item.classList.add('inactive');

                item.onclick = (e) => {
                    e.stopPropagation();
                    if (activeGenres.has(genre)) {
                        activeGenres.delete(genre);
                    } else {
                        activeGenres.add(genre);
                    }
                    renderFilteredDay();
                };

                item.innerHTML = `<span class="legend-emoji">${emoji}</span> <span>${genre}</span>`;
                legendDiv.appendChild(item);
                addedItems = true;
            }
        });
    } else {
        const uniqueVenues = [...new Set(events.map(ev => ev.loc))].sort();
        uniqueVenues.forEach(venue => {
            const color = VENUE_COLORS[venue];
            if (color) {
                // If it's NOT available after OTHER filters, hide it entirely
                if (!availableItems.has(venue)) return;

                const item = document.createElement('div');
                item.className = 'legend-item';
                if (!activeVenues.has(venue)) item.classList.add('inactive');

                item.onclick = (e) => {
                    e.stopPropagation();
                    if (activeVenues.has(venue)) {
                        activeVenues.delete(venue);
                    } else {
                        activeVenues.add(venue);
                    }
                    renderFilteredDay();
                };

                item.innerHTML = `<span class="legend-color-dot" style="background: ${color}"></span> <span>${venue}</span>`;
                legendDiv.appendChild(item);
                addedItems = true;
            }
        });
    }

    if (addedItems) {
        container.appendChild(legendDiv);
    }
}

// =============================================================================
// DAY SELECTION
// =============================================================================

function selectDay(dateString, clickedCell) {
    document.querySelectorAll('.day-cell').forEach(cell => {
        cell.classList.remove('selected');
    });

    if (clickedCell) {
        clickedCell.classList.add('selected');
    } else {
        const cell = document.querySelector(`[data-date="${dateString}"]`);
        if (cell) cell.classList.add('selected');
    }

    currentDateString = dateString;
    currentDayOriginalEvents = ALL_EVENTS.filter(event => event.dateList && event.dateList.includes(dateString));

    // Default: all active
    activeGenres = new Set();
    currentDayOriginalEvents.forEach(ev => {
        if (ev.genre) ev.genre.split(',').forEach(g => activeGenres.add(g.trim()));
    });
    activeVenues = new Set(currentDayOriginalEvents.map(ev => ev.loc));

    renderFilteredDay();
}

function renderFilteredDay() {
    const detailsContainer = document.getElementById('day-details');

    if (currentDayOriginalEvents.length === 0) {
        detailsContainer.innerHTML = `
            <div class="selected-date-header">${currentDateString}</div>
            <div class="placeholder-text">No shows scheduled for this day.</div>
        `;
        return;
    }

    // Check if this is the first time we're rendering this day (to avoid jumping on filter toggle)
    const isInitialRender = !detailsContainer.querySelector('.selected-date-header');

    detailsContainer.innerHTML = `
        <div class="selected-date-header">${currentDateString} (${currentDayOriginalEvents.length} Shows)</div>
    `;

    // Filter events: match if ANY genre is active AND venue is active
    const filteredEvents = currentDayOriginalEvents.filter(event => {
        const eventGenres = event.genre ? event.genre.split(',').map(g => g.trim()) : [];
        const matchesGenre = eventGenres.length === 0 || eventGenres.some(g => activeGenres.has(g));
        const matchesVenue = activeVenues.has(event.loc);
        return matchesGenre && matchesVenue;
    });

    // 1. Legend TOP (Pass Venue filter to Genre legend)
    renderLegends(currentDayOriginalEvents, detailsContainer, 'genre', { venues: activeVenues });

    // 2. Timeline
    renderTimeline(filteredEvents, currentDateString);

    // 3. Legend BOTTOM (Pass Genre filter to Venue legend)
    renderLegends(currentDayOriginalEvents, detailsContainer, 'venue', { genres: activeGenres });

    // 4. Event List
    const eventListContainer = document.createElement('div');
    eventListContainer.className = 'event-list';

    if (filteredEvents.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'placeholder-text';
        emptyMsg.innerText = 'No shows match selected filters.';
        emptyMsg.style.padding = '20px';
        eventListContainer.appendChild(emptyMsg);
    } else {
        filteredEvents.sort((a, b) => parseTime(a.time) - parseTime(b.time));
        filteredEvents.forEach(event => {
            const venueColor = VENUE_COLORS[event.loc] || '#888';
            const encodedTitle = event.title.replace(/"/g, '&quot;');
            const isPriorityShow = PRIORITY_URLS.includes(event.link);
            const genreEmoji = getGenreEmoji(event.genre);

            const eventCard = document.createElement('div');
            eventCard.className = 'event-card';
            eventCard.dataset.action = 'open-popup';
            eventCard.dataset.title = encodedTitle;
            eventCard.innerHTML = `
                <div class="event-time">${event.time || 'TBD'}</div>
                <div class="event-info">
                    <div class="event-title">${genreEmoji}${event.title} ${isPriorityShow ? '⭐' : ''}</div>
                    <div class="event-meta">
                        <span class="venue-pill" style="background: ${venueColor}">${event.loc}</span>
                    </div>
                </div>
            `;
            eventListContainer.appendChild(eventCard);
        });
    }

    detailsContainer.appendChild(eventListContainer);

    if (isInitialRender) {
        detailsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// =============================================================================
// TIMELINE RENDERING
// =============================================================================

function renderTimeline(events, dateString, zoomRange = null) {
    const detailsElement = document.getElementById('day-details');

    // 1. FIX: Ensure we only ever have ONE wrapper
    let timelineWrapper = detailsElement.querySelector('.timeline-wrapper');
    if (!timelineWrapper) {
        timelineWrapper = document.createElement('div');
        timelineWrapper.className = 'timeline-wrapper';
        detailsElement.appendChild(timelineWrapper);
    }
    timelineWrapper.innerHTML = ''; // Clear previous content

    // Header logic
    const headerElement = document.createElement('div');
    headerElement.className = 'timeline-header';
    headerElement.innerHTML = `<h3>Show Schedule Timeline <small style='font-weight:400; color:var(--text-dim); font-size:0.8rem'>(Drag background to zoom)</small></h3>`;

    const resetZoomButton = document.createElement('button');
    resetZoomButton.className = 'btn-reset';
    resetZoomButton.innerText = 'Reset Zoom';
    resetZoomButton.style.display = zoomRange ? 'block' : 'none';
    resetZoomButton.onclick = (e) => {
        e.stopPropagation();
        renderTimeline(events, dateString, null);
    };
    headerElement.appendChild(resetZoomButton);
    timelineWrapper.appendChild(headerElement);

    const timelineContainer = document.createElement('div');
    timelineContainer.className = 'timeline-container';
    // Ensure the container can receive pointer events
    timelineContainer.style.pointerEvents = 'auto';

    const rangeStartMinutes = zoomRange ? zoomRange.start : (6 * 60);
    const rangeEndMinutes = zoomRange ? zoomRange.end : (24 * 60);
    const totalRangeMinutes = rangeEndMinutes - rangeStartMinutes;

    // X-Axis
    const xAxisElement = document.createElement('div');
    xAxisElement.className = 'timeline-x-axis';
    const labelIntervalMinutes = totalRangeMinutes > 180 ? 60 : 15;

    for (let minutes = rangeStartMinutes; minutes < rangeEndMinutes; minutes += labelIntervalMinutes) {
        const labelElement = document.createElement('div');
        labelElement.className = 'time-label';
        const hours = Math.floor(minutes / 60);
        const mins = Math.floor(minutes % 60);
        labelElement.innerText = `${hours < 10 ? '0' : ''}${hours}:${mins < 10 ? '0' : ''}${mins}`;
        labelElement.style.flex = `0 0 ${(labelIntervalMinutes / totalRangeMinutes * 100)}%`;
        xAxisElement.appendChild(labelElement);
    }
    timelineContainer.appendChild(xAxisElement);

    // Grid Lines
    const gridElement = document.createElement('div');
    gridElement.className = 'timeline-grid';
    for (let minutes = rangeStartMinutes; minutes < rangeEndMinutes; minutes += labelIntervalMinutes) {
        const lineElement = document.createElement('div');
        lineElement.className = 'grid-line';
        lineElement.style.flex = `0 0 ${(labelIntervalMinutes / totalRangeMinutes * 100)}%`;
        gridElement.appendChild(lineElement);
    }
    timelineContainer.appendChild(gridElement);

    const contentLayer = document.createElement('div');
    contentLayer.className = 'timeline-content';
    // FIX: Set to none so the container behind it catches the drag
    contentLayer.style.pointerEvents = 'none';

    const occupiedSlots = [];
    events.forEach(event => {
        const eventStartMinutes = parseTime(event.time);
        if (eventStartMinutes === 9999) return;
        const eventDuration = 60;
        const eventEndMinutes = eventStartMinutes + eventDuration;

        if (eventEndMinutes <= rangeStartMinutes || eventStartMinutes >= rangeEndMinutes) return;

        let rowIndex = 0;
        while (true) {
            if (!occupiedSlots[rowIndex]) occupiedSlots[rowIndex] = [];
            const hasOverlap = occupiedSlots[rowIndex].some(occ => eventStartMinutes < occ.end && eventEndMinutes > occ.start);
            if (!hasOverlap) {
                occupiedSlots[rowIndex].push({ start: eventStartMinutes, end: eventEndMinutes });
                break;
            }
            rowIndex++;
        }

        const barElement = document.createElement('a');
        const isPriorityShow = PRIORITY_URLS.includes(event.link);
        const genreEmoji = getGenreEmoji(event.genre);

        barElement.className = 'show-bar' + (isPriorityShow ? ' priority' : '');
        barElement.href = event.link;
        barElement.target = '_blank';

        const leftPercent = ((eventStartMinutes - rangeStartMinutes) / totalRangeMinutes) * 100;
        const widthPercent = (eventDuration / totalRangeMinutes) * 100;

        barElement.style.left = `${Math.max(0, leftPercent)}%`;
        barElement.style.width = `${leftPercent < 0 ? widthPercent + leftPercent : Math.min(widthPercent, 100 - leftPercent)}%`;
        barElement.style.top = `${rowIndex * 35 + 10}px`;
        barElement.style.background = VENUE_COLORS[event.loc] || '';
        barElement.style.pointerEvents = 'auto'; // Re-enable for clicks
        barElement.innerText = genreEmoji + event.title;

        // ALLOW CLICKS, but let drags bubble up to container
        barElement.onclick = (e) => {
            if (didDrag) {
                e.preventDefault(); // Stop link from opening if we were zooming
            }
        };

        contentLayer.appendChild(barElement);
    });

    timelineContainer.style.height = `${Math.max(150, occupiedSlots.length * 35 + 60)}px`;
    timelineContainer.appendChild(contentLayer);

    // LIVE CURRENT TIME INDICATOR
    const now = new Date();
    const isToday = dateString === now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    if (isToday) {
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        if (nowMinutes >= rangeStartMinutes && nowMinutes <= rangeEndMinutes) {
            const nowLine = document.createElement('div');
            nowLine.className = 'now-indicator';
            const nowPos = ((nowMinutes - rangeStartMinutes) / totalRangeMinutes) * 100;
            nowLine.style.left = `${nowPos}%`;
            timelineContainer.appendChild(nowLine);
        }
    }

    // ==========================================================================
    // FIXED ZOOM LOGIC (from user)
    // ==========================================================================
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let selectionDiv = null;
    let activePointerId = null;

    timelineContainer.addEventListener('pointerdown', (e) => {
        // Only trigger on left-click (0)
        if (e.button !== 0) return;

        // Prevent browser from trying to drag the element itself (crucial for "Drag Anywhere")
        e.preventDefault();

        isDragging = true;
        didDrag = false;
        activePointerId = e.pointerId;

        const rect = timelineContainer.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;

        // Create the visual selection box
        selectionDiv = document.createElement('div');
        selectionDiv.className = 'zoom-selection';
        selectionDiv.style.left = startX + 'px';
        selectionDiv.style.top = startY + 'px';
        selectionDiv.style.width = '0px';
        selectionDiv.style.height = '0px';
        timelineContainer.appendChild(selectionDiv);

        // This ensures moving outside the box doesn't break the drag
        timelineContainer.setPointerCapture(e.pointerId);
    });

    timelineContainer.addEventListener('pointermove', (e) => {
        if (!isDragging || e.pointerId !== activePointerId) return;

        const rect = timelineContainer.getBoundingClientRect();
        const currentX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const currentY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);

        // MIN drag threshold (prevent accidental tiny zooms)
        if (!didDrag && (width > 5 || height > 5)) {
            didDrag = true;
        }

        const left = Math.min(startX, currentX);
        const top = Math.min(startY, currentY);

        if (selectionDiv) {
            selectionDiv.style.left = left + 'px';
            selectionDiv.style.width = width + 'px';
            selectionDiv.style.top = top + 'px';
            selectionDiv.style.height = height + 'px';
        }
    });

    const handleEnd = (e) => {
        if (!isDragging || e.pointerId !== activePointerId) return;

        isDragging = false;
        timelineContainer.releasePointerCapture(e.pointerId);

        const rect = timelineContainer.getBoundingClientRect();
        const finalLeft = selectionDiv ? parseFloat(selectionDiv.style.left) : 0;
        const finalWidth = selectionDiv ? parseFloat(selectionDiv.style.width) : 0;

        // Remove the visual box
        if (selectionDiv) {
            selectionDiv.remove();
            selectionDiv = null;
        }

        // Only zoom if the user dragged more than 20 pixels
        if (didDrag && finalWidth > 20) {
            const pct1 = finalLeft / rect.width;
            const pct2 = (finalLeft + finalWidth) / rect.width;

            const zoomStart = rangeStartMinutes + (pct1 * totalRangeMinutes);
            const zoomEnd = rangeStartMinutes + (pct2 * totalRangeMinutes);

            renderTimeline(events, dateString, { start: zoomStart, end: zoomEnd });
        }

        // Short timeout to prevent a regular "click" event from firing immediately after a drag
        setTimeout(() => {
            didDrag = false;
        }, 100);
    };

    timelineContainer.addEventListener('pointerup', handleEnd);
    timelineContainer.addEventListener('pointercancel', handleEnd);

    timelineWrapper.appendChild(timelineContainer);
}

// =============================================================================
// POPUP FUNCTIONS
// =============================================================================

function openPopup(title) {
    const event = ALL_EVENTS.find(e => e.title === title) ||
        ALL_EVENTS.find(e => e.title.replace(/'/g, "&apos;") === title);
    if (!event) return;

    document.getElementById('pop-title').innerText = event.title;
    document.getElementById('pop-time').innerText = event.time || 'Time TBD';
    document.getElementById('pop-venue').innerText = event.loc;
    document.getElementById('pop-genre').innerText = event.genre || 'Show';
    document.getElementById('pop-desc').innerText = event.desc;
    document.getElementById('pop-link').href = event.link;

    document.getElementById('popup-overlay').classList.remove('hidden');
}

function closePopup() {
    document.getElementById('popup-overlay').classList.add('hidden');
}
