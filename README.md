# Camera PTZ Card

A Home Assistant dashboard card with a round four-way arrow pad that moves a camera up, down, left and right. Tap an arrow to move one step, or hold it to keep moving.

It works with:

- **ONVIF cameras**, by calling the `onvif.ptz` action on the camera entity.
- **Any camera that exposes button entities** for pan and tilt (Reolink, Tapo and similar). Scripts, scenes and input buttons work too.

## Installation

### HACS

1. In HACS, open the three-dot menu and choose **Custom repositories**.
2. Add `https://github.com/YOUR_USERNAME/camera-ptz-card` with the type **Dashboard**.
3. Find **Camera PTZ Card** in HACS and click **Download**.
4. Refresh the browser.

### Manual

1. Copy `camera-ptz-card.js` to `config/www/` in Home Assistant.
2. Go to **Settings → Dashboards → three-dot menu → Resources** and add `/local/camera-ptz-card.js` as a **JavaScript module**.
3. Hard-refresh the browser.

## Usage

Add the card from the card picker ("Camera PTZ Card") and fill in the form, or use YAML.

### ONVIF camera

```yaml
type: custom:camera-ptz-card
entity: camera.front_door
```

### Button entities

```yaml
type: custom:camera-ptz-card
up_entity: button.cam_tilt_up
down_entity: button.cam_tilt_down
left_entity: button.cam_pan_left
right_entity: button.cam_pan_right
```

You can also mix the two: a direction that has its own entity uses that entity, and the rest use ONVIF on `entity`.

## Options

| Option | Default | Description |
|---|---|---|
| `entity` | none | ONVIF camera entity. Required unless all four direction entities are set. |
| `up_entity`, `down_entity`, `left_entity`, `right_entity` | none | A `button`, `input_button`, `script` or `scene` to trigger for that direction. |
| `title` | none | Heading shown above the pad. |
| `move_mode` | `ContinuousMove` | ONVIF move mode: `ContinuousMove`, `RelativeMove` or `AbsoluteMove`. Try `RelativeMove` if the camera does not respond. |
| `speed` | `0.5` | ONVIF speed, from 0 to 1. |
| `distance` | `0.1` | Step size for relative moves, from 0 to 1. |
| `continuous_duration` | `0.5` | Seconds each continuous move lasts. |
| `hold_repeat` | `true` | Keep moving while an arrow is held. |
| `repeat_interval` | `500` | Milliseconds between repeats while held. |
