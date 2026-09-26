'use strict';
// Focus-independent controller input, for the same reason uiohook-napi exists for
// keyboard/mouse: every overlay window shows via showInactive() and never takes OS
// focus, so the game keeps it - and the browser Gamepad API only delivers updates to a
// focused page. There is no way to poll navigator.getGamepads() from the renderer here
// without it going stale exactly while the game is being played.
//
// uiohook-napi has no gamepad support, so this reads raw HID input reports directly
// (node-hid) and decodes the button bits by hand. That makes this DualSense-specific -
// the report layout is vendor/model-specific - but it is data (CONTROLLER_PROFILES),
// not inline constants, so a second controller is one more entry, not a rewrite.

// Button numbering matches dualsense-gamepad-button-map.md / the browser's own
// "standard gamepad" mapping, so a config value means the same button everywhere
// regardless of whether it came from the probe or from here.
const BUTTON_KEYS = [
  'cross', 'circle', 'square', 'triangle', 'l1', 'r1', 'l2', 'r2',
  'create', 'options', 'l3', 'r3',
  'dpad_up', 'dpad_down', 'dpad_left', 'dpad_right', 'ps', 'touchpad',
  'mute', // DualSense microphone button - beyond the standard mapping, which ends at 17
];

// USB only - Bluetooth wraps the same payload behind an extra byte (different report ID,
// every offset below shifted by one) and is out of scope here. Byte offsets are the
// well-documented DualSense HID layout; vendor/product ID matches controller-probe's log.
const CONTROLLER_PROFILES = [
  {
    name: 'DualSense',
    vendorId: 0x054c,
    productId: 0x0ce6,
    usbReportId: 0x01,
    buttonsBase: 8,
  },
];

function decodeButtons(buf, profile) {
  if (buf[0] !== profile.usbReportId || buf.length < profile.buttonsBase + 3) return null;
  const base = profile.buttonsBase;
  const b1 = buf[base], b2 = buf[base + 1], b3 = buf[base + 2];
  const hat = b1 & 0x0f; // D-pad hat switch: 0=N,1=NE,2=E,...,7=NW,8=released
  const bits = new Array(BUTTON_KEYS.length).fill(false);
  bits[0] = !!(b1 & 0x20);  // Cross
  bits[1] = !!(b1 & 0x40);  // Circle
  bits[2] = !!(b1 & 0x10);  // Square
  bits[3] = !!(b1 & 0x80);  // Triangle
  bits[4] = !!(b2 & 0x01);  // L1
  bits[5] = !!(b2 & 0x02);  // R1
  bits[6] = !!(b2 & 0x04);  // L2 (digital)
  bits[7] = !!(b2 & 0x08);  // R2 (digital)
  bits[8] = !!(b2 & 0x10);  // Create/Share
  bits[9] = !!(b2 & 0x20);  // Options
  bits[10] = !!(b2 & 0x40); // L3
  bits[11] = !!(b2 & 0x80); // R3
  bits[12] = hat === 0 || hat === 1 || hat === 7; // D-pad up
  bits[13] = hat === 3 || hat === 4 || hat === 5; // D-pad down
  bits[14] = hat === 5 || hat === 6 || hat === 7; // D-pad left
  bits[15] = hat === 1 || hat === 2 || hat === 3; // D-pad right
  bits[16] = !!(b3 & 0x01); // PS/Home
  bits[17] = !!(b3 & 0x02); // Touchpad click
  bits[18] = !!(b3 & 0x04); // Mic mute - the game does not read it, a free button
  return bits;
}

function create(deps) {
  const { log } = deps || {};
  const say = (msg) => { try { log && log('gamepad', msg); } catch { /* logging must never break input */ } };

  let HID = null, hidTried = false;
  function loadHid() {
    if (hidTried) return HID;
    hidTried = true;
    try { HID = require('node-hid'); } catch (err) {
      HID = null;
      say('node-hid unavailable: ' + (err && err.message || err));
    }
    return HID;
  }

  let device = null;
  let activeProfile = null;
  let prevBits = new Array(BUTTON_KEYS.length).fill(false);
  let retryTimer = null;
  const listeners = [];
  let capture = null; // { cb, seen: Set } while the settings capture is waiting
  let captureTimer = null;

  function findDevicePath(hid, profile) {
    let list;
    try { list = hid.devices(); } catch { return null; }
    const matches = list.filter((d) => d.vendorId === profile.vendorId && d.productId === profile.productId);
    if (!matches.length) return null;
    // Some platforms expose more than one HID interface for the same pad (e.g. an
    // audio-control collection); the one that streams full input reports is the
    // generic-desktop game-pad usage.
    const gamepad = matches.find((d) => d.usagePage === 0x01 && d.usage === 0x05);
    return (gamepad || matches[0]).path;
  }

  function closeDevice() {
    try { device && device.close(); } catch { /* already gone */ }
    device = null;
    activeProfile = null;
    prevBits = new Array(BUTTON_KEYS.length).fill(false);
  }

  function handleReport(buf) {
    const bits = decodeButtons(buf, activeProfile);
    if (!bits) return;
    // bits is fully updated before any press fires, so a listener sees everything that
    // is held at that moment (a combo "PS + L2" is: L2 goes down while PS is held)
    const held = new Set();
    for (let i = 0; i < bits.length; i++) if (bits[i]) held.add(i);
    for (let i = 0; i < bits.length; i++) {
      if (bits[i] && !prevBits[i]) fireButtonDown(i, held);
    }
    prevBits = bits;
    // a capture ends when every button is up again: what was pressed in between is the
    // binding - one button, or a combo like PS + L2
    if (capture && capture.seen.size && !held.size) {
      const c = capture; capture = null; clearTimeout(captureTimer);
      const list = [...c.seen].sort((a, b) => a - b);
      c.cb(list.length === 1 ? list[0] : list.slice(0, 3));
    }
  }

  function fireButtonDown(i, held) {
    if (capture) { capture.seen.add(i); return; }
    for (const fn of listeners) { try { fn(i, held); } catch { /* one bad listener must not break the rest */ } }
  }

  function tryConnect() {
    if (device) return true;
    const hid = loadHid();
    if (!hid) return false;
    for (const profile of CONTROLLER_PROFILES) {
      const p = findDevicePath(hid, profile);
      if (!p) continue;
      try {
        device = new hid.HID(p);
        activeProfile = profile;
        device.on('data', handleReport);
        device.on('error', (err) => { say('device error: ' + (err && err.message || err)); closeDevice(); });
        say(`connected: ${profile.name}`);
        return true;
      } catch (err) {
        say(`open failed for ${profile.name}: ` + (err && err.message || err));
        device = null;
      }
    }
    return false;
  }

  function start() {
    tryConnect();
    if (!retryTimer) retryTimer = setInterval(() => { if (!device) tryConnect(); }, 3000);
  }

  function stop() {
    if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
    closeDevice();
  }

  function onButtonDown(fn) { listeners.push(fn); }

  // Settings "click, then press a controller button": collects every button pressed
  // until all are released again, then answers with one index or a sorted combo
  // ([16, 6] = PS + L2); null if nothing arrives in time. (It used to take the very
  // first press, which made combos impossible.)
  function captureNext(cb, timeoutMs) {
    capture = { cb, seen: new Set() };
    clearTimeout(captureTimer);
    captureTimer = setTimeout(() => {
      if (capture && capture.cb === cb) { capture = null; cb(null); }
    }, timeoutMs || 8000);
  }

  return { start, stop, onButtonDown, captureNext, isConnected: () => !!device };
}

module.exports = { create, BUTTON_KEYS };
