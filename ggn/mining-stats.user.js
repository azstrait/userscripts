// ==UserScript==
// @name         [GGn] Mining Stats (azstrait fork)
// @description  Adds a button to the userlog page to calculate personal mining drops statistics.
// @license      MIT
// @author       azstrait | fork of uwuMocha
// @namespace    https://gazellegames.net/
// @version      1.1.1
// @match        https://gazellegames.net/user.php?action=userlog*
// @grant        GM_setValue
// @grant        GM_getValue
// @icon         https://gazellegames.net/favicon.ico
// ==/UserScript==
(function() {
    'use strict';
    // Live configuration (persisted)
    // These all affect COPY output.
    // Blast Mode affects both COPY + MODAL text (modal always shows all sections though).
    // Configuration: Show ores with 0 quantity in IRC copy (false = hide, true = show)
    let SHOW_ZERO_QUANTITY_ORES_IRC = GM_getValue('mining_stats_show_zero_quantity_ores_irc', false);
    // Configuration: Use abbreviated ore names (false = full names, true = abbreviated)
    let USE_ABBREVIATED_ORE_NAMES = GM_getValue('mining_stats_use_abbreviated_ore_names', false);
    // Configuration: Show sand & clay (false = hide, true = show)
    let INCLUDE_FILLER_DROPS = GM_getValue('mining_stats_include_filler_drops', true);
    // Configuration: Show ore breakdown (false = hide all ores, true = show all ores)
    let INCLUDE_ORE_DROPS = GM_getValue('mining_stats_include_ore_drops', true);
    // Renames clay, sand, and ores (applies to modal + both copy outputs)
    let USE_BLAST_MODE = GM_getValue('mining_stats_use_blast_mode', false);
 
    const userLink = document.querySelector('h2 a.username');
    if (!userLink) return;
 
    const href = userLink.getAttribute('href');
    const userId = new URL(href, window.location.href).searchParams.get('id');
    if (!userId) return;
 
    const header = document.querySelector('h2');
    if (!header) return;
 
    const btn = document.createElement('input');
    btn.type = 'button';
    btn.value = 'Mining Stats';
    btn.name = 'btnMiningStats';
    btn.style.marginLeft = '8px';
    btn.style.display = 'inline-block';
 
    btn.addEventListener('click', async () => {
        let apiKey = GM_getValue('mining_stats_api_key');
        let needsRetry = false;
 
        do {
            try {
                if (!apiKey) {
                    apiKey = prompt('Enter your API key (requires "User" permissions):');
                    if (!apiKey) return;
                    GM_setValue('mining_stats_api_key', apiKey);
                }
 
                console.log('[Mining Stats] Fetching data...');
                const [logData, userData] = await Promise.all([
                    fetchData(`https://gazellegames.net/api.php?request=userlog&limit=-1&search=as an irc reward.`, apiKey),
                    fetchData(`https://gazellegames.net/api.php?request=user&id=${userId}`, apiKey)
                ]);
 
                const drops = logData?.response || [];
 
                const flameEntries = drops.filter(e => e.message.toLowerCase().includes('flame'));
                const flameCounts = flameEntries.reduce((acc, entry) => {
                    const msg = entry.message.toLowerCase();
                    ['nayru', 'din', 'farore'].forEach(flame => {
                        if (msg.includes(`${flame}'s flame`)) acc[flame]++;
                    });
                    return acc;
                }, { nayru: 0, din: 0, farore: 0 });
 
                // Calculate Ore and Staff Cards
                const oreEntries = drops.filter(e => {
                    const msg = e.message.toLowerCase();
                    return msg.includes('ore') || msg.includes('bronze alloy mix');
                });
 
                const staffCardEntries = drops.filter(e => e.message.toLowerCase().includes('staff card'));
                const clayEntries = drops.filter(e => e.message.toLowerCase().includes('lump of clay'));
                const sandEntries = drops.filter(e => e.message.toLowerCase().includes('pile of sand'));
 
                // Calculate ore counts by type
                const oreCounts = oreEntries.reduce((acc, entry) => {
                    const msg = entry.message;
 
                    // Bronze Alloy Mix is always singular: "a Bronze Alloy Mix"
                    const bronzeAlloyMatch = msg.match(/a Bronze Alloy Mix/i);
 
                    // Other ores can be plural: "a Iron ore" or "2 Iron ores"
                    const ironMatch = msg.match(/(\d+)\s+Iron ores?|a Iron ore|Iron Ore/i);
                    const goldMatch = msg.match(/(\d+)\s+Gold ores?|a Gold ore|Gold Ore/i);
                    const mithrilMatch = msg.match(/(\d+)\s+Mithril ores?|a Mithril ore|Mithril Ore/i);
                    const adamantiumMatch = msg.match(/(\d+)\s+Adamantium ores?|a Adamantium ore|Adamantium Ore/i);
 
                    if (bronzeAlloyMatch) acc.bronze += 1;
                    if (ironMatch) acc.iron += ironMatch[1] ? parseInt(ironMatch[1]) : 1;
                    if (goldMatch) acc.gold += goldMatch[1] ? parseInt(goldMatch[1]) : 1;
                    if (mithrilMatch) acc.mithril += mithrilMatch[1] ? parseInt(mithrilMatch[1]) : 1;
                    if (adamantiumMatch) acc.adamantium += adamantiumMatch[1] ? parseInt(adamantiumMatch[1]) : 1;
 
                    return acc;
                }, { bronze: 0, iron: 0, gold: 0, mithril: 0, adamantium: 0 });
 
                // Calculate clay counts: "Lump of Clay" or "2 Lump of Clays"
                const clayCount = clayEntries.reduce((acc, entry) => {
                    const msg = entry.message;
                    const match = msg.match(/(\d+)\s+Lump of Clays?|a Lump of Clay/i);
                    if (match) acc += match[1] ? parseInt(match[1]) : 1;
                    return acc;
                }, 0);
 
                // Calculate sand counts: "Pile of Sand" or "2 Pile of Sands"
                const sandCount = sandEntries.reduce((acc, entry) => {
                    const msg = entry.message;
                    const match = msg.match(/(\d+)\s+Pile of Sands?|a Pile of Sand/i);
                    if (match) acc += match[1] ? parseInt(match[1]) : 1;
                    return acc;
                }, 0);
 
                // Calculate staff card counts: "2 Random Staff Cards", "a Random Staff Card", or "Three Random Staff Cards"
                const staffCardCount = staffCardEntries.reduce((acc, entry) => {
                    const msg = entry.message;
                    const match = msg.match(/(Three|\d+)\s+Random Staff Cards?|a Random Staff Card/i);
                    if (match) {
                        if (match[1] && match[1].toLowerCase() === 'three') acc += 3;
                        else acc += match[1] ? parseInt(match[1]) : 1;
                    }
                    return acc;
                }, 0);
 
                const actualLines = userData?.response?.community?.ircActualLines ?? 0;
                const totalMines = drops.length;
                const totalFlames = flameEntries.length;
                const totalOre = oreCounts.bronze + oreCounts.iron + oreCounts.gold + oreCounts.mithril + oreCounts.adamantium;
                const totalStaffCards = staffCardCount;
                const linesPerMine = (actualLines / (totalMines || 1)).toFixed(2);
                const linesPerFlame = (actualLines / (totalFlames || 1)).toFixed(2);
 
                // ---- utilities for coloring/regex ----
                const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const wrapColor = (text, color) => `<span style="color: ${color};">${text}</span>`;
 
                const applyColorRules = (html, rules) => {
                    // Replace longer strings first (e.g., "Me Gold" before "Gold")
                    const sorted = [...rules].sort((a, b) => b.term.length - a.term.length);
                    for (const { term, color } of sorted) {
                        const re = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'g');
                        html = html.replace(re, wrapColor(term, color));
                    }
                    return html;
                };
 
                // ---- Name helpers ----
                const getClayName = () => USE_BLAST_MODE ? 'Play-Doh' : 'Clay';
                const getSandName = () => USE_BLAST_MODE ? 'Pocket Sand' : 'Sand';
 
                // Helper function to get ore name (abbreviated or full)
                const getOreName = (oreName) => {
                    // Apply Blast Mode first, then abbreviation
                    if (USE_BLAST_MODE) {
                        if (oreName === 'Bronze') return 'Bonerz';
                        if (oreName === 'Iron') return 'Irony';
                        if (oreName === 'Gold') return 'Me Gold';
                        if (oreName === 'Mithril') return 'Meth';
                        // Adamantium unchanged
                    }
                    if (!USE_ABBREVIATED_ORE_NAMES) return oreName;
                    if (oreName === 'Adamantium') return 'Ada';
                    if (oreName === 'Mithril') return 'Mith';
                    return oreName;
                };
 
                // ---- Breakdown builders (functions so checkbox toggles live-update) ----
                const buildOreBreakdownPartsIRC = () => {
                    const parts = [];
                    // Escape sequences:
                    // \x0307 Bronze, \x0314 Iron, \x0308 Gold, \x0311 Mithril, \x0305 Adamantium
                    if (oreCounts.bronze > 0 || SHOW_ZERO_QUANTITY_ORES_IRC) parts.push(`\x0307${getOreName('Bronze')}\x03 [ ${oreCounts.bronze} ]`);
                    if (oreCounts.iron > 0 || SHOW_ZERO_QUANTITY_ORES_IRC) parts.push(`\x0314${getOreName('Iron')}\x03 [ ${oreCounts.iron} ]`);
                    if (oreCounts.gold > 0 || SHOW_ZERO_QUANTITY_ORES_IRC) parts.push(`\x0308${getOreName('Gold')}\x03 [ ${oreCounts.gold} ]`);
                    if (oreCounts.mithril > 0 || SHOW_ZERO_QUANTITY_ORES_IRC) parts.push(`\x0311${getOreName('Mithril')}\x03 [ ${oreCounts.mithril} ]`);
                    if (oreCounts.adamantium > 0 || SHOW_ZERO_QUANTITY_ORES_IRC) parts.push(`\x0305${getOreName('Adamantium')}\x03 [ ${oreCounts.adamantium} ]`);
                    return parts;
                };
 
                const buildOreBreakdownPartsPlain = () => ([
                    `${getOreName('Bronze')}: ${oreCounts.bronze}`,
                    `${getOreName('Iron')}: ${oreCounts.iron}`,
                    `${getOreName('Gold')}: ${oreCounts.gold}`,
                    `${getOreName('Mithril')}: ${oreCounts.mithril}`,
                    `${getOreName('Adamantium')}: ${oreCounts.adamantium}`
                ]);
 
                // ---- Builders ----
                // MODAL: always show everything (ignores INCLUDE_*), but DOES use Blast Mode / abbreviations.
                const buildStatsTextModalFull = () => {
                    const oreBreakdownPlainParts = buildOreBreakdownPartsPlain();
                    return (
                        `Mines: ${totalMines}` +
                        ` | Flames: ${totalFlames}` +
                        ` | Din: ${flameCounts.din}, Farore: ${flameCounts.farore}, Nayru: ${flameCounts.nayru}` +
                        ` | ${getClayName()}: ${clayCount}` +
                        ` | ${getSandName()}: ${sandCount}` +
                        ` | ${oreBreakdownPlainParts.join(', ')}` +
                        ` | Total Ore: ${totalOre}` +
                        ` | Staff Cards: ${totalStaffCards}` +
                        ` | Lines/Mine: ${linesPerMine}` +
                        ` | Lines/Flame: ${linesPerFlame}`
                    );
                };
 
                // COPIED PLAINTEXT: obey INCLUDE_* toggles, and uses Blast Mode / abbreviations.
                const buildStatsTextPlainCopied = () => {
                    const oreBreakdownPlainParts = buildOreBreakdownPartsPlain();
 
                    let fillerPlain = '';
                    if (INCLUDE_FILLER_DROPS) {
                        fillerPlain += ` | ${getClayName()}: ${clayCount}`;
                        fillerPlain += ` | ${getSandName()}: ${sandCount}`;
                    }
 
                    const oresPlain = INCLUDE_ORE_DROPS
                        ? ` | ${oreBreakdownPlainParts.join(', ')}`
                        : '';
 
                    return (
                        `Mines: ${totalMines}` +
                        ` | Flames: ${totalFlames}` +
                        ` | Din: ${flameCounts.din}, Farore: ${flameCounts.farore}, Nayru: ${flameCounts.nayru}` +
                        fillerPlain +
                        oresPlain +
                        ` | Total Ore: ${totalOre}` +
                        ` | Staff Cards: ${totalStaffCards}` +
                        ` | Lines/Mine: ${linesPerMine}` +
                        ` | Lines/Flame: ${linesPerFlame}`
                    );
                };
 
                // COPIED IRC: obey INCLUDE_* toggles, uses Blast Mode / abbreviations.
                const buildStatsTextIRCCopied = () => {
                    const oreBreakdownParts = buildOreBreakdownPartsIRC();
 
                    let fillerIRC = '';
                    if (INCLUDE_FILLER_DROPS) {
                        fillerIRC += ` • ${getClayName()} [ ${clayCount} ]`;
                        fillerIRC += ` • ${getSandName()} [ ${sandCount} ]`;
                    }
 
                    const oresIRC = INCLUDE_ORE_DROPS
                        ? ` • ${oreBreakdownParts.join(' • ')}`
                        : '';
 
                    return (
                        `Total Mines [ ${totalMines} ]` +
                        ` • \x0304Din\x03 [ ${flameCounts.din} ]` +
                        ` • \x0303Farore\x03 [ ${flameCounts.farore} ]` +
                        ` • \x0310Nayru\x03 [ ${flameCounts.nayru} ]` +
                        fillerIRC +
                        oresIRC +
                        ` • Total Ore [ ${totalOre} ]` +
                        ` • Staff Cards [ ${totalStaffCards} ]` +
                        ` • Lines/Mine [ ${linesPerMine} ]` +
                        ` • Lines/Flame [ ${linesPerFlame} ]`
                    );
                };
 
                // --- Colorize the modal display, including Blast Mode ---
                const buildStatsDisplayHTML = (plainText) => {
                    let html = plainText.replace(/\s*\|\s*/g, '<br>');
 
                    const CLAY_COLOR = '#a8a8a8';
                    const SAND_COLOR = '#e6d8a8';
 
                    const rules = [
                        { term: 'Nayru', color: '#5599ff' },
                        { term: 'Din', color: '#ff4444' },
                        { term: 'Farore', color: '#44ff44' },
 
                        { term: 'Clay', color: CLAY_COLOR },
                        { term: 'Sand', color: SAND_COLOR },
 
                        { term: 'Bronze', color: '#cd7f32' },
                        { term: 'Iron', color: '#c0c0c0' },
                        { term: 'Gold', color: '#ffd700' },
                        { term: 'Mithril', color: '#00ffff' },
                        { term: 'Adamantium', color: '#cc5500' },
 
                        // Abbreviations (if used)
                        { term: 'Mith', color: '#00ffff' },
                        { term: 'Ada', color: '#cc5500' }
                    ];
 
                    if (USE_BLAST_MODE) {
                        rules.push(
                            { term: 'Play-Doh', color: CLAY_COLOR },
                            { term: 'Pocket Sand', color: SAND_COLOR },
                            { term: 'Bonerz', color: '#cd7f32' },
                            { term: 'Irony', color: '#c0c0c0' },
                            { term: 'Me Gold', color: '#ffd700' },
                            { term: 'Meth', color: '#00ffff' }
                        );
                    }
 
                    return applyColorRules(html, rules);
                };
 
                // Live state used by copy buttons / modal
                let statsTextModal = buildStatsTextModalFull();
                let statsDisplayHTML = buildStatsDisplayHTML(statsTextModal);
 
                let statsTextIRCCopy = buildStatsTextIRCCopied();
                let statsTextPlainCopy = buildStatsTextPlainCopied();
 
                const copyBtnIRC = document.createElement('input');
                copyBtnIRC.type = 'submit';
                copyBtnIRC.value = 'Copy for IRC';
                copyBtnIRC.style.marginTop = '10px';
                copyBtnIRC.onclick = async (e) => {
                    e.preventDefault();
                    try {
                        await navigator.clipboard.writeText(statsTextIRCCopy);
                        const originalText = copyBtnIRC.value;
                        copyBtnIRC.value = 'Copied!';
                        setTimeout(() => {
                            copyBtnIRC.value = originalText;
                            modal.remove();
                        }, 1000);
                    } catch (err) {
                        alert('Failed to copy to clipboard');
                    }
                };
 
                const copyBtnPlain = document.createElement('input');
                copyBtnPlain.type = 'submit';
                copyBtnPlain.value = 'Copy Plain Text';
                copyBtnPlain.style.marginTop = '10px';
                copyBtnPlain.style.marginLeft = '8px';
                copyBtnPlain.onclick = async (e) => {
                    e.preventDefault();
                    try {
                        await navigator.clipboard.writeText(statsTextPlainCopy);
                        const originalText = copyBtnPlain.value;
                        copyBtnPlain.value = 'Copied!';
                        setTimeout(() => {
                            copyBtnPlain.value = originalText;
                            modal.remove();
                        }, 1000);
                    } catch (err) {
                        alert('Failed to copy to clipboard');
                    }
                };
 
                const modal = document.createElement('div');
                Object.assign(modal.style, {
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    background: '#1a1a1a',
                    border: '2px solid white',
                    padding: '20px',
                    zIndex: '10000',
                    color: 'white',
                    maxWidth: '500px'
                });
 
                const container = document.createElement('div');
 
                // Separate node for live-updating the stats text in the modal
                const statsDiv = document.createElement('div');
                statsDiv.style.whiteSpace = 'pre-wrap';
 
                const titleHtml =
                    `<div style="text-align:center; margin-bottom:10px;">` +
                        `<div style="font-weight:700; font-size:1.25em;">Mining Stats</div>` +
                        `<div style="font-style:italic; font-weight:400; font-size:0.85em; margin-top:2px;">` +
                        `<a href="https://greasyfork.org/en/scripts/564508" target="_blank" rel="noopener noreferrer" ` +
                            `style="color:#bbb; text-decoration:underline;">azstrait fork</a>` +
                        `</div>` +
                    `</div>`;
                statsDiv.innerHTML = `${titleHtml}${statsDisplayHTML}`;
 
                container.appendChild(statsDiv);
                container.appendChild(copyBtnIRC);
                container.appendChild(copyBtnPlain);
 
                const closeBtn = document.createElement('input');
                closeBtn.type = 'submit';
                closeBtn.value = 'Close';
                closeBtn.style.marginLeft = '10px';
                closeBtn.onclick = (e) => {
                    e.preventDefault();
                    modal.remove();
                };
                container.appendChild(closeBtn);
 
                // --- Options UI (under the buttons) ---
                const optsWrap = document.createElement('div');
                optsWrap.style.marginTop = '12px';
                optsWrap.style.borderTop = '1px solid #444';
                optsWrap.style.paddingTop = '10px';
 
                const makeCheckbox = (labelText, checked, onChange) => {
                    const label = document.createElement('label');
                    label.style.display = 'block';
                    label.style.marginTop = '6px';
                    label.style.cursor = 'pointer';
 
                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.checked = checked;
                    cb.style.marginRight = '8px';
                    cb.addEventListener('change', () => onChange(cb.checked));
 
                    label.appendChild(cb);
                    label.appendChild(document.createTextNode(labelText));
                    return { label, cb };
                };
 
                const render = () => {
                    // Modal always full; affected by Blast Mode + abbreviations (not include toggles)
                    statsTextModal = buildStatsTextModalFull();
                    statsDisplayHTML = buildStatsDisplayHTML(statsTextModal);
                    statsDiv.innerHTML = `${titleHtml}${statsDisplayHTML}`;
 
                    // Copies affected by everything
                    statsTextIRCCopy = buildStatsTextIRCCopied();
                    statsTextPlainCopy = buildStatsTextPlainCopied();
                };
 
                const cbZero = makeCheckbox(
                    'Include zero-quantity ores in IRC copy',
                    SHOW_ZERO_QUANTITY_ORES_IRC,
                    (val) => {
                        SHOW_ZERO_QUANTITY_ORES_IRC = val;
                        GM_setValue('mining_stats_show_zero_quantity_ores_irc', val);
                        render();
                    }
                );
 
                const cbAbbrev = makeCheckbox(
                    'Use abbreviated ore names',
                    USE_ABBREVIATED_ORE_NAMES,
                    (val) => {
                        USE_ABBREVIATED_ORE_NAMES = val;
                        GM_setValue('mining_stats_use_abbreviated_ore_names', val);
                        render();
                    }
                );
 
                const cbFiller = makeCheckbox(
                    'Include filler in copied text',
                    INCLUDE_FILLER_DROPS,
                    (val) => {
                        INCLUDE_FILLER_DROPS = val;
                        GM_setValue('mining_stats_include_filler_drops', val);
                        render();
                    }
                );
 
                const cbOres = makeCheckbox(
                    'Include ore breakdown in copied text',
                    INCLUDE_ORE_DROPS,
                    (val) => {
                        INCLUDE_ORE_DROPS = val;
                        GM_setValue('mining_stats_include_ore_drops', val);
                        render();
                    }
                );
 
                const cbBlast = makeCheckbox(
                    'Blast Mode',
                    USE_BLAST_MODE,
                    (val) => {
                        USE_BLAST_MODE = val;
                        GM_setValue('mining_stats_use_blast_mode', val);
                        render();
                    }
                );
 
                // Requested order
                optsWrap.appendChild(cbZero.label);
                optsWrap.appendChild(cbAbbrev.label);
                optsWrap.appendChild(cbFiller.label);
                optsWrap.appendChild(cbOres.label);
                optsWrap.appendChild(cbBlast.label);
 
                container.appendChild(optsWrap);
 
                modal.appendChild(container);
                document.body.appendChild(modal);
 
                needsRetry = false;
            } catch (error) {
                console.error('[Mining Stats] Error:', error);
                if ([401, 403].includes(error.status)) {
                    GM_setValue('mining_stats_api_key', '');
                    apiKey = null;
                    needsRetry = confirm(`API Error: ${error.status === 401 ? 'Invalid key' : 'No permissions'}. Retry?`);
                } else {
                    alert(`Error: ${error.message}`);
                    needsRetry = false;
                }
            }
        } while (needsRetry);
    });
 
    async function fetchData(url, apiKey) {
        const response = await fetch(url, { headers: { 'X-API-Key': apiKey } });
        if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
        const data = await response.json();
        if (data?.status !== 'success') throw new Error(data?.error || 'API request failed');
        return data;
    }
 
    const searchBox = document.querySelectorAll('#user .thin .center form table td input[type="text"]')[0];
    const searchBtn = document.querySelector('input[type="submit"][value="Search log"]');
 
    if (searchBox && searchBtn) {
        btn.type = 'button';
        btn.style.marginLeft = '8px';
        btn.style.display = 'inline-block';
 
        searchBtn.insertAdjacentElement('afterend', btn);
 
        requestAnimationFrame(() => {
            const btnWidth = btn.offsetWidth + 12;
            const currentWidth = searchBox.offsetWidth;
            searchBox.style.width = (currentWidth - btnWidth) + 'px';
        });
    }
})();
