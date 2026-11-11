// ==UserScript==
// @name         [GGn] Mining Stats (azstrait fork)
// @description  Adds a button to the userlog page to calculate personal mining drops statistics.
// @license      MIT
// @author       azstrait | fork of uwuMocha | credit to eaglebuns
// @namespace    https://gazellegames.net/
// @version      1.2.6
// @match        https://gazellegames.net/user.php?action=userlog*
// @grant        GM.getValue
// @grant        GM.setValue
// @icon         https://gazellegames.net/favicon.ico
// @downloadURL  https://update.greasyfork.org/scripts/564508/%5BGGn%5D%20Mining%20Stats%20%28azstrait%20fork%29.user.js
// @updateURL    https://update.greasyfork.org/scripts/564508/%5BGGn%5D%20Mining%20Stats%20%28azstrait%20fork%29.meta.js
// ==/UserScript==
(async function() {
    'use strict';

    // Live configuration (persisted). Greasemonkey 4+ storage calls return Promises.
    // These settings affect the modal and copied output.
    // Existing filler/ore inclusion settings continue to affect copied output only.
    // Configuration: Show ores with 0 quantity in IRC copy (false = hide, true = show)
    let [
        SHOW_ZERO_QUANTITY_ORES_IRC,
        USE_ABBREVIATED_ORE_NAMES,
        INCLUDE_FILLER_DROPS,
        INCLUDE_ORE_DROPS,
        INCLUDE_GOLD_STATS,
        INCLUDE_EXTENDED_STATS,
        USE_BLAST_MODE
    ] = await Promise.all([
        GM.getValue('mining_stats_show_zero_quantity_ores_irc', false),
    // Configuration: Use abbreviated ore names (false = full names, true = abbreviated)
        GM.getValue('mining_stats_use_abbreviated_ore_names', false),
    // Configuration: Show sand & clay (false = hide, true = show)
        GM.getValue('mining_stats_include_filler_drops', true),
    // Configuration: Show ore breakdown (false = hide, true = show all ores)
        GM.getValue('mining_stats_include_ore_drops', true),
    // Shows total and average gold income stats (false = hide, true = show)
        GM.getValue('mining_stats_show_gold_stats', false),
    // Shows max mines/day and days since stats (false = hide, true = show)
        GM.getValue('mining_stats_show_extended_stats', false),
    // Renames clay, sand, and ores (applies to modal + both copy outputs)
        GM.getValue('mining_stats_use_blast_mode', false)
    ]);

    // Persist checkbox settings without leaving rejected storage Promises unhandled.
    const saveSetting = async (key, value) => {
        try {
            await GM.setValue(key, value);
        } catch (error) {
            console.error(`[Mining Stats] Could not save setting "${key}":`, error);
        }
    };

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
        let apiKey;

        try {
            apiKey = await GM.getValue('mining_stats_api_key');
        } catch (error) {
            console.error('[Mining Stats] Could not read the saved API key:', error);
            alert('Unable to read saved Mining Stats settings. Check the Greasemonkey extension and try again.');
            return;
        }

        let needsRetry = false;

        do {
            try {
                if (!apiKey) {
                    apiKey = prompt('Enter your API key (requires "User" permissions):');
                    if (!apiKey) return;

                    await GM.setValue('mining_stats_api_key', apiKey);
                }

                console.log('[Mining Stats] Fetching data...');

                const [logData, userData] = await Promise.all([
                    fetchData(
                        'https://gazellegames.net/api.php?request=userlog&limit=-1&search=as an irc reward.',
                        apiKey
                    ),
                    fetchData(
                        `https://gazellegames.net/api.php?request=user&id=${userId}`,
                        apiKey
                    )
                ]);

                const drops = logData?.response || [];

                const flameEntries = drops.filter(e =>
                    e.message.toLowerCase().includes('flame')
                );

                const flameCounts = flameEntries.reduce((acc, entry) => {
                    const msg = entry.message.toLowerCase();

                    ['nayru', 'din', 'farore'].forEach(flame => {
                        if (msg.includes(`${flame}'s flame`)) {
                            acc[flame]++;
                        }
                    });

                    return acc;
                }, { nayru: 0, din: 0, farore: 0 });

                // Calculate Ore and Staff Cards.
                const oreEntries = drops.filter(e => {
                    const msg = e.message.toLowerCase();
                    return msg.includes('ore') ||
                        msg.includes('bronze alloy mix');
                });

                const staffCardEntries = drops.filter(e =>
                    e.message.toLowerCase().includes('staff card')
                );

                const clayEntries = drops.filter(e =>
                    e.message.toLowerCase().includes('lump of clay')
                );

                const sandEntries = drops.filter(e =>
                    e.message.toLowerCase().includes('pile of sand')
                );

                // Calculate ore counts by type.
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
                    const match = entry.message.match(/(\d+)\s+Lump of Clays?|a Lump of Clay/i);

                    if (match) {
                        acc += match[1] ? parseInt(match[1]) : 1;
                    }

                    return acc;
                }, 0);

                // Calculate sand counts: "Pile of Sand" or "2 Pile of Sands"
                const sandCount = sandEntries.reduce((acc, entry) => {
                    const match = entry.message.match(/(\d+)\s+Pile of Sands?|a Pile of Sand/i);

                    if (match) {
                        acc += match[1] ? parseInt(match[1]) : 1;
                    }

                    return acc;
                }, 0);

                // Calculate staff card counts:
                // "2 Random Staff Cards", "a Random Staff Card", or "Three Random Staff Cards"
                const staffCardCount = staffCardEntries.reduce((acc, entry) => {
                    const match = entry.message.match(/(Three|\d+)\s+Random Staff Cards?|a Random Staff Card/i);

                    if (match) {
                        if (match[1] && match[1].toLowerCase() === 'three') {
                            acc += 3;
                        } else {
                            acc += match[1] ? parseInt(match[1]) : 1;
                        }
                    }

                    return acc;
                }, 0);

                const actualLines = userData?.response?.community?.ircActualLines ?? 0;
                const totalMines = drops.length;
                const totalFlames = flameEntries.length;

                // Gold currency awarded for each mine.
                const totalGold = drops.reduce((acc, entry) => {
                    const match = entry.message.match(/and\s+([\d,]+)\s+gold\s+as an irc reward\.\s*$/i);
                    return acc + (match ? parseInt(match[1].replace(/,/g, ''), 10) : 0);
                }, 0);

                const averageGoldPerMine = (totalGold / (totalMines || 1)).toFixed(2);

                // Count mines per calendar day using the API's YYYY-MM-DD timestamp prefix.
                const minesPerDay = {};
                drops.forEach(entry => {
                    const date = entry.time?.slice(0, 10);
                    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
                        minesPerDay[date] = (minesPerDay[date] || 0) + 1;
                    }
                });

                // On ties, prefer the most recent date.
                const maxMinesPerDay = Object.entries(minesPerDay)
                    .sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0] || null;

                const getLatestDate = (entries) => entries.reduce((latest, entry) => {
                    const date = entry.time?.slice(0, 10);
                    return date && (!latest || date > latest) ? date : latest;
                }, null);

                const daysSinceDate = (dateString) => {
                    if (!dateString) return null;

                    const [year, month, day] = dateString.split('-').map(Number);
                    const lastDate = Date.UTC(year, month - 1, day);
                    const now = new Date();
                    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

                    return Math.max(0, Math.floor((today - lastDate) / 86400000));
                };

                const formatDate = (dateString) => {
                    if (!dateString) return 'N/A';

                    const [year, month, day] = dateString.split('-').map(Number);
                    return `${month}/${day}/${String(year).slice(-2)}`;
                };

                const formatDaysAgo = (dateString) => {
                    const days = daysSinceDate(dateString);

                    if (days === null) return 'N/A';
                    if (days === 0) return 'Today';

                    return `${days} ${days === 1 ? 'day' : 'days'} ago`;
                };

                const lastMineDate = getLatestDate(drops);
                const lastFlameDate = getLatestDate(flameEntries);

                const totalOre =
                    oreCounts.bronze +
                    oreCounts.iron +
                    oreCounts.gold +
                    oreCounts.mithril +
                    oreCounts.adamantium;

                const totalStaffCards = staffCardCount;
                const linesPerMine = (actualLines / (totalMines || 1)).toFixed(2);
                const linesPerFlame = (actualLines / (totalFlames || 1)).toFixed(2);
                const minesPerFlame = (totalMines / (totalFlames || 1)).toFixed(2);

                // ---- Utilities for coloring/regex ----
                const escapeRegExp = (s) =>
                    s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                const wrapColor = (text, color) =>
                    `<span style="color: ${color};">${text}</span>`;

                const applyColorRules = (html, rules) => {
                    // Replace longer strings first (e.g., "Me Gold" before "Gold").
                    const sorted = [...rules].sort(
                        (a, b) => b.term.length - a.term.length
                    );

                    for (const { term, color } of sorted) {
                        const re = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'g');
                        html = html.replace(re, wrapColor(term, color));
                    }

                    return html;
                };

                // ---- Name helpers ----
                const getClayName = () =>
                    USE_BLAST_MODE ? 'Play-Doh' : 'Clay';

                const getSandName = () =>
                    USE_BLAST_MODE ? 'Pocket Sand' : 'Sand';

                const getGoldCurrencyName = () =>
                    USE_BLAST_MODE ? 'BON' : 'Gold';

                // Helper function to get ore name (abbreviated or full).
                const getOreName = (oreName) => {
                    // Apply Blast Mode first, then abbreviation.
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
                    // \x0307 Bronze, \x0314 Iron, \x0308 Gold,
                    // \x0311 Mithril, \x0305 Adamantium

                    if (oreCounts.bronze > 0 || SHOW_ZERO_QUANTITY_ORES_IRC) {
                        parts.push(`\x0307${getOreName('Bronze')}\x03 [ ${oreCounts.bronze} ]`);
                    }

                    if (oreCounts.iron > 0 || SHOW_ZERO_QUANTITY_ORES_IRC) {
                        parts.push(`\x0314${getOreName('Iron')}\x03 [ ${oreCounts.iron} ]`);
                    }

                    if (oreCounts.gold > 0 || SHOW_ZERO_QUANTITY_ORES_IRC) {
                        parts.push(`\x0308${getOreName('Gold')}\x03 [ ${oreCounts.gold} ]`);
                    }

                    if (oreCounts.mithril > 0 || SHOW_ZERO_QUANTITY_ORES_IRC) {
                        parts.push(`\x0311${getOreName('Mithril')}\x03 [ ${oreCounts.mithril} ]`);
                    }

                    if (oreCounts.adamantium > 0 || SHOW_ZERO_QUANTITY_ORES_IRC) {
                        parts.push(`\x0305${getOreName('Adamantium')}\x03 [ ${oreCounts.adamantium} ]`);
                    }

                    return parts;
                };

                const buildOreBreakdownPartsPlain = () => ([
                    `${getOreName('Bronze')}: ${oreCounts.bronze}`,
                    `${getOreName('Iron')}: ${oreCounts.iron}`,
                    `${getOreName('Gold')}: ${oreCounts.gold}`,
                    `${getOreName('Mithril')}: ${oreCounts.mithril}`,
                    `${getOreName('Adamantium')}: ${oreCounts.adamantium}`
                ]);

                // ---- Gold and Extended Stats ----
                // These builders always return the stats.
                // Inclusion settings are applied only by the copied-output builders.
                const buildGoldStatsPlain = () =>
                    `Total ${getGoldCurrencyName()}: ${totalGold}, Avg. ${getGoldCurrencyName()}/Mine: ${averageGoldPerMine}`;

                const buildExtendedStatsPlain = () => [
                    `Max Mines/Day: ${maxMinesPerDay ? `${maxMinesPerDay[1]} on ${formatDate(maxMinesPerDay[0])}` : 'N/A'}`,
                    `Last Mine: ${formatDaysAgo(lastMineDate)}`,
                    `Last Flame: ${formatDaysAgo(lastFlameDate)}`
                ];

                // ---- Modal stats ----
                // Always shows filler, ores, Gold Stats, and Extended Stats.
                // The Include checkboxes affect copied output only.
                const buildStatsTextModalFull = () => {
                    const normalStats =
                        `Mines: ${totalMines}` +
                        ` | Flames: ${totalFlames}` +
                        ` | Din: ${flameCounts.din}, Farore: ${flameCounts.farore}, Nayru: ${flameCounts.nayru}` +
                        ` | ${getClayName()}: ${clayCount}` +
                        ` | ${getSandName()}: ${sandCount}` +
                        ` | ${buildOreBreakdownPartsPlain().join(', ')}` +
                        ` | Total Ore: ${totalOre}` +
                        ` | Staff Cards: ${totalStaffCards}` +
                        ` | Lines/Mine: ${linesPerMine}` +
                        ` | Lines/Flame: ${linesPerFlame}` +
                        ` | Mines/Flame: ${minesPerFlame}`;

                    const goldStats = buildGoldStatsPlain();

                    const extendedStats = [
                        `Max Mines/Day: ${maxMinesPerDay ? `${maxMinesPerDay[1]} on ${formatDate(maxMinesPerDay[0])}` : 'N/A'}`,
                        `Last Mine: ${formatDate(lastMineDate)} (${formatDaysAgo(lastMineDate)})`,
                        `Last Flame: ${formatDate(lastFlameDate)} (${formatDaysAgo(lastFlameDate)})`
                    ].join(' | ');

                    return (
                        `${normalStats}\n\n` +
                        `Gold Stats:\n${goldStats}\n\n` +
                        `Extended Stats:\n${extendedStats}`
                    );
                };

                // ---- Copied Plain Text ----
                // Obeys all Include settings.
                const buildStatsTextPlainCopied = () => {
                    const fillerPlain = INCLUDE_FILLER_DROPS
                        ? ` | ${getClayName()}: ${clayCount} | ${getSandName()}: ${sandCount}`
                        : '';

                    const oresPlain = INCLUDE_ORE_DROPS
                        ? ` | ${buildOreBreakdownPartsPlain().join(', ')}`
                        : '';

                    const goldPlain = INCLUDE_GOLD_STATS
                        ? ` | ${buildGoldStatsPlain()}`
                        : '';

                    const extendedPlain = INCLUDE_EXTENDED_STATS
                        ? ` | ${buildExtendedStatsPlain().join(' | ')}`
                        : '';

                    return (
                        `Mines: ${totalMines}` +
                        ` | Flames: ${totalFlames}` +
                        ` | Din: ${flameCounts.din}, Farore: ${flameCounts.farore}, Nayru: ${flameCounts.nayru}` +
                        fillerPlain +
                        oresPlain +
                        ` | Total Ore: ${totalOre}` +
                        ` | Staff Cards: ${totalStaffCards}` +
                        goldPlain +
                        ` | Lines/Mine: ${linesPerMine}` +
                        ` | Lines/Flame: ${linesPerFlame}` +
                        ` | Mines/Flame: ${minesPerFlame}` +
                        extendedPlain
                    );
                };

                // ---- Copied Forum Text ----
                // Same content/options as Plain Text,
                // with each stat on its own line.
                const buildStatsTextForumCopied = () => {
                    const lines = [
                        `Mines: ${totalMines}`,
                        `Flames: ${totalFlames}`,
                        `Din: ${flameCounts.din}, Farore: ${flameCounts.farore}, Nayru: ${flameCounts.nayru}`
                    ];

                    if (INCLUDE_FILLER_DROPS) {
                        lines.push(`${getClayName()}: ${clayCount}, ${getSandName()}: ${sandCount}`);
                    }

                    if (INCLUDE_ORE_DROPS) {
                        lines.push(buildOreBreakdownPartsPlain().join(', '));
                    }

                    lines.push(`Total Ore: ${totalOre}`);
                    lines.push(`Staff Cards: ${totalStaffCards}`);

                    if (INCLUDE_GOLD_STATS) {
                        lines.push(buildGoldStatsPlain());
                    }

                    lines.push(`Lines/Mine: ${linesPerMine}, Lines/Flame: ${linesPerFlame}, Mines/Flame: ${minesPerFlame}`);

                    if (INCLUDE_EXTENDED_STATS) {
                        lines.push(...buildExtendedStatsPlain());
                    }

                    return lines.join('\n');
                };

                // ---- Copied IRC Text ----
                // Normal stats stay on the first line.
                // Included Gold Stats and/or Extended Stats go on a second line.
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

                    const optionalIRCParts = [];

                    if (INCLUDE_GOLD_STATS) {
                        optionalIRCParts.push(
                            `Total ${getGoldCurrencyName()} [ ${totalGold} ]`,
                            `Avg. ${getGoldCurrencyName()}/Mine [ ${averageGoldPerMine} ]`
                        );
                    }

                    if (INCLUDE_EXTENDED_STATS) {
                        optionalIRCParts.push(
                            `Max Mines/Day [ ${maxMinesPerDay ? `${maxMinesPerDay[1]} on ${formatDate(maxMinesPerDay[0])}` : 'N/A'} ]`,
                            `Last Mine [ ${formatDaysAgo(lastMineDate)} ]`,
                            `Last Flame [ ${formatDaysAgo(lastFlameDate)} ]`
                        );
                    }

                    const normalStats =
                        `Total Mines [ ${totalMines} ]` +
                        ` • \x0304Din\x03 [ ${flameCounts.din} ]` +
                        ` • \x0303Farore\x03 [ ${flameCounts.farore} ]` +
                        ` • \x0310Nayru\x03 [ ${flameCounts.nayru} ]` +
                        fillerIRC +
                        oresIRC +
                        ` • Total Ore [ ${totalOre} ]` +
                        ` • Staff Cards [ ${totalStaffCards} ]` +
                        ` • Lines/Mine [ ${linesPerMine} ]` +
                        ` • Lines/Flame [ ${linesPerFlame} ]` +
                        ` • Mines/Flame [ ${minesPerFlame} ]`;

                    const optionalStats = optionalIRCParts.length
                        ? optionalIRCParts.join(' • ')
                        : '';

                    return optionalStats
                        ? `${normalStats}\n${optionalStats}`
                        : normalStats;
                };

                // ---- Colorize the modal display, including Blast Mode ----
                const buildStatsDisplayHTML = (plainText) => {
                    // Convert pipe separators to line breaks, preserving blank lines
                    // between the three main sections.
                    let html = plainText.replace(/\s*\|\s*/g, '<br>');

                    // Protect currency stats and the Gold Stats heading before applying colors.
                    const currencyName = getGoldCurrencyName();

                    const protectedCurrencyStats = [];

                    const protectText = (text) => {
                        const placeholder = `CURRENCYSTATSPLACEHOLDER${protectedCurrencyStats.length}TOKEN`;
                        protectedCurrencyStats.push({ placeholder, match: text });
                        return placeholder;
                    };

                    // Protect the section heading.
                    html = html.replace(/Gold Stats:/g, protectText);

                    // Protect the currency values.
                    const currencyPattern = new RegExp(
                        `Total ${escapeRegExp(currencyName)}: [^,]+, Avg\\. ${escapeRegExp(currencyName)}/Mine: [^<\\n]+`,
                        'g'
                    );

                    html = html.replace(currencyPattern, protectText);

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
                            { term: 'Meth', color: '#00ffff' },
                            { term: 'BON', color: '#ffd700' }
                        );
                    }

                    html = applyColorRules(html, rules);

                    // Restore the uncolored currency stats.
                    for (const { placeholder, match } of protectedCurrencyStats) {
                        html = html.replace(placeholder, match);
                    }

                    return html;
                };

                // ---- Live state used by copy buttons / modal ----
                let statsTextModal = buildStatsTextModalFull();
                let statsDisplayHTML = buildStatsDisplayHTML(statsTextModal);

                let statsTextIRCCopy = buildStatsTextIRCCopied();
                let statsTextPlainCopy = buildStatsTextPlainCopied();
                let statsTextForumCopy = buildStatsTextForumCopied();

                // ---- Copy for IRC button ----
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

                // ---- Copy Plain Text button (original pipe-separated format) ----
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

                // ---- Copy for Forum button ----
                const copyBtnForum = document.createElement('input');
                copyBtnForum.type = 'submit';
                copyBtnForum.value = 'Copy for Forum';
                copyBtnForum.style.marginTop = '10px';
                copyBtnForum.style.marginLeft = '8px';

                copyBtnForum.onclick = async (e) => {
                    e.preventDefault();

                    try {
                        await navigator.clipboard.writeText(statsTextForumCopy);

                        const originalText = copyBtnForum.value;
                        copyBtnForum.value = 'Copied!';

                        setTimeout(() => {
                            copyBtnForum.value = originalText;
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
                    width: '400px',
                    maxWidth: 'calc(100vw - 40px)',
                    boxSizing: 'border-box'
                });

                const container = document.createElement('div');

                // Separate node for live-updating the stats text in the modal.
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
                container.appendChild(copyBtnForum);

                // Informational note for IRC's two-line output.
                // Create it once, then update its visibility in render().
                const ircInfo = document.createElement('div');
                ircInfo.textContent =
                    'Copy for IRC puts included Gold Stats and/or Extended Stats on a second line, so they can be sent as a separate IRC message.';

                Object.assign(ircInfo.style, {
                    marginTop: '10px',
                    maxWidth: '400px',
                    whiteSpace: 'normal',
                    overflowWrap: 'anywhere'
                });

                // Actually add the note to the modal.
                container.appendChild(ircInfo);

                const closeBtn = document.createElement('input');
                closeBtn.type = 'submit';
                closeBtn.value = 'Close';

                Object.assign(closeBtn.style, {
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    marginLeft: '0'
                });

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

                    cb.addEventListener('change', () => {
                        Promise.resolve(onChange(cb.checked)).catch((error) => {
                            console.error('[Mining Stats] Could not update setting:', error);
                        });
                    });

                    label.appendChild(cb);
                    label.appendChild(document.createTextNode(labelText));

                    return { label, cb };
                };

                const render = () => {
                    // Modal always shows all stats, regardless of Include settings.
                    statsTextModal = buildStatsTextModalFull();
                    statsDisplayHTML = buildStatsDisplayHTML(statsTextModal);
                    statsDiv.innerHTML = `${titleHtml}${statsDisplayHTML}`;

                    // Show the IRC note only when at least one optional section is included.
                    ircInfo.style.display =
                        (INCLUDE_GOLD_STATS || INCLUDE_EXTENDED_STATS) ? 'block' : 'none';

                    // Update copied output.
                    statsTextIRCCopy = buildStatsTextIRCCopied();
                    statsTextPlainCopy = buildStatsTextPlainCopied();
                    statsTextForumCopy = buildStatsTextForumCopied();
                };

                const cbZero = makeCheckbox(
                    'Include zero-quantity ores in IRC copy',
                    SHOW_ZERO_QUANTITY_ORES_IRC,
                    (val) => {
                        SHOW_ZERO_QUANTITY_ORES_IRC = val;
                        saveSetting('mining_stats_show_zero_quantity_ores_irc', val);
                        render();
                    }
                );

                const cbAbbrev = makeCheckbox(
                    'Use abbreviated ore names',
                    USE_ABBREVIATED_ORE_NAMES,
                    (val) => {
                        USE_ABBREVIATED_ORE_NAMES = val;
                        saveSetting('mining_stats_use_abbreviated_ore_names', val);
                        render();
                    }
                );

                const cbFiller = makeCheckbox(
                    'Include filler in copied text',
                    INCLUDE_FILLER_DROPS,
                    (val) => {
                        INCLUDE_FILLER_DROPS = val;
                        saveSetting('mining_stats_include_filler_drops', val);
                        render();
                    }
                );

                const cbOres = makeCheckbox(
                    'Include ore breakdown in copied text',
                    INCLUDE_ORE_DROPS,
                    (val) => {
                        INCLUDE_ORE_DROPS = val;
                        saveSetting('mining_stats_include_ore_drops', val);
                        render();
                    }
                );

                const cbGold = makeCheckbox(
                    'Include Gold Stats in copied text',
                    INCLUDE_GOLD_STATS,
                    (val) => {
                        INCLUDE_GOLD_STATS = val;
                        saveSetting('mining_stats_show_gold_stats', val);
                        render();
                    }
                );

                const cbExtended = makeCheckbox(
                    'Include Extended Stats in copied text',
                    INCLUDE_EXTENDED_STATS,
                    (val) => {
                        INCLUDE_EXTENDED_STATS = val;
                        saveSetting('mining_stats_show_extended_stats', val);
                        render();
                    }
                );

                const cbBlast = makeCheckbox(
                    'Blast Mode',
                    USE_BLAST_MODE,
                    (val) => {
                        USE_BLAST_MODE = val;
                        saveSetting('mining_stats_use_blast_mode', val);
                        render();
                    }
                );

                optsWrap.appendChild(cbZero.label);
                optsWrap.appendChild(cbAbbrev.label);
                optsWrap.appendChild(cbFiller.label);
                optsWrap.appendChild(cbOres.label);
                optsWrap.appendChild(cbGold.label);
                optsWrap.appendChild(cbExtended.label);
                optsWrap.appendChild(cbBlast.label);

                container.appendChild(optsWrap);

                // Set initial IRC note visibility before displaying the modal.
                ircInfo.style.display =
                    (INCLUDE_GOLD_STATS || INCLUDE_EXTENDED_STATS) ? 'block' : 'none';

                modal.appendChild(container);
                document.body.appendChild(modal);

                needsRetry = false;
            } catch (error) {
                console.error('[Mining Stats] Error:', error);

                if ([401, 403].includes(error.status)) {
                    await GM.setValue('mining_stats_api_key', '');
                    apiKey = null;

                    needsRetry = confirm(
                        `API Error: ${error.status === 401 ? 'Invalid key' : 'No permissions'}. Retry?`
                    );
                } else {
                    alert(`Error: ${error.message}`);
                    needsRetry = false;
                }
            }
        } while (needsRetry);
    });

    async function fetchData(url, apiKey) {
        const response = await fetch(url, {
            headers: { 'X-API-Key': apiKey }
        });

        if (!response.ok) {
            throw Object.assign(
                new Error(`HTTP ${response.status}`),
                { status: response.status }
            );
        }

        const data = await response.json();

        if (data?.status !== 'success') {
            throw new Error(data?.error || 'API request failed');
        }

        return data;
    }

    const searchBox = document.querySelectorAll(
        '#user .thin .center form table td input[type="text"]'
    )[0];

    const searchBtn = document.querySelector(
        'input[type="submit"][value="Search log"]'
    );

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
