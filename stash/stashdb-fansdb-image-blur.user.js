// ==UserScript==
// @name         [StashDB][FansDB] Image Blur
// @namespace    https://greasyfork.org/en/users/1566044
// @version      1.0.2
// @description  Blur performer/studio/scene images on stashdb.org and fansdb.cc with a navbar toggle button
// @author       azstrait
// @license      MIT
// @icon         https://raw.githubusercontent.com/stashapp/stash/develop/ui/v2.5/public/favicon.png
// @match        https://stashdb.org/performers*
// @match        https://stashdb.org/studios*
// @match        https://stashdb.org/scenes*
// @match        https://fansdb.cc/performers*
// @match        https://fansdb.cc/studios*
// @match        https://fansdb.cc/scenes*
// @grant        none
// ==/UserScript==
 
(function () {
    'use strict';
 
    const BLUR_AMOUNT = '20px';
 
    // Key is per origin (stashdb vs fansdb) so preferences don't mix
    const STORAGE_KEY = 'stashdb_image_blur_enabled_' + location.origin;
 
    // Default: blur enabled
    let blurEnabled = loadBlurState();
 
    function loadBlurState() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored === null) return true; // default = on
            return stored === 'true';
        } catch (e) {
            return true;
        }
    }
 
    function saveBlurState() {
        try {
            localStorage.setItem(STORAGE_KEY, blurEnabled ? 'true' : 'false');
        } catch (e) {
            // ignore
        }
    }
 
    function applyBlurStyles() {
        let style = document.getElementById('stashdb-image-blur-style');
        if (!style) {
            style = document.createElement('style');
            style.id = 'stashdb-image-blur-style';
            document.head.appendChild(style);
        }
 
        // We scope the rules to the specific containers you described.
        // When blurred: blur(20px); when not: none.
        style.textContent = blurEnabled ? `
            /* Performers & Studios cards */
            .Image img,
            .SceneCard-body.card-body img,
            .ScenePhoto.card-body img {
                filter: blur(${BLUR_AMOUNT}) !important;
                transition: filter 0.2s ease;
            }
        ` : `
            .Image img,
            .SceneCard-body.card-body img,
            .ScenePhoto.card-body img {
                filter: none !important;
                transition: filter 0.2s ease;
            }
        `;
    }
 
    function createToggleButton() {
        // Wait for navbar container
        const containerSelector = 'div.align-items-center.navbar-nav';
        const container = document.querySelector(containerSelector);
        if (!container) return null;
 
        // Create <a> to match other nav items
        const link = document.createElement('a');
        link.href = 'javascript:void(0)';
        link.className = 'nav-link'; // common Bootstrap-style navbar class if present
 
        // Build SVG icon
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 576 512'); // typical FA eye viewBox
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        svg.style.width = '1.25em';
        svg.style.height = '1.25em';
 
        const path = document.createElementNS(svgNS, 'path');
 
        // Paths provided by you:
        const PATH_HIDDEN = 'M41-24.9c-9.4-9.4-24.6-9.4-33.9 0S-2.3-.3 7 9.1l528 528c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-96.4-96.4c2.7-2.4 5.4-4.8 8-7.2 46.8-43.5 78.1-95.4 93-131.1 3.3-7.9 3.3-16.7 0-24.6-14.9-35.7-46.2-87.7-93-131.1-47.1-43.7-111.8-80.6-192.6-80.6-56.8 0-105.6 18.2-146 44.2L41-24.9zM204.5 138.7c23.5-16.8 52.4-26.7 83.5-26.7 79.5 0 144 64.5 144 144 0 31.1-9.9 59.9-26.7 83.5l-34.7-34.7c12.7-21.4 17-47.7 10.1-73.7-13.7-51.2-66.4-81.6-117.6-67.9-8.6 2.3-16.7 5.7-24 10l-34.7-34.7zM325.3 395.1c-11.9 3.2-24.4 4.9-37.3 4.9-79.5 0-144-64.5-144-144 0-12.9 1.7-25.4 4.9-37.3L69.4 139.2c-32.6 36.8-55 75.8-66.9 104.5-3.3 7.9-3.3 16.7 0 24.6 14.9 35.7 46.2 87.7 93 131.1 47.1 43.7 111.8 80.6 192.6 80.6 37.3 0 71.2-7.9 101.5-20.6l-64.2-64.2z';
        const PATH_VISIBLE = 'M288 32c-80.8 0-145.5 36.8-192.6 80.6-46.8 43.5-78.1 95.4-93 131.1-3.3 7.9-3.3 16.7 0 24.6 14.9 35.7 46.2 87.7 93 131.1 47.1 43.7 111.8 80.6 192.6 80.6s145.5-36.8 192.6-80.6c46.8-43.5 78.1-95.4 93-131.1 3.3-7.9 3.3-16.7 0-24.6-14.9-35.7-46.2-87.7-93-131.1-47.1-43.7-111.8-80.6-192.6-80.6zM144 256a144 144 0 1 1 288 0 144 144 0 1 1 -288 0zm144-64c0 35.3-28.7 64-64 64-11.5 0-22.3-3-31.7-8.4-1 10.9-.1 22.1 2.9 33.2 13.7 51.2 66.4 81.6 117.6 67.9s81.6-66.4 67.9-117.6c-12.2-45.7-55.5-74.8-101.1-70.8 5.3 9.3 8.4 20.1 8.4 31.7z';
 
        function updateIcon() {
            // When images are hidden (blurred), use the "hidden" icon
            path.setAttribute('d', blurEnabled ? PATH_HIDDEN : PATH_VISIBLE);
            path.setAttribute('fill', 'currentColor');
            link.title = blurEnabled ? 'Show images' : 'Hide images';
        }
 
        updateIcon();
        svg.appendChild(path);
        link.appendChild(svg);
 
        link.addEventListener('click', (e) => {
            e.preventDefault();
            blurEnabled = !blurEnabled;
            saveBlurState();
            applyBlurStyles();
            updateIcon();
        });
 
        // Insert as first item in that navbar container
        if (container.firstChild) {
            container.insertBefore(link, container.firstChild);
        } else {
            container.appendChild(link);
        }
 
        return link;
    }
 
    // Observe in case navbar is rendered dynamically
    function initWhenNavbarReady() {
        const containerSelector = 'div.align-items-center.navbar-nav';
        const existing = document.querySelector(containerSelector);
        if (existing) {
            applyBlurStyles();
            createToggleButton();
            return;
        }
 
        const observer = new MutationObserver(() => {
            const nav = document.querySelector(containerSelector);
            if (nav) {
                observer.disconnect();
                applyBlurStyles();
                createToggleButton();
            }
        });
 
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
 
        // Also run styles now, in case images exist before navbar
        applyBlurStyles();
    }
 
    // Start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWhenNavbarReady);
    } else {
        initWhenNavbarReady();
    }
})();
