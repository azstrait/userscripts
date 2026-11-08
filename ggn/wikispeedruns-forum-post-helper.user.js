// ==UserScript==
// @name         [GGn] WikiSpeedruns Forum Post Helper
// @namespace    https://greasyfork.org/en/users/1566044
// @version      2.2.2
// @description  Generate and copy a forum post when finishing a Wikipedia Speedrun.
// @author       azstrait
// @license      MIT
// @match        https://wikispeedruns.com/quick_run/finish*
// @icon         https://i.ibb.co/TBRyTXDF/wsr-logo.png
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-end
// @downloadURL  https://update.greasyfork.org/scripts/573099/%5BGGn%5D%20WikiSpeedruns%20Forum%20Post%20Helper.user.js
// @updateURL    https://update.greasyfork.org/scripts/573099/%5BGGn%5D%20WikiSpeedruns%20Forum%20Post%20Helper.meta.js
// ==/UserScript==

(function () {
    'use strict';

    // Debounce delay for suggestions, time between typing and suggestions appearing.
    // Increase for fewer API calls, decrease for faster suggestions.
    const DEBOUNCE_MS = 200;

    // Backlinks warning threshold (inclusive).
    // 0 backlinks always errors and blocks Copy!.
    const BACKLINKS_WARN_MAX = 5;

    // Enable or disable warning text when
    // the target resolves to a disambiguation page.
    const WARN_ON_DISAMBIGUATION = true;

    // Attribution footer appended to copied posts
    // (disabled by default, toggle in userscript menu).
    // const ATTRIBUTION_FOOTER_BBCODE =
    //     '[align=right]Answered with the [url=https://greasyfork.org/en/scripts/573099]WikiSpeedruns Helper[/url]![/align]';

    // ===================================================

    const AUTO_RUN_KEY = 'wikispeedruns_forum_helper_autorun';
    const AUTO_FILL_RANDOM_KEY = 'wikispeedruns_forum_helper_autofill_random';
    // Disabled at the request of site staff
    // const APPEND_ATTRIBUTION_KEY = 'wikispeedruns_forum_helper_append_attribution_footer';

    // ---- Clipboard helper ------------------------------------------------
    async function copyToClipboard(text, statusHandler) {
        // statusHandler is optional; when provided, use it for UI feedback instead of alert()
        const onStatus = typeof statusHandler === 'function' ? statusHandler : () => { };

        // Try GM_setClipboard if available
        if (typeof GM_setClipboard === 'function') {
            try {
                GM_setClipboard(text);
                onStatus({ ok: true });
                return;
            } catch (e) {
                console.error('GM_setClipboard error:', e);
                onStatus({ ok: false, error: e });
                return;
            }
        }

        // Fallback: navigator.clipboard
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                onStatus({ ok: true });
                return;
            } catch (e) {
                console.error('Clipboard error:', e);
                onStatus({ ok: false, error: e });
                return;
            }
        }

        console.warn('No clipboard API available.');
        onStatus({ ok: false, error: new Error('No clipboard API available') });
    }

    // function maybeAppendAttributionFooter(postText) {
    //     const enabled = GM_getValue(APPEND_ATTRIBUTION_KEY, false);
    //     if (!enabled) return postText;

    //     const footer = ATTRIBUTION_FOOTER_BBCODE.trim();
    //     if (!footer) return postText;

    //     // Avoid duplicates when copying multiple times from the same modal/session.
    //     if (postText.includes(footer)) return postText;

    //     // Exactly one newline between the last line and the footer.
    //     return postText.replace(/\s+$/, '') + '\n' + footer;
    // }

    // ---- Wait for the finish card to be rendered -------------------------
    function waitForCardBody(timeoutMs = 10000) {
        const start = Date.now();
        return new Promise((resolve, reject) => {
            const check = () => {
                const cardBody = document.querySelector('.card.md .card-body');
                if (cardBody) {
                    // Basic sanity check: it should contain the "Time:" and "The path you took:" text
                    const text = cardBody.textContent || '';
                    if (text.includes('Time:') && text.includes('The path you took:')) {
                        resolve(cardBody);
                        return;
                    }
                }
                if (Date.now() - start > timeoutMs) {
                    reject(new Error('Timed out waiting for finish card.'));
                    return;
                }
                setTimeout(check, 200);
            };
            check();
        });
    }

    // ---- Parse data from the DOM -----------------------------------------
    function parseRunData(cardBody) {
        // 1) Header h4: contains "start" to "end" with two <strong> elements
        const headerH4 = cardBody.querySelector('h4');
        let startTitle = '';
        let endTitle = '';
        if (headerH4) {
            const strongs = headerH4.querySelectorAll('strong');
            if (strongs[0]) startTitle = strongs[0].textContent.replace(/"/g, '').trim();
            if (strongs[1]) endTitle = strongs[1].textContent.replace(/"/g, '').trim();
        }

        // 2) Time <p>: 'Time: <strong>xx.xxx </strong>Seconds'
        const timeP = Array.from(cardBody.querySelectorAll('p')).find(p =>
            p.textContent.includes('Time:')
        );
        let timeSeconds = '';
        if (timeP) {
            const timeStrong = timeP.querySelector('strong');
            if (timeStrong) {
                timeSeconds = timeStrong.textContent.trim();
            } else {
                const m = timeP.textContent.match(/Time:\s*([\d.]+)/);
                if (m) timeSeconds = m[1];
            }
        }

        // 3) Number of links visited <p>
        const linksP = Array.from(cardBody.querySelectorAll('p')).find(p =>
            p.textContent.includes('Number of links visited:')
        );
        let numLinks = '';
        if (linksP) {
            const linksStrong = linksP.querySelector('strong');
            if (linksStrong) {
                numLinks = linksStrong.textContent.trim();
            } else {
                const m = linksP.textContent.match(/Number of links visited:\s*(\d+)/);
                if (m) numLinks = m[1];
            }
        }

        // 4) Path <p>: "The path you took: <br>[ ... ]" (spans multiple lines)
        const pathP = Array.from(cardBody.querySelectorAll('p')).find(p =>
            p.textContent.includes('The path you took:')
        );
        let pathLine = '';
        if (pathP) {
            // Example textContent:
            // The path you took:
            // [
            //   "Memphis Group",
            //   "Popular culture",
            //   ...
            // ]
            const full = pathP.textContent;
            const lines = full.split('\n').map(s => s.trim()).filter(Boolean);

            // First non-empty line is label, remaining lines are the array pieces
            const labelIndex = lines.findIndex(l => l.startsWith('The path you took'));
            const arrayLines = labelIndex >= 0 ? lines.slice(labelIndex + 1) : lines;

            // Join all array lines with spaces to get one line
            let joined = arrayLines.join(' ');

            // Ensure exactly one leading "[" and one trailing "]"
            // Strip all leading "[" and trailing "]", then add one of each
            joined = joined.replace(/^\[+/, '').replace(/\]+$/, '').trim();
            pathLine = joined.length > 0 ? `[ ${joined} ]` : '[]';
        }

        return { startTitle, endTitle, timeSeconds, numLinks, pathLine };
    }

    // ---- Build forum post ------------------------------------------------
    function buildForumPost(runData, nextEndTitle) {
        const { startTitle, endTitle, timeSeconds, numLinks, pathLine } = runData;
        const promptStart = encodeURIComponent(endTitle);
        const promptEnd = encodeURIComponent(nextEndTitle);
        const url = `https://wikispeedruns.com/play/quick_play?prompt_start=${promptStart}&prompt_end=${promptEnd}&lang=en`;
        const bbCodeLine = `[url=${url}]${endTitle} → ${nextEndTitle}[/url]`;

        return `"${startTitle}" to "${endTitle}"
Time: ${timeSeconds} Seconds

Number of links visited: ${numLinks}

The path you took:
${pathLine}

${bbCodeLine}`;
    }

    // ---- Get a random Wikipedia article title via API --------------------
    function getRandomWikipediaTitle() {
        return new Promise((resolve) => {
            const url = 'https://en.wikipedia.org/api/rest_v1/page/random/summary';

            const handleError = (err) => {
                console.error('Random article error:', err);
                resolve('');
            };

            // Prefer GM_xmlhttpRequest for cross-origin
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    onload: function (response) {
                        try {
                            if (response.status === 200) {
                                const data = JSON.parse(response.responseText);
                                const title = data && data.title ? data.title.trim() : '';
                                resolve(title);
                            } else {
                                console.warn('Random article API error:', response.status, response.responseText);
                                resolve('');
                            }
                        } catch (e) {
                            handleError(e);
                        }
                    },
                    onerror: handleError
                });
            } else {
                // Fallback to fetch if GM_xmlhttpRequest is not available
                fetch(url)
                    .then(r => (r.ok ? r.json() : null))
                    .then(data => {
                        const title = data && data.title ? data.title.trim() : '';
                        resolve(title);
                    })
                    .catch(handleError);
            }
        });
    }

    // ---- Wikipedia API helpers -------------------------------------------
    function wikiApiGetJson(url) {
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    onload: function (response) {
                        try {
                            if (response.status >= 200 && response.status < 300) {
                                resolve(JSON.parse(response.responseText));
                            } else {
                                reject(new Error(`HTTP ${response.status}`));
                            }
                        } catch (e) {
                            reject(e);
                        }
                    },
                    onerror: function (err) {
                        reject(err);
                    }
                });
                return;
            }

            fetch(url)
                .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
                .then(resolve)
                .catch(reject);
        });
    }

    // Resolve a title to a real page (following redirects). Returns:
    // - exists: boolean
    // - title: canonical title if exists
    // - fullurl: canonical URL if exists
    // - redirectFrom/redirectTo when redirect was followed
    async function resolveWikipediaTitle(title) {
        const url =
            'https://en.wikipedia.org/w/api.php' +
            '?action=query&format=json&origin=*' +
            '&redirects=1&prop=info&inprop=url' +
            '&titles=' + encodeURIComponent(title);

        const data = await wikiApiGetJson(url);

        const pagesObj = data && data.query && data.query.pages ? data.query.pages : null;
        if (!pagesObj) return { exists: false };

        // Usually there is exactly one page in the response.
        const pageKey = Object.keys(pagesObj)[0];
        const page = pagesObj[pageKey];

        if (!page) return { exists: false };

        // MediaWiki marks missing pages with pageid -1 and a "missing" property
        // (often an empty string), so checking truthiness is not enough.
        const isMissing =
            pageKey === '-1' ||
            page.pageid === -1 ||
            Object.prototype.hasOwnProperty.call(page, 'missing');

        if (isMissing) return { exists: false };

        let redirectFrom = null;
        let redirectTo = null;
        if (data.query && Array.isArray(data.query.redirects) && data.query.redirects.length > 0) {
            redirectFrom = data.query.redirects[0].from || null;
            redirectTo = data.query.redirects[0].to || null;
        }

        return {
            exists: true,
            title: page.title || '',
            fullurl: page.fullurl || '',
            redirectFrom,
            redirectTo
        };
    }

    // Single best match using MediaWiki search.
    async function searchClosestWikipediaTitle(query) {
        const url =
            'https://en.wikipedia.org/w/api.php' +
            '?action=query&format=json&origin=*' +
            '&list=search&srnamespace=0&srlimit=1' +
            '&srsearch=' + encodeURIComponent(query);

        const data = await wikiApiGetJson(url);
        const results = data && data.query && Array.isArray(data.query.search) ? data.query.search : [];
        if (!results.length || !results[0] || !results[0].title) return { found: false };
        return { found: true, title: results[0].title };
    }

    // Backlinks sample (namespace 0). bllimit=50 gives "50+" behavior.
    async function fetchBacklinksSampleCount(title) {
        const url =
            'https://en.wikipedia.org/w/api.php' +
            '?action=query&format=json&origin=*' +
            '&list=backlinks&blnamespace=0&bllimit=50' +
            '&bltitle=' + encodeURIComponent(title);

        const data = await wikiApiGetJson(url);
        const backlinks = data && data.query && Array.isArray(data.query.backlinks) ? data.query.backlinks : [];
        return backlinks.length;
    }

    // Detect disambiguation pages using pageprops.disambiguation.
    // Value is usually "" (empty string), so property existence must be checked.
    async function isDisambiguationPage(title) {
        const url =
            'https://en.wikipedia.org/w/api.php' +
            '?action=query&format=json&origin=*' +
            '&redirects=1&prop=pageprops&ppprop=disambiguation' +
            '&titles=' + encodeURIComponent(title);

        const data = await wikiApiGetJson(url);
        const pagesObj = data && data.query && data.query.pages ? data.query.pages : null;
        if (!pagesObj) return false;

        const pageKey = Object.keys(pagesObj)[0];
        const page = pagesObj[pageKey];
        if (!page) return false;

        if (!page.pageprops) return false;
        return Object.prototype.hasOwnProperty.call(page.pageprops, 'disambiguation');
    }

    // ---- Opensearch suggestions (live dropdown) --------------------------
    function fetchOpensearchSuggestions(query) {
        return new Promise((resolve) => {
            const trimmed = query.trim();
            if (!trimmed) {
                resolve([]);
                return;
            }

            const url =
                'https://en.wikipedia.org/w/api.php' +
                '?action=opensearch&limit=3&namespace=0&format=json&origin=*' +
                '&search=' + encodeURIComponent(trimmed);

            const handleData = (data) => {
                try {
                    if (!Array.isArray(data) || data.length < 2) {
                        resolve([]);
                        return;
                    }
                    const titles = Array.isArray(data[1]) ? data[1] : [];
                    resolve(titles.map(t => String(t).trim()).filter(Boolean));
                } catch (e) {
                    console.error('Opensearch parse error:', e);
                    resolve([]);
                }
            };

            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    onload: function (response) {
                        if (response.status === 200) {
                            let data = null;
                            try {
                                data = JSON.parse(response.responseText);
                            } catch (e) {
                                console.error('Opensearch parse error:', e);
                            }
                            handleData(data);
                        } else {
                            console.warn('Opensearch API error:', response.status, response.responseText);
                            resolve([]);
                        }
                    },
                    onerror: function (err) {
                        console.error('Opensearch request failed:', err);
                        resolve([]);
                    }
                });
            } else {
                fetch(url)
                    .then(r => (r.ok ? r.json() : null))
                    .then(data => handleData(data))
                    .catch(err => {
                        console.error('Opensearch fetch failed:', err);
                        resolve([]);
                    });
            }
        });
    }

    function isDarkThemeActive() {
        return (document.documentElement.getAttribute('data-bs-theme') || '').toLowerCase() === 'dark';
    }

    // ---- Custom modal with shuffle + check + opensearch suggestions ------
    function showDestinationModal(endTitle, buildPostForTitle) {
        return new Promise(async (resolve) => {
            const darkMode = isDarkThemeActive();

            // Bootstrap-ish theme tokens (fallbacks are chosen to be readable).
            const theme = {
                modalBg: darkMode ? '#212529' : '#ffffff',
                modalText: darkMode ? '#f8f9fa' : '#212529',
                mutedText: darkMode ? '#adb5bd' : '#666',
                border: darkMode ? '#495057' : '#ccc',
                suggestionsBg: darkMode ? '#212529' : '#ffffff',
                suggestionHover: darkMode ? '#343a40' : '#e9ecef',
            };

            // Create overlay
            const overlay = document.createElement('div');
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
            overlay.style.zIndex = '9999';
            overlay.style.display = 'flex';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';

            // Create modal box
            const modal = document.createElement('div');
            modal.style.backgroundColor = theme.modalBg;
            modal.style.color = theme.modalText;
            modal.style.padding = '20px';
            modal.style.borderRadius = '8px';
            modal.style.maxWidth = '520px';
            modal.style.width = '100%';
            modal.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
            modal.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

            modal.innerHTML = `
                <h5 style="margin-top:0; margin-bottom:10px;">Choose next Wikipedia article</h5>
                <p style="margin:0 0 8px 0; font-size:14px;">
                    You just finished at: <strong>${endTitle}</strong>
                </p>
                <p style="margin:0 0 8px 0; font-size:13px;">
                    Start typing a Wikipedia article title, or click <strong>Shuffle</strong> for a random article.<br>
                    Suggestions come from Wikipedia search; <strong>Check</strong> will fuzzy-match & normalize the title.
                </p>

                <div style="display:flex; align-items:flex-start; margin-bottom:4px;">
                    <!-- Wrapper around ONLY the textbox + status + suggestions -->
                    <div style="position:relative; flex:1;">
                        <input type="text" id="ws-next-article-input"
                            style="width:100%; padding:6px 8px; box-sizing:border-box; font-size:14px;" />

                        <!-- Suggestions pinned to bottom edge of textbox, matching textbox width -->
                        <ul id="ws-suggestions"
                            style="list-style:none; margin:0; padding:0; max-height:150px; overflow-y:auto;
                                border:1px solid ${theme.border}; border-radius:4px; display:none; background:${theme.suggestionsBg};
                                font-size:14px; width:100%; box-sizing:border-box; z-index:1;">
                        </ul>
                    </div>

                    <button id="ws-shuffle-btn" class="btn btn-outline-secondary" type="button"
                        title="Random article"
                        style="margin-left:6px; display:flex; align-items:center; justify-content:center;">
                        <i class="bi bi-shuffle"></i>
                    </button>
                    <button id="ws-check-btn" class="btn btn-outline-secondary" type="button"
                        title="Check article"
                        style="margin-left:4px; display:flex; align-items:center; justify-content:center;">
                        <i class="bi bi-check2-square"></i>
                    </button>
                </div>

                <p id="ws-status" style="margin:0 0 4px 0; font-size:11px; color:${theme.mutedText}; min-height:1em;"></p>

                <div style="display:flex; justify-content:flex-end; align-items:center; margin-top:4px;">
                    <button id="ws-cancel-btn" class="btn btn-secondary" type="button"
                        style="margin-right:6px;">Close</button>
                    <button id="ws-ok-btn" class="btn btn-primary" type="button">Copy!</button>
                </div>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            const inputEl = modal.querySelector('#ws-next-article-input');
            const shuffleBtn = modal.querySelector('#ws-shuffle-btn');
            const checkBtn = modal.querySelector('#ws-check-btn');
            const okBtn = modal.querySelector('#ws-ok-btn');
            const cancelBtn = modal.querySelector('#ws-cancel-btn');
            const statusEl = modal.querySelector('#ws-status');
            const suggestionsEl = modal.querySelector('#ws-suggestions');

            // Tracks whether the last validation attempt had an API failure.
            // On Copy!, a confirm dialog is shown in that state.
            let lastValidationHadApiError = false;

            // Helper to style Copy! button feedback
            function setCopyButtonState(state) {
                // state: 'idle' | 'success' | 'error' | 'disabled_error'
                if (state === 'success') {
                    okBtn.textContent = 'Copied!';
                    okBtn.style.backgroundColor = '#28a745'; // Bootstrap-ish success green
                    okBtn.style.borderColor = '#28a745';
                    okBtn.disabled = true;
                } else if (state === 'error') {
                    okBtn.textContent = 'Failed!';
                    okBtn.style.backgroundColor = '#dc3545'; // Bootstrap-ish danger red
                    okBtn.style.borderColor = '#dc3545';
                    okBtn.disabled = false;
                } else if (state === 'disabled_error') {
                    okBtn.textContent = 'Copy!';
                    okBtn.style.backgroundColor = '#dc3545';
                    okBtn.style.borderColor = '#dc3545';
                    okBtn.disabled = true;
                } else {
                    okBtn.textContent = 'Copy!';
                    okBtn.style.backgroundColor = '';
                    okBtn.style.borderColor = '';
                    okBtn.disabled = false;
                }
            }

            // Status line renderer:
            // - articleText: a fragment containing the "Valid/Redirect/Closest match" part, including links
            // - backlinksText: optional fragment (colored pale green)
            // - mode: 'normal' | 'warn' | 'error'
            function setStatusLine({ mode = 'normal', articleFrag = null, tailText = '', backlinksText = '' }) {
                statusEl.replaceChildren();

                if (mode === 'error') statusEl.style.color = '#dc3545';
                else if (mode === 'warn') statusEl.style.color = '#b58100'; // amber-ish
                else statusEl.style.color = theme.mutedText;

                if (articleFrag) statusEl.appendChild(articleFrag);

                if (tailText) {
                    statusEl.appendChild(document.createTextNode(tailText));
                }

                if (backlinksText) {
                    const bl = document.createElement('span');
                    bl.textContent = backlinksText;
                    bl.style.color = '#2f7d32'; // pale green
                    statusEl.appendChild(bl);
                }
            }

            function makeWikiLink(title, fullurl) {
                const a = document.createElement('a');
                a.href = fullurl || ('https://en.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_')));
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.textContent = title;
                // links should stand out on dark backgrounds.
                a.style.color = darkMode ? '#8ab4f8' : '';
                return a;
            }

            function makeArticleFragment(kind, { title, fullurl, redirectFrom = '', redirectTo = '' }) {
                const frag = document.createDocumentFragment();

                if (kind === 'redirect') {
                    frag.appendChild(document.createTextNode('Redirect: '));
                    frag.appendChild(document.createTextNode(redirectFrom));
                    frag.appendChild(document.createTextNode(' → '));
                    frag.appendChild(makeWikiLink(redirectTo || title, fullurl));
                    return frag;
                }

                if (kind === 'closest') {
                    frag.appendChild(document.createTextNode('Closest match: '));
                    frag.appendChild(makeWikiLink(title, fullurl));
                    return frag;
                }

                // kind === 'valid'
                frag.appendChild(document.createTextNode('Valid article: '));
                frag.appendChild(makeWikiLink(title, fullurl));
                return frag;
            }

            // Normalizes title + checks backlinks + (optional) disambiguation.
            // Only runs on:
            // - suggestion click
            // - shuffle click
            // - check click
            async function validateAndRender(inputTitle) {
                // source: 'suggestion' | 'check' | 'shuffle'
                lastValidationHadApiError = false;

                // Reset status and Copy state during validation
                setStatusLine({ mode: 'normal', articleFrag: null, tailText: 'Checking article...' });
                setCopyButtonState('idle');

                const raw = (inputTitle || '').trim();
                if (!raw) {
                    setStatusLine({ mode: 'normal', articleFrag: null, tailText: 'Please enter a Wikipedia article title to check.' });
                    return { ok: false };
                }

                shuffleBtn.disabled = true;
                checkBtn.disabled = true;

                try {
                    // Step 1: resolve exact title (redirects included)
                    let resolved = await resolveWikipediaTitle(raw);

                    let articleKind = 'valid';
                    let canonicalTitle = '';
                    let canonicalUrl = '';
                    let redirectFrom = '';
                    let redirectTo = '';

                    if (resolved.exists) {
                        canonicalTitle = resolved.title;
                        canonicalUrl = resolved.fullurl;
                        if (resolved.redirectFrom && resolved.redirectTo) {
                            articleKind = 'redirect';
                            redirectFrom = resolved.redirectFrom;
                            redirectTo = resolved.redirectTo;
                        } else {
                            articleKind = 'valid';
                        }
                    } else {
                        // Step 2: closest match via search
                        const closest = await searchClosestWikipediaTitle(raw);
                        if (!closest.found) {
                            setStatusLine({
                                mode: 'error',
                                articleFrag: null,
                                tailText: `No results found for "${raw}". Please choose a different article.`
                            });
                            setCopyButtonState('disabled_error');
                            return { ok: false };
                        }

                        const resolvedClosest = await resolveWikipediaTitle(closest.title);
                        if (!resolvedClosest.exists) {
                            setStatusLine({
                                mode: 'error',
                                articleFrag: null,
                                tailText: `No usable result for "${raw}". Please choose a different article.`
                            });
                            setCopyButtonState('disabled_error');
                            return { ok: false };
                        }

                        articleKind = 'closest';
                        canonicalTitle = resolvedClosest.title;
                        canonicalUrl = resolvedClosest.fullurl;
                    }

                    // Update textbox to the canonical title when it changes.
                    if (canonicalTitle && inputEl.value.trim() !== canonicalTitle) {
                        inputEl.value = canonicalTitle;
                    }

                    // Step 3: backlinks (namespace 0), sample size up to 50
                    const blCount = await fetchBacklinksSampleCount(canonicalTitle);
                    const blDisplay = (blCount >= 50) ? '50+' : String(blCount);

                    // Optional: disambiguation check on the canonical title
                    let disambig = false;
                    if (WARN_ON_DISAMBIGUATION) {
                        disambig = await isDisambiguationPage(canonicalTitle);
                    }

                    // Build article prefix fragment
                    const articleFrag = makeArticleFragment(articleKind, {
                        title: canonicalTitle,
                        fullurl: canonicalUrl,
                        redirectFrom,
                        redirectTo
                    });

                    // Hard error: no backlinks => block Copy!
                    if (blCount === 0) {
                        setStatusLine({
                            mode: 'error',
                            articleFrag,
                            tailText: ', but no backlinks were found. Please choose a different article.'
                        });
                        setCopyButtonState('disabled_error');
                        return { ok: false, canonicalTitle };
                    }

                    // Combined warning: low backlinks + disambiguation
                    if (disambig && blCount >= 1 && blCount <= BACKLINKS_WARN_MAX) {
                        setStatusLine({
                            mode: 'warn',
                            articleFrag,
                            tailText: `, only ${blDisplay} backlinks were found, and this is a Disambiguation page. This page may make for a challenging speedrun.`
                        });
                        setCopyButtonState('idle');
                        return { ok: true, canonicalTitle, backlinks: blCount, disambig: true };
                    }

                    // Low backlinks warning (non-disambiguation)
                    if (!disambig && blCount >= 1 && blCount <= BACKLINKS_WARN_MAX) {
                        setStatusLine({
                            mode: 'warn',
                            articleFrag,
                            tailText: `, but only ${blDisplay} backlinks were found. This article may make for a challenging speedrun.`
                        });
                        setCopyButtonState('idle');
                        return { ok: true, canonicalTitle, backlinks: blCount };
                    }

                    // Disambiguation warning (not low backlinks)
                    if (disambig) {
                        setStatusLine({
                            mode: 'warn',
                            articleFrag,
                            tailText: `, ${blDisplay} backlinks were found, but this is a Disambiguation page. This page may make for a challenging speedrun.`
                        });
                        setCopyButtonState('idle');
                        return { ok: true, canonicalTitle, backlinks: blCount, disambig: true };
                    }

                    // Normal success: show backlinks part in pale green only.
                    setStatusLine({
                        mode: 'normal',
                        articleFrag,
                        tailText: ' (',
                        backlinksText: `${blDisplay} backlinks found.`,
                    });
                    statusEl.appendChild(document.createTextNode(')'));
                    setCopyButtonState('idle');
                    return { ok: true, canonicalTitle, backlinks: blCount };

                } catch (e) {
                    console.error('Validation error:', e);

                    lastValidationHadApiError = true;

                    // API failures show a warning line. Copy behavior:
                    // - suggestion click: allow copying without confirm
                    // - shuffle/check: require confirm on Copy!
                    setStatusLine({
                        mode: 'warn',
                        articleFrag: null,
                        tailText: 'Could not fully validate this article right now (Wikipedia API error). Please verify the link works before posting.'
                    });

                    setCopyButtonState('idle');
                    return { ok: true, apiError: true };
                } finally {
                    shuffleBtn.disabled = false;
                    checkBtn.disabled = false;
                }
            }

            async function setRandomTitleAndValidate() {
                setStatusLine({ mode: 'normal', articleFrag: null, tailText: 'Fetching random article...' });
                shuffleBtn.disabled = true;
                checkBtn.disabled = true;
                try {
                    const title = await getRandomWikipediaTitle();
                    inputEl.value = title || '';
                    hideSuggestions();
                } finally {
                    shuffleBtn.disabled = false;
                    checkBtn.disabled = false;
                }
                await validateAndRender(inputEl.value);
            }

            // Suggestions handling
            function clearSuggestions() {
                while (suggestionsEl.firstChild) suggestionsEl.removeChild(suggestionsEl.firstChild);
            }

            function hideSuggestions() {
                clearSuggestions();
                suggestionsEl.style.display = 'none';
            }

            function showSuggestionsList(titles) {
                clearSuggestions();
                if (!titles || titles.length === 0) {
                    suggestionsEl.style.display = 'none';
                    return;
                }
                titles.forEach(title => {
                    const li = document.createElement('li');
                    li.textContent = title;
                    li.style.padding = '4px 8px';
                    li.style.cursor = 'pointer';
                    li.addEventListener('mouseenter', () => {
                        li.style.backgroundColor = theme.suggestionHover;
                    });
                    li.addEventListener('mouseleave', () => {
                        li.style.backgroundColor = '';
                    });
                    li.addEventListener('click', async () => {
                        inputEl.value = title;
                        hideSuggestions();
                        // Auto-check when a suggestion is chosen
                        await validateAndRender(title);
                    });
                    suggestionsEl.appendChild(li);
                });
                suggestionsEl.style.display = 'block';
            }

            let opensearchTimer = null;
            let lastOpensearchQuery = '';

            inputEl.addEventListener('input', () => {
                const value = inputEl.value;
                statusEl.textContent = '';
                setCopyButtonState('idle');
                lastValidationHadApiError = false;

                if (opensearchTimer) {
                    clearTimeout(opensearchTimer);
                }

                if (!value.trim()) {
                    hideSuggestions();
                    return;
                }

                opensearchTimer = setTimeout(async () => {
                    const q = inputEl.value;
                    if (!q.trim()) {
                        hideSuggestions();
                        return;
                    }
                    lastOpensearchQuery = q;
                    const titles = await fetchOpensearchSuggestions(q);
                    // Only update if input hasn't changed during the request
                    if (inputEl.value === lastOpensearchQuery) {
                        showSuggestionsList(titles);
                    }
                }, DEBOUNCE_MS);
            });

            inputEl.addEventListener('focus', () => {
                // If there are suggestions, show them again on focus
                if (suggestionsEl.children.length > 0) {
                    suggestionsEl.style.display = 'block';
                }
            });

            inputEl.addEventListener('blur', () => {
                // Hide suggestions shortly after blur to allow click selection
                setTimeout(() => {
                    suggestionsEl.style.display = 'none';
                }, 150);
            });

            // Optional initial random fill (with full validation)
            const autoFillRandom = GM_getValue(AUTO_FILL_RANDOM_KEY, false);
            if (autoFillRandom) {
                await setRandomTitleAndValidate();
            }

            // Button handlers
            shuffleBtn.addEventListener('click', () => {
                setRandomTitleAndValidate();
            });

            checkBtn.addEventListener('click', () => {
                validateAndRender(inputEl.value);
            });

            okBtn.addEventListener('click', async () => {
                const val = inputEl.value.trim();
                if (!val) {
                    // Nothing to copy
                    setStatusLine({ mode: 'error', articleFrag: null, tailText: 'Please enter a Wikipedia article title before copying.' });
                    setCopyButtonState('error');
                    setTimeout(() => setCopyButtonState('idle'), 1500);
                    return;
                }

                // If validation failed earlier due to API error (and it was not from suggestion click),
                // prompt for confirmation before posting a potentially broken link.
                if (lastValidationHadApiError) {
                    const proceed = window.confirm(
                        'Could not fully validate this article due to a Wikipedia API error.\n\n' +
                        'Verify the article link works before posting.\n\n' +
                        'Copy anyway?'
                    );
                    if (!proceed) return;
                }

                let finalText = buildPostForTitle(val);
                // finalText = maybeAppendAttributionFooter(finalText);

                okBtn.disabled = true;

                await copyToClipboard(finalText, (res) => {
                    if (res.ok) {
                        setCopyButtonState('success');
                    } else {
                        setCopyButtonState('error');
                    }
                    setTimeout(() => {
                        setCopyButtonState('idle');
                        okBtn.disabled = false;
                    }, 1500);
                });

                // Clipboard acknowledgement (blocking) per preference when validation had API failure.
                if (lastValidationHadApiError) {
                    alert('Forum post copied to clipboard. Double-check the Wikipedia link before posting.');
                }
            });

            cancelBtn.addEventListener('click', () => {
                document.body.removeChild(overlay);
                resolve(null);
            });

            // Advanced overlay click handling:
            // Only close when click starts AND ends on the overlay (no dragging out of modal)
            let mouseDownOnOverlay = false;

            overlay.addEventListener('mousedown', (e) => {
                // Only count if the press starts on the overlay itself, not the modal
                if (e.target === overlay) {
                    mouseDownOnOverlay = true;
                } else {
                    mouseDownOnOverlay = false;
                }
            });

            overlay.addEventListener('mouseup', (e) => {
                // Close only if:
                //   - mousedown started on overlay
                //   - mouseup also happens on overlay
                //   - target is overlay (not the modal box)
                if (mouseDownOnOverlay && e.target === overlay) {
                    document.body.removeChild(overlay);
                    resolve(null);
                }
                mouseDownOnOverlay = false;
            });

            // Enter/Esc shortcuts
            inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    okBtn.click();
                } else if (e.key === 'Escape') {
                    cancelBtn.click();
                }
            });

            inputEl.focus();
        });
    }

    // ---- Prompt wrapper using the modal ----------------------------------
    async function promptForNextDestination(runData) {
        const builder = (nextEndTitle) => buildForumPost(runData, nextEndTitle);
        return showDestinationModal(runData.endTitle, builder);
    }

    // ---- Core generation routine -----------------------------------------
    async function generatePost(cardBody) {
        const runData = parseRunData(cardBody);
        if (!runData.startTitle || !runData.endTitle || !runData.timeSeconds || !runData.numLinks || !runData.pathLine) {
            console.warn('Parsed run data seems incomplete:', runData);
            alert('Could not parse run data correctly. The page structure may have changed.');
            return;
        }
        await promptForNextDestination(runData);
    }

    // ---- Inject "Generate forum post" button ------------------------------
    function injectButton(cardBody) {
        // Find the "Return to home page" div
        const homeDiv = Array.from(cardBody.querySelectorAll('div')).find(d =>
            d.textContent.includes('Return to home page')
        );
        const playAgainDiv = Array.from(cardBody.querySelectorAll('div')).find(d =>
            d.textContent.includes('Play again')
        );
        if (!homeDiv) return;

        // Create container and button
        const wrapper = document.createElement('div');
        wrapper.className = 'py-2';

        const button = document.createElement('button');
        button.className = 'btn btn-outline-secondary';
        button.textContent = 'Generate forum post';

        wrapper.appendChild(button);

        // Insert between "Return to home page" and "Play again" if possible,
        // else just after "Return to home page".
        if (homeDiv.parentNode) {
            if (playAgainDiv && playAgainDiv.parentNode === homeDiv.parentNode) {
                homeDiv.parentNode.insertBefore(wrapper, playAgainDiv);
            } else {
                homeDiv.parentNode.insertBefore(wrapper, homeDiv.nextSibling);
            }
        }

        button.addEventListener('click', () => {
            generatePost(cardBody);
        });
    }

    // ---- Menu toggles for auto-run ---------------------------------------
    function setupMenu() {
        const autoRun = GM_getValue(AUTO_RUN_KEY, true);
        const autoFillRandom = GM_getValue(AUTO_FILL_RANDOM_KEY, false);
        // const appendAttribution = GM_getValue(APPEND_ATTRIBUTION_KEY, false);

        if (typeof GM_registerMenuCommand === 'function') {
            GM_registerMenuCommand(
                autoRun ? '☑ Run automatically on finish page' : '☐ Run automatically on finish page',
                () => {
                    GM_setValue(AUTO_RUN_KEY, !autoRun);
                    // Auto-reload to apply immediately
                    window.location.reload();
                }
            );

            GM_registerMenuCommand(
                autoFillRandom ? '☑ Automatically fill random article' : '☐ Automatically fill random article',
                () => {
                    GM_setValue(AUTO_FILL_RANDOM_KEY, !autoFillRandom);
                    window.location.reload();
                }
            );

            // GM_registerMenuCommand(
            //     appendAttribution ? '☑ Append attribution footer' : '☐ Append attribution footer',
            //     () => {
            //         GM_setValue(APPEND_ATTRIBUTION_KEY, !appendAttribution);
            //         window.location.reload();
            //     }
            // );

            GM_registerMenuCommand('Open forum post modal', async () => {
                const cardBody = document.querySelector('.card.md .card-body');
                if (!cardBody) {
                    alert('Could not find run summary on this page.');
                    return;
                }
                await generatePost(cardBody);
            });
        }
    }

    // ---- Main entry ------------------------------------------------------
    async function main() {
        setupMenu();

        try {
            const cardBody = await waitForCardBody().catch(err => {
                console.error(err);
                alert('Could not detect run data on the finish page. The script may need updating.');
            });
            if (!cardBody) return;

            // Always inject the UI button
            injectButton(cardBody);

            // Conditionally auto-run based on setting
            const autoRun = GM_getValue(AUTO_RUN_KEY, true);
            if (autoRun) {
                await generatePost(cardBody);
            }
        } catch (e) {
            console.error('WikiSpeedruns Forum Post Helper error:', e);
            alert('An error occurred in the userscript. See console for details.');
        }
    }

    // Auto-run on page load
    main();
})();
