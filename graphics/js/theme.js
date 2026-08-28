'use strict';

// Theme and colour helpers shared by the graphics in this folder.
//
// Both graphics derive their whole palette from the first gradient colour, so
// this file owns that derivation. It was previously copy-pasted verbatim into
// overlay-integrated.html and participant.html.
//
// Exposed as window.QuizTheme; pages destructure what they need.
(function (global) {

    function hexToRgb(hex) {
        if (!hex) return null;
        const cleaned = hex.replace('#', '');
        if (cleaned.length !== 3 && cleaned.length !== 6) return null;
        const full = cleaned.length === 3 ? cleaned.split('').map(c => c + c).join('') : cleaned;
        const r = parseInt(full.substring(0, 2), 16);
        const g = parseInt(full.substring(2, 4), 16);
        const b = parseInt(full.substring(4, 6), 16);
        return { r, g, b };
    }

    function rgbToHex({ r, g, b }) {
        const toHex = (n) => n.toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    function mixRgb(a, b, t) {
        const clamped = Math.max(0, Math.min(1, t));
        return {
            r: Math.round(a.r + (b.r - a.r) * clamped),
            g: Math.round(a.g + (b.g - a.g) * clamped),
            b: Math.round(a.b + (b.b - a.b) * clamped)
        };
    }

    function approxLuminance({ r, g, b }) {
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }

    function setCssVar(name, value) {
        document.documentElement.style.setProperty(name, value);
    }

    function applyTheme(backgroundHex) {
        const bg = backgroundHex || '#1a1a2e';

        const bgRgb = hexToRgb(bg) || { r: 26, g: 26, b: 46 };
        const isLightBg = approxLuminance(bgRgb) > 0.58;
        const contrastTarget = isLightBg ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };

        // Accent derived from background (same hue family, higher contrast).
        const accentRgb = mixRgb(bgRgb, contrastTarget, isLightBg ? 0.72 : 0.65);
        const accent = rgbToHex(accentRgb);

        setCssVar('--theme-bg', bg);

        // Surfaces derived from background (slightly pushed towards contrastTarget).
        const surface1Rgb = mixRgb(bgRgb, contrastTarget, 0.14);
        const surface2Rgb = mixRgb(bgRgb, contrastTarget, 0.20);
        setCssVar('--theme-surface', `rgba(${surface1Rgb.r}, ${surface1Rgb.g}, ${surface1Rgb.b}, ${isLightBg ? 0.72 : 0.14})`);
        setCssVar('--theme-surface-2', `rgba(${surface2Rgb.r}, ${surface2Rgb.g}, ${surface2Rgb.b}, ${isLightBg ? 0.58 : 0.09})`);

        if (isLightBg) {
            setCssVar('--theme-text', 'rgba(27, 13, 13, 0.92)');
            setCssVar('--theme-text-strong', '#1b0d0d');
            setCssVar('--theme-muted', 'rgba(27, 13, 13, 0.55)');
        } else {
            setCssVar('--theme-text', 'rgba(255, 255, 255, 0.92)');
            setCssVar('--theme-text-strong', '#ffffff');
            setCssVar('--theme-muted', 'rgba(255, 255, 255, 0.55)');
        }

        setCssVar('--theme-accent', accent);
        setCssVar('--theme-accent-rgb', `${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}`);
        setCssVar('--theme-accent-soft', `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.14)`);
        setCssVar('--theme-border', `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.55)`);
        setCssVar('--theme-border-soft', `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.28)`);

        // Status colors: keep green/red hue, adjust lightness for readability on the chosen background.
        const baseSuccessRgb = { r: 0, g: 255, b: 136 };
        const baseDangerRgb = { r: 255, g: 68, b: 68 };
        const statusMix = isLightBg ? { t: 0.58, target: { r: 0, g: 0, b: 0 } } : { t: 0.16, target: { r: 255, g: 255, b: 255 } };
        const successRgb = mixRgb(baseSuccessRgb, statusMix.target, statusMix.t);
        const dangerRgb = mixRgb(baseDangerRgb, statusMix.target, statusMix.t);
        setCssVar('--theme-success', rgbToHex(successRgb));
        setCssVar('--theme-success-rgb', `${successRgb.r}, ${successRgb.g}, ${successRgb.b}`);
        setCssVar('--theme-danger', rgbToHex(dangerRgb));
        setCssVar('--theme-danger-rgb', `${dangerRgb.r}, ${dangerRgb.g}, ${dangerRgb.b}`);

        document.body.style.background = `linear-gradient(135deg, ${window.currentGradientColor1 || '#224aa8'}, ${window.currentGradientColor2 || '#b56fdc'})`;
    }

    function applyGradient(color1, color2) {
        window.currentGradientColor1 = color1 || '#224aa8';
        window.currentGradientColor2 = color2 || '#b56fdc';
        document.body.style.background = `linear-gradient(135deg, ${window.currentGradientColor1}, ${window.currentGradientColor2})`;
        // Apply theme based on the first gradient color for UI elements
        applyTheme(window.currentGradientColor1);
    }

    function hexToRgba(hex, alpha) {
        hex = hex.replace('#', '');
        if (hex.length === 3) {
            hex = hex.split('').map(c => c + c).join('');
        }
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    global.QuizTheme = {
        hexToRgb,
        rgbToHex,
        mixRgb,
        approxLuminance,
        setCssVar,
        applyTheme,
        applyGradient,
        hexToRgba
    };
})(window);
