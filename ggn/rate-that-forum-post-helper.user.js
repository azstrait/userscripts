// ==UserScript==
// @name         [GGn] Rate That Post Helper
// @description  Select up to 5 images on supported adult image galleries and generate GGn forum BBCode, with ordered selection and a compact, collapsible UI.
// @author       azstrait
// @license      MIT
// @namespace    https://greasyfork.org/en/users/1566044
// @version      2.1.1
// @match        https://www.pornpics.com/galleries/*
// @match        https://pornpics.com/galleries/*
// @match        https://www.boyspornpics.com/gallery/*
// @match        https://boyspornpics.com/gallery/*
// @match        https://gay9.com/gallery/*
// @match        https://www.gay9.com/gallery/*
// @grant        GM_setClipboard
// @run-at       document-idle
// @icon         https://gazellegames.net/favicon.ico
// ==/UserScript==

(function () {
    'use strict';

    const MAX_IMAGES = 5;
    const MIN_IMAGES = 1;

    const IMAGE_HREF_RE = /\.(jpe?g|png|gif|webp)(\?|#|$)/i;

    // ---- Site config -----------------------------------------------------

    function getSiteConfig() {
        const host = location.hostname;

        if (host.includes('pornpics.com')) {
            return {
                id: 'pornpics',
                label: 'Pornpics',
                findThumbs: () => {
                    const tiles = document.querySelector('#tiles');
                    if (!tiles) return { thumbs: [], container: null };

                    // Any a.rel-link whose href looks like an image
                    const anchors = tiles.querySelectorAll('li.thumbwook a.rel-link[href]');
                    const thumbs = Array.from(anchors)
                        .filter(a => IMAGE_HREF_RE.test(a.href))
                        .map(a => ({
                            li: a.closest('li.thumbwook'),
                            anchor: a,
                            getUrl: () => a.href
                        }))
                        .filter(t => t.li);
                    return { thumbs, container: tiles };
                }
            };
        }

        if (host.includes('gay9.com')) {
            return {
                id: 'gay9',
                label: 'Gay9',
                findThumbs: () => {
                    const container = document.querySelector('#gallery-container');
                    if (!container) return { thumbs: [], container: null };

                    // Main gallery thumbs are .grid-item > a.rel-link, filter to image hrefs
                    const anchors = container.querySelectorAll('.grid-item > a.rel-link[href]');
                    const thumbs = Array.from(anchors)
                        .filter(a => IMAGE_HREF_RE.test(a.href))
                        .map(a => ({
                            li: a.closest('.grid-item'),
                            anchor: a,
                            getUrl: () => a.href
                        }))
                        .filter(t => t.li);
                    return { thumbs, container };
                }
            };
        }

        // Fallback: unsupported
        return null;
    }

    // ---- Helpers ---------------------------------------------------------

    function createEl(tag, props = {}, children = []) {
        const el = document.createElement(tag);
        Object.entries(props).forEach(([k, v]) => {
            if (k === 'style' && typeof v === 'object') {
                Object.assign(el.style, v);
            } else if (k.startsWith('on') && typeof v === 'function') {
                el.addEventListener(k.substring(2), v);
            } else if (k === 'dataset' && typeof v === 'object') {
                Object.assign(el.dataset, v);
            } else {
                el[k] = v;
            }
        });
        if (!Array.isArray(children)) children = [children];
        children.forEach(ch => {
            if (typeof ch === 'string') el.appendChild(document.createTextNode(ch));
            else if (ch) el.appendChild(ch);
        });
        return el;
    }

    async function copyToClipboard(text) {
        if (typeof GM_setClipboard === 'function') {
            GM_setClipboard(text);
            return true;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (e) {
                console.error('Clipboard error:', e);
            }
        }
        return false;
    }

    function addStyles() {
        const css = `
            .ggn-rtp-panel {
                position: fixed;
                right: 10px;
                bottom: 10px;
                z-index: 99999;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                font-size: 14px;
            }

            .ggn-rtp-inner {
                border-radius: 6px;
                width: 390px;          /* fixed width */
                overflow: hidden;
                box-shadow: 0 4px 10px rgba(0,0,0,0.35);
            }

            .ggn-rtp-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 7px 9px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
                user-select: none;
            }

            .ggn-rtp-header-title {
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .ggn-rtp-header-toggle {
                font-size: 18px;
                line-height: 1;
            }

            .ggn-rtp-body {
                padding: 9px;
                font-size: 13px;
            }

            .ggn-rtp-row {
                margin-bottom: 7px;
            }

            .ggn-rtp-buttons-row {
                display: flex;
                flex-wrap: wrap;
                gap: 5px;
                margin-top: 7px;
            }

            .ggn-rtp-btn {
                padding: 4px 10px;
                font-size: 13px;
                border-radius: 4px;
                border: 1px solid;
                cursor: pointer;
                transition: background 0.15s, color 0.15s, border-color 0.15s;
                background: transparent;
            }

            .ggn-rtp-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            .ggn-rtp-counter {
                font-size: 12.5px;
            }

            .ggn-rtp-status {
                font-size: 12.5px;
                min-height: 18px;
            }

            .ggn-rtp-copy-status {
                font-size: 12.5px;
                margin-top: 4px;
                min-height: 18px;
            }

            .ggn-rtp-textarea-wrap {
                margin-top: 7px;
            }

            .ggn-rtp-textarea {
                width: 100%;
                box-sizing: border-box;
                height: 140px;
                resize: vertical;
                font-family: "Fira Code", monospace;
                font-size: 12.5px;
                padding: 5px 7px;
                border-radius: 4px;
                border: 1px solid;
            }

            .ggn-rtp-thumb-selected {
                outline: 3px solid #ff9800 !important;
                outline-offset: -3px;
                box-shadow: 0 0 8px 3px rgba(255,152,0,0.9) !important;
            }

            .ggn-rtp-thumb-selectable {
                cursor: pointer !important;
                position: relative;
            }

            .ggn-rtp-badge {
                position: absolute;
                top: 2px;
                left: 2px;
                min-width: 24px;
                padding: 2px 6px;
                border-radius: 13px;
                font-size: 16px;
                font-weight: 700;
                text-align: center;
                z-index: 9999;
                pointer-events: none;
                box-shadow: 0 0 3px rgba(0,0,0,0.7);
            }

            @media (prefers-color-scheme: light) {
                .ggn-rtp-inner {
                    background: #f8f8f8;
                    border: 1px solid rgba(0,0,0,0.25);
                    color: #111;
                }
                .ggn-rtp-header {
                    background: linear-gradient(to right, #444, #222);
                    color: #fff;
                }
                .ggn-rtp-body {
                    background: #fdfdfd;
                    color: #111;
                }
                .ggn-rtp-btn {
                    border-color: #777;
                    color: #111;
                    background: #f0f0f0;
                }
                .ggn-rtp-btn:hover:not(:disabled) {
                    background: #e0e0e0;
                }
                .ggn-rtp-btn-primary {
                    border-color: #1e88e5;
                    background: #2196f3;
                    color: #fff;
                }
                .ggn-rtp-btn-primary:hover:not(:disabled) {
                    background: #1976d2;
                }
                .ggn-rtp-textarea {
                    border-color: #bbb;
                    background: #fff;
                    color: #111;
                }
                .ggn-rtp-counter {
                    color: #333;
                }
                .ggn-rtp-status,
                .ggn-rtp-copy-status {
                    color: #555;
                }
                .ggn-rtp-badge {
                    background: rgba(0,0,0,0.8);
                    color: #fff;
                }
            }

            @media (prefers-color-scheme: dark) {
                .ggn-rtp-inner {
                    background: #151515;
                    border: 1px solid rgba(255,255,255,0.18);
                    color: #f5f5f5;
                }
                .ggn-rtp-header {
                    background: linear-gradient(to right, #222, #000);
                    color: #f5f5f5;
                }
                .ggn-rtp-body {
                    background: #202020;
                    color: #f5f5f5;
                }
                .ggn-rtp-btn {
                    border-color: #888;
                    color: #f5f5f5;
                    background: #2b2b2b;
                }
                .ggn-rtp-btn:hover:not(:disabled) {
                    background: #383838;
                }
                .ggn-rtp-btn-primary {
                    border-color: #64b5f6;
                    background: #1e88e5;
                    color: #fff;
                }
                .ggn-rtp-btn-primary:hover:not(:disabled) {
                    background: #1565c0;
                }
                .ggn-rtp-textarea {
                    border-color: #555;
                    background: #111;
                    color: #f5f5f5;
                }
                .ggn-rtp-counter {
                    color: #ccc;
                }
                .ggn-rtp-status,
                .ggn-rtp-copy-status {
                    color: #bbb;
                }
                .ggn-rtp-badge {
                    background: rgba(0,0,0,0.8);
                    color: #fff;
                }
            }
        `;
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ---- UI Construction -------------------------------------------------

    function buildPanel(siteLabel) {
        const galleryUrl = window.location.href;

        const headerTitle = createEl('div', { className: 'ggn-rtp-header-title' }, [
            createEl('span', {}, 'GGn Rate That'),
            createEl('span', { style: { fontSize: '11px', opacity: '0.8' } }, siteLabel)
        ]);

        const headerToggle = createEl('span', {
            className: 'ggn-rtp-header-toggle'
        }, '▾');

        const header = createEl('div', {
            className: 'ggn-rtp-header'
        }, [headerTitle, headerToggle]);

        const counter = createEl('div', { className: 'ggn-rtp-counter ggn-rtp-row' }, 'Selected: 0 / ' + MAX_IMAGES);
        const status = createEl('div', { className: 'ggn-rtp-status ggn-rtp-row' }, 'Click "Start Selecting" to begin.');
        const copyStatus = createEl('div', { className: 'ggn-rtp-copy-status ggn-rtp-row' }, '');

        const startStopBtn = createEl('button', {
            className: 'ggn-rtp-btn ggn-rtp-btn-primary',
            textContent: 'Start Selecting'
        });

        const clearBtn = createEl('button', {
            className: 'ggn-rtp-btn',
            textContent: 'Clear Selected',
            disabled: true
        });

        const buttonsRow1 = createEl('div', {
            className: 'ggn-rtp-buttons-row'
        }, [startStopBtn, clearBtn]);

        const textarea = createEl('textarea', {
            className: 'ggn-rtp-textarea',
            placeholder: 'Generated BBCode will appear here...',
            style: { display: 'none' }
        });

        const generateBtn = createEl('button', {
            className: 'ggn-rtp-btn',
            textContent: 'Generate Post'
        });

        const copyBtn = createEl('button', {
            className: 'ggn-rtp-btn',
            textContent: 'Copy to Clipboard',
            disabled: true,
            style: { display: 'none' }
        });

        const buttonsRow2 = createEl('div', {
            className: 'ggn-rtp-buttons-row'
        }, [generateBtn, copyBtn]);

        const textareaWrap = createEl('div', {
            className: 'ggn-rtp-textarea-wrap'
        }, [textarea, buttonsRow2, copyStatus]);

        const body = createEl('div', {
            className: 'ggn-rtp-body'
        }, [
            counter,
            status,
            buttonsRow1,
            textareaWrap
        ]);

        const inner = createEl('div', {
            className: 'ggn-rtp-inner'
        }, [header, body]);

        const panel = createEl('div', { className: 'ggn-rtp-panel' }, [inner]);

        panel._selection = {
            active: false,
            selectedThumbs: [],  // ordered array of { li, anchor, getUrl }
            galleryUrl,
            hasGeneratedOnce: false,
            collapsed: false
        };

        header.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            const sel = panel._selection;
            sel.collapsed = !sel.collapsed;
            body.style.display = sel.collapsed ? 'none' : 'block';
            headerToggle.textContent = sel.collapsed ? '▴' : '▾';
        });

        startStopBtn.addEventListener('click', () => {
            const sel = panel._selection;
            sel.active = !sel.active;

            if (sel.active) {
                startStopBtn.textContent = 'Stop Selecting';
                status.textContent = `Selection ON. Click thumbnails to select up to ${MAX_IMAGES} images.`;
            } else {
                startStopBtn.textContent = 'Start Selecting';
                status.textContent = 'Selection OFF. You can still generate/regenerate from your current selection.';
            }
        });

        clearBtn.addEventListener('click', () => {
            clearSelection(panel);
            status.textContent = 'Selection cleared.';
            copyStatus.textContent = '';
        });

        generateBtn.addEventListener('click', () => {
            const sel = panel._selection;
            const urls = sel.selectedThumbs.map(t => t.getUrl());

            copyStatus.textContent = '';

            if (urls.length < MIN_IMAGES) {
                status.textContent = `Please select at least ${MIN_IMAGES} image(s) before generating.`;
                return;
            }
            if (urls.length > MAX_IMAGES) {
                status.textContent = `You have more than ${MAX_IMAGES} images selected; please deselect some.`;
                return;
            }

            const bbcode = buildBBCode(urls, sel.galleryUrl);
            textarea.value = bbcode;

            textarea.style.display = 'block';
            copyBtn.style.display = 'inline-block';
            copyBtn.disabled = false;

            sel.hasGeneratedOnce = true;
            generateBtn.textContent = 'Regenerate Post';
            status.textContent = 'Post text generated. Adjust your selection and click Regenerate if needed.';
        });

        copyBtn.addEventListener('click', async () => {
            const text = textarea.value.trim();
            copyStatus.textContent = '';

            if (!text) {
                status.textContent = 'Nothing to copy yet.';
                return;
            }
            const ok = await copyToClipboard(text);
            if (ok) {
                copyStatus.textContent = 'Copied to clipboard!';
            } else {
                copyStatus.textContent = 'Could not copy automatically. Please copy manually.';
            }
        });

        panel._els = {
            counter,
            status,
            copyStatus,
            clearBtn,
            textarea,
            textareaWrap,
            generateBtn,
            copyBtn
        };

        return panel;
    }

    // ---- Thumbnail selection & badges ------------------------------------

    function makeThumbnailsSelectable(cfg, panel) {
        const { thumbs } = cfg.findThumbs();
        const { status } = panel._els;

        if (!thumbs || !thumbs.length) {
            status.textContent = 'Could not find thumbnails on this page. The layout may have changed.';
            return;
        }

        thumbs.forEach(t => {
            const li = t.li;
            if (!li) return;

            li.classList.add('ggn-rtp-thumb-selectable');

            li.addEventListener('click', (e) => {
                const sel = panel._selection;
                if (!sel.active) return; // normal navigation when not selecting

                e.preventDefault();
                e.stopPropagation();

                toggleThumbSelection(li, t, panel);
            }, true);
        });
    }

    function ensureBadge(li) {
        let badge = li.querySelector('.ggn-rtp-badge');
        if (!badge) {
            badge = createEl('div', { className: 'ggn-rtp-badge' }, '');
            li.appendChild(badge);
        }
        return badge;
    }

    function removeBadge(li) {
        const badge = li.querySelector('.ggn-rtp-badge');
        if (badge) badge.remove();
    }

    function refreshBadges(panel) {
        const sel = panel._selection;
        sel.selectedThumbs.forEach((t, idx) => {
            const li = t.li;
            if (!li) return;
            const badge = ensureBadge(li);
            badge.textContent = (idx + 1).toString();
        });
    }

    function toggleThumbSelection(li, thumb, panel) {
        const sel = panel._selection;
        const { counter, status, clearBtn } = panel._els;

        const idx = sel.selectedThumbs.findIndex(t => t === thumb);
        if (idx >= 0) {
            sel.selectedThumbs.splice(idx, 1);
            li.classList.remove('ggn-rtp-thumb-selected');
            removeBadge(li);
            status.textContent = 'Image deselected.';
        } else {
            if (sel.selectedThumbs.length >= MAX_IMAGES) {
                status.textContent = `You already have ${MAX_IMAGES} images selected. Deselect one to choose another.`;
                return;
            }
            sel.selectedThumbs.push(thumb);
            li.classList.add('ggn-rtp-thumb-selected');
            status.textContent = 'Image selected.';
        }

        const count = sel.selectedThumbs.length;
        counter.textContent = `Selected: ${count} / ${MAX_IMAGES}`;
        clearBtn.disabled = count === 0;

        refreshBadges(panel);
    }

    function clearSelection(panel) {
        const sel = panel._selection;
        const { counter, clearBtn, textarea, copyBtn, copyStatus, generateBtn } = panel._els;

        sel.selectedThumbs.forEach(t => {
            const li = t.li;
            if (li) {
                li.classList.remove('ggn-rtp-thumb-selected');
                removeBadge(li);
            }
        });
        sel.selectedThumbs = [];

        counter.textContent = `Selected: 0 / ${MAX_IMAGES}`;
        clearBtn.disabled = true;

        textarea.style.display = 'none';
        textarea.value = '';
        copyBtn.style.display = 'none';
        copyBtn.disabled = true;
        copyStatus.textContent = '';
        generateBtn.textContent = 'Generate Post';
    }

    // ---- BBCode builder --------------------------------------------------

    function buildBBCode(imageUrls, galleryUrl) {
        const selected = imageUrls.slice(0, MAX_IMAGES);
        const lines = selected.map(url => `[img=${url}]`);
        lines.push(`[url=${galleryUrl}]Sauce[/url]`);
        return lines.join('\n');
    }

    // ---- Main ------------------------------------------------------------

    function init() {
        const cfg = getSiteConfig();
        if (!cfg) return;

        addStyles();

        const panel = buildPanel(cfg.label);
        document.body.appendChild(panel);

        makeThumbnailsSelectable(cfg, panel);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
