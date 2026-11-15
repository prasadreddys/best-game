// Keyboard input. Held keys steer and drive; one-shot presses (start, restart, pause,
// mute) are queued as bit flags and taken once by the loop, so a press between two
// frames is never lost and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_RESTART = 2;
export const ACTION_PAUSE = 4;
export const ACTION_MUTE = 8;

const UP = new Set(['KeyW', 'ArrowUp']);
const DOWN = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const BOOST = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const RESTART = new Set(['KeyR']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);

export function createInput() {
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  let boost = false;
  let actions = 0;

  function onKeyDown(event) {
    if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (BOOST.has(event.code)) boost = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else return;
    event.preventDefault();
  }

  function onKeyUp(event) {
    if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (BOOST.has(event.code)) boost = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    up = false;
    down = false;
    left = false;
    right = false;
    boost = false;
  });

  return {
    /** -1 for left, 1 for right, 0 for neither or both. */
    steer() {
      return (right ? 1 : 0) - (left ? 1 : 0);
    },
    /** 1 for throttle, -1 for brake/reverse, 0 for coasting. */
    throttle() {
      return (up ? 1 : 0) - (down ? 1 : 0);
    },
    boosting() {
      return boost;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
