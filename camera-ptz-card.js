/*
 * Camera PTZ Card
 * A four-way arrow pad that moves a camera up, down, left and right.
 *
 * Two ways to drive the camera:
 *   1. ONVIF (default): set `entity` to an ONVIF camera and the card calls onvif.ptz.
 *   2. Button entities: set up_entity / down_entity / left_entity / right_entity
 *      (button, input_button, script or scene) and the card presses them.
 *      A direction with its own entity always uses that entity.
 */

// Read by .github/workflows/release.yml: bump this to publish a new release.
const CARD_VERSION = "1.0.2";

const DIRECTIONS = {
  up: { label: "Move up", tilt: "UP", path: "M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z" },
  down: { label: "Move down", tilt: "DOWN", path: "M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z" },
  left: { label: "Move left", pan: "LEFT", path: "M15.41 16.59 10.83 12l4.58-4.59L14 6l-6 6 6 6z" },
  right: { label: "Move right", pan: "RIGHT", path: "M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z" },
};

const DEFAULTS = {
  size: 150,
  move_mode: "ContinuousMove",
  speed: 0.5,
  distance: 0.1,
  continuous_duration: 0.5,
  hold_repeat: true,
  repeat_interval: 500,
};

const STYLE = `
  :host { display: block; height: 100%; }
  ha-card {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4px;
    box-sizing: border-box;
    overflow: hidden;
  }
  .title {
    flex: none;
    color: var(--primary-text-color);
    font-size: 1.1em;
    font-weight: 500;
    line-height: 20px;
    margin-bottom: 8px;
  }
  .pad {
    position: relative;
    box-sizing: border-box;
    /* Sized by height so it shrinks to fit whatever space the dashboard gives the card. */
    height: var(--pad-size, 150px);
    flex: 0 1 auto;
    min-height: 0;
    aspect-ratio: 1;
    border-radius: 50%;
    background: var(--secondary-background-color);
    border: 1px solid var(--divider-color);
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(3, 1fr);
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }
  .hub {
    grid-area: 2 / 2;
    margin: 18%;
    border-radius: 50%;
    background: var(--card-background-color);
    border: 1px solid var(--divider-color);
  }
  button {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 8%;
    border-radius: 50%;
    cursor: pointer;
    color: var(--primary-text-color);
    transition: background-color 120ms, color 120ms, transform 120ms;
    -webkit-tap-highlight-color: transparent;
  }
  button svg { width: 70%; height: 70%; fill: currentColor; pointer-events: none; }
  button:hover { color: var(--primary-color); }
  button:focus-visible { outline: 2px solid var(--primary-color); }
  button.active {
    background: var(--primary-color);
    color: var(--text-primary-color, #fff);
    transform: scale(0.94);
  }
  .up { grid-area: 1 / 2; }
  .left { grid-area: 2 / 1; }
  .right { grid-area: 2 / 3; }
  .down { grid-area: 3 / 2; }
`;

class CameraPtzCard extends HTMLElement {
  // Called once with the YAML the user wrote (and again on every editor change).
  setConfig(config) {
    const hasAllButtons = Object.keys(DIRECTIONS).every((d) => config[`${d}_entity`]);
    if (!config.entity && !hasAllButtons) {
      throw new Error(
        "Define a camera `entity` (ONVIF), or all four of up_entity, down_entity, left_entity and right_entity"
      );
    }
    this._config = { ...DEFAULTS, ...config };
    this._stop();
    this._render();
  }

  // Nothing on the card depends on state, so we only keep the reference.
  set hass(hass) {
    this._hass = hass;
  }

  disconnectedCallback() {
    this._stop();
  }

  _render() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const root = this.shadowRoot;
    root.innerHTML = "";

    const style = document.createElement("style");
    style.textContent = STYLE;
    root.appendChild(style);

    const card = document.createElement("ha-card");
    if (this._config.title) {
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = this._config.title;
      card.appendChild(title);
    }

    const pad = document.createElement("div");
    pad.className = "pad";
    pad.style.setProperty("--pad-size", `${this._padSize()}px`);
    pad.addEventListener("contextmenu", (ev) => ev.preventDefault());

    for (const [dir, def] of Object.entries(DIRECTIONS)) {
      const btn = document.createElement("button");
      btn.className = dir;
      btn.setAttribute("aria-label", def.label);
      btn.title = def.label;
      btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="${def.path}"/></svg>`;

      btn.addEventListener("pointerdown", (ev) => {
        if (ev.button !== 0) return;
        ev.preventDefault();
        btn.setPointerCapture(ev.pointerId);
        this._start(dir, btn);
      });
      for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
        btn.addEventListener(type, () => this._stop());
      }
      // Keyboard: Enter / Space sends a single move.
      btn.addEventListener("keydown", (ev) => {
        if ((ev.key === "Enter" || ev.key === " ") && !ev.repeat) {
          ev.preventDefault();
          this._move(dir);
        }
      });
      pad.appendChild(btn);
    }

    const hub = document.createElement("div");
    hub.className = "hub";
    pad.appendChild(hub);

    card.appendChild(pad);
    root.appendChild(card);
  }

  // Press: move once, then keep moving while the button is held.
  _start(dir, btn) {
    this._stop();
    this._activeBtn = btn;
    btn.classList.add("active");
    this._move(dir);
    if (this._config.hold_repeat) {
      const interval = Math.max(150, Number(this._config.repeat_interval) || DEFAULTS.repeat_interval);
      this._timer = setInterval(() => this._move(dir), interval);
    }
  }

  _stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    if (this._activeBtn) {
      this._activeBtn.classList.remove("active");
      this._activeBtn = null;
    }
  }

  _move(dir) {
    if (!this._hass) return;
    const cfg = this._config;
    const override = cfg[`${dir}_entity`];

    // Per-direction entity: press / run it.
    if (override) {
      const domain = override.split(".")[0];
      const service = domain === "button" || domain === "input_button" ? "press" : "turn_on";
      this._hass.callService(domain, service, { entity_id: override });
      return;
    }

    // Default: ONVIF PTZ on the camera entity.
    if (!cfg.entity) return;
    const def = DIRECTIONS[dir];
    const data = {
      entity_id: cfg.entity,
      move_mode: cfg.move_mode,
      speed: Number(cfg.speed),
      distance: Number(cfg.distance),
      continuous_duration: Number(cfg.continuous_duration),
    };
    if (def.pan) data.pan = def.pan;
    if (def.tilt) data.tilt = def.tilt;
    this._hass.callService("onvif", "ptz", data);
  }

  _padSize() {
    const size = Number(this._config && this._config.size);
    return size > 0 ? Math.min(400, Math.max(80, size)) : DEFAULTS.size;
  }

  // Full card height in px: pad + padding + card border (+ title).
  _cardHeight() {
    const title = this._config && this._config.title ? 28 : 0;
    return this._padSize() + 8 + 2 + title;
  }

  // Height hint for masonry layouts (1 unit is about 50px).
  getCardSize() {
    return Math.ceil(this._cardHeight() / 50);
  }

  // Default size in the sections (grid) layout. A row is 56px plus an 8px gap.
  getGridOptions() {
    const rows = Math.ceil((this._cardHeight() + 8) / 64);
    return { columns: 6, rows, min_columns: 3, min_rows: 2 };
  }

  // Visual editor form.
  static getConfigForm() {
    const press = { entity: { domain: ["button", "input_button", "script", "scene"] } };
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "size", selector: { number: { min: 80, max: 400, step: 10, mode: "box", unit_of_measurement: "px" } } },
        { name: "entity", selector: { entity: { domain: "camera" } } },
        {
          name: "move_mode",
          selector: {
            select: {
              mode: "dropdown",
              options: ["ContinuousMove", "RelativeMove", "AbsoluteMove"],
            },
          },
        },
        {
          type: "grid",
          name: "",
          schema: [
            { name: "speed", selector: { number: { min: 0, max: 1, step: 0.05, mode: "box" } } },
            { name: "distance", selector: { number: { min: 0, max: 1, step: 0.05, mode: "box" } } },
            {
              name: "continuous_duration",
              selector: { number: { min: 0.1, max: 5, step: 0.1, mode: "box", unit_of_measurement: "s" } },
            },
            {
              name: "repeat_interval",
              selector: { number: { min: 150, max: 5000, step: 50, mode: "box", unit_of_measurement: "ms" } },
            },
          ],
        },
        { name: "hold_repeat", selector: { boolean: {} } },
        {
          type: "expandable",
          name: "",
          title: "Use button entities instead of ONVIF",
          flatten: true,
          schema: [
            { name: "up_entity", selector: press },
            { name: "down_entity", selector: press },
            { name: "left_entity", selector: press },
            { name: "right_entity", selector: press },
          ],
        },
      ],
      computeLabel: (schema) =>
        ({
          title: "Title (optional)",
          size: "Pad size",
          entity: "Camera (ONVIF)",
          move_mode: "Move mode",
          speed: "Speed",
          distance: "Distance (relative move)",
          continuous_duration: "Move duration",
          repeat_interval: "Repeat interval while held",
          hold_repeat: "Keep moving while held",
          up_entity: "Up",
          down_entity: "Down",
          left_entity: "Left",
          right_entity: "Right",
        })[schema.name],
    };
  }

  // Starting config when the card is picked from the card list.
  static getStubConfig(hass) {
    const camera = hass && Object.keys(hass.states).find((id) => id.startsWith("camera."));
    return { entity: camera || "camera.my_camera" };
  }
}

customElements.define("camera-ptz-card", CameraPtzCard);
console.info(`%c CAMERA-PTZ-CARD %c v${CARD_VERSION} `, "color:#fff;background:#03a9f4", "");

// Makes the card show up in the "Add card" picker.
window.customCards = window.customCards || [];
window.customCards.push({
  type: "camera-ptz-card",
  name: "Camera PTZ Card",
  description: "Arrow pad to move a camera up, down, left and right.",
});
