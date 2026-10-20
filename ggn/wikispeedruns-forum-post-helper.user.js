// ==UserScript==
// @name         [GGn] WikiSpeedruns Forum Post Helper
// @namespace    https://greasyfork.org/en/users/1566044
// @version      1.2.2
// @description  Generate and copy a forum post when finishing a Wikipedia Speedrun.
// @author       azstrait
// @license      MIT
// @match        https://wikispeedruns.com/quick_run/finish*
// @icon         https://ptpimg.me/u890ms.png
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-end
// ==/UserScript==
 
(function () {
    'use strict';
 
    const AUTO_RUN_KEY = 'wikispeedruns_forum_helper_autorun';
 
    // ---- Clipboard helper ------------------------------------------------
    async function copyToClipboard(text) {
        if (typeof GM_setClipboard === 'function') {
            GM_setClipboard(text);
            alert('Forum post copied to clipboard!');
            return;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                alert('Forum post copied to clipboard!');
                return;
            } catch (e) {
                console.error('Clipboard error:', e);
            }
        }
        alert('Could not copy to clipboard; no clipboard API available.');
    }
 
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
        const bbCodeLine = `[url=${url}]${endTitle} -> ${nextEndTitle}[/url]`;
 
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
                            console.error('Random article parse error:', e);
                            resolve('');
                        }
                    },
                    onerror: function (err) {
                        console.error('Random article request failed:', err);
                        resolve('');
                    }
                });
            } else {
                // Fallback to fetch if GM_xmlhttpRequest is not available
                fetch(url)
                    .then(r => (r.ok ? r.json() : null))
                    .then(data => {
                    const title = data && data.title ? data.title.trim() : '';
                    resolve(title);
                })
                    .catch(err => {
                    console.error('Random article fetch failed:', err);
                    resolve('');
                });
            }
        });
    }
 
    // ---- Custom modal with shuffle button --------------------------------
    function showDestinationModal(endTitle) {
        return new Promise(async (resolve) => {
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
            modal.style.backgroundColor = 'white';
            modal.style.color = 'black';
            modal.style.padding = '20px';
            modal.style.borderRadius = '8px';
            modal.style.maxWidth = '480px';
            modal.style.width = '100%';
            modal.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
            modal.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
 
            modal.innerHTML = `
                <h5 style="margin-top:0; margin-bottom:10px;">Choose next Wikipedia article</h5>
                <p style="margin:0 0 8px 0; font-size:14px;">
                    You just finished at: <strong>${endTitle}</strong>
                </p>
                <p style="margin:0 0 10px 0; font-size:13px;">
                    The field below is pre-filled with a random valid article from Wikipedia.<br>
                    You can edit it or click <strong>Shuffle</strong> to get another random article.
                </p>
                <input type="text" id="ws-next-article-input"
                    style="width:100%; padding:6px 8px; margin-bottom:10px; box-sizing:border-box; font-size:14px;" />
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
                    <button id="ws-shuffle-btn" class="btn btn-outline-secondary" type="button">
                       ⟳ Shuffle
                    </button>
                    <div style="margin-left:auto;">
                        <button id="ws-cancel-btn" class="btn btn-secondary" type="button"
                            style="margin-right:6px;">Cancel</button>
                        <button id="ws-ok-btn" class="btn btn-primary" type="button">Copy!</button>
                    </div>
                </div>
                <p id="ws-status" style="margin-top:6px; font-size:11px; color:#666;"></p>
            `;
 
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
 
            const inputEl = modal.querySelector('#ws-next-article-input');
            const shuffleBtn = modal.querySelector('#ws-shuffle-btn');
            const okBtn = modal.querySelector('#ws-ok-btn');
            const cancelBtn = modal.querySelector('#ws-cancel-btn');
            const statusEl = modal.querySelector('#ws-status');
 
            let currentTitle = '';
 
            async function setRandomTitle(showStatus = true) {
                statusEl.textContent = 'Fetching random article...';
                shuffleBtn.disabled = true;
                try {
                    const title = await getRandomWikipediaTitle();
                    currentTitle = title || '';
                    inputEl.value = currentTitle;
                    if (showStatus) {
                        statusEl.textContent = title
                            ? `Random article: ${title}`
                            : 'Could not fetch a random article. You can type any title manually.';
                    } else {
                        statusEl.textContent = '';
                    }
                } finally {
                    shuffleBtn.disabled = false;
                }
            }
 
            // Initial random
            setRandomTitle(false);
 
            // Button handlers
            shuffleBtn.addEventListener('click', () => {
                setRandomTitle(true);
            });
 
            okBtn.addEventListener('click', () => {
                const val = inputEl.value.trim();
                document.body.removeChild(overlay);
                if (!val) {
                    resolve(null);
                } else {
                    resolve(val);
                }
            });
 
            cancelBtn.addEventListener('click', () => {
                document.body.removeChild(overlay);
                resolve(null);
            });
 
            // Close on overlay click (optional)
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    document.body.removeChild(overlay);
                    resolve(null);
                }
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
    async function promptForNextDestination(endTitle) {
        return showDestinationModal(endTitle);
    }
 
    // ---- Core generation routine -----------------------------------------
    async function generatePost(cardBody, cachedRunData) {
        const runData = cachedRunData || parseRunData(cardBody);
        if (!runData.startTitle || !runData.endTitle || !runData.timeSeconds || !runData.numLinks || !runData.pathLine) {
            console.warn('Parsed run data seems incomplete:', runData);
            alert('Could not parse run data correctly. The page structure may have changed.');
            return;
        }
        const nextEndTitle = await promptForNextDestination(runData.endTitle);
        if (!nextEndTitle) return; // user cancelled
 
        const finalText = buildForumPost(runData, nextEndTitle);
        await copyToClipboard(finalText);
    }
 
    // ---- Inject "Generate forum post" button ------------------------------
    function injectButton(cardBody, runData) {
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
            generatePost(cardBody, runData);
        });
    }
 
    // ---- Menu toggles for auto-run ---------------------------------------
    function setupMenu() {
        const autoRun = GM_getValue(AUTO_RUN_KEY, true);
 
        if (typeof GM_registerMenuCommand === 'function') {
            GM_registerMenuCommand(
                autoRun ? '☑ Run automatically on finish page' : '☐ Run automatically on finish page',
                () => {
                    GM_setValue(AUTO_RUN_KEY, !autoRun);
                    // Auto-reload to apply immediately
                    window.location.reload();
                }
            );
 
            // Still keep a manual "Generate" command
            GM_registerMenuCommand('Generate Speedrun Forum Post (manual)', async () => {
                const cardBody = document.querySelector('.card.md .card-body');
                if (!cardBody) {
                    alert('Could not find run summary on this page.');
                    return;
                }
                const runData = parseRunData(cardBody);
                await generatePost(cardBody, runData);
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
 
            const runData = parseRunData(cardBody);
 
            // Always inject the UI button
            injectButton(cardBody, runData);
 
            // Conditionally auto-run based on setting
            const autoRun = GM_getValue(AUTO_RUN_KEY, true);
            if (autoRun) {
                await generatePost(cardBody, runData);
            }
        } catch (e) {
            console.error('WikiSpeedruns Forum Post Helper error:', e);
            alert('An error occurred in the userscript. See console for details.');
        }
    }
 
    // Auto-run on page load
    main();
})();
