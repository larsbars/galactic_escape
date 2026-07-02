// Translates raw keyboard/touch/mouse events into an abstract input state.
// Game logic reads only this state, never DOM events, so new input methods
// (gamepad, tilt, on-screen buttons) can be added without touching the game.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;

    // Abstract state consumed by the game.
    this.moveAxis = 0;        // -1 (left) .. 1 (right), keyboard only
    this.pointerX = null;     // desired ship x in CSS pixels, touch/mouse only
    this.pointerActive = false;
    this.primaryPressed = false; // one-shot "confirm/start" press
    this.fireHeld = false;    // Space held down
    this.fireTaps = 0;        // discrete taps/clicks since last consume

    this.keys = new Set();
    this.moveTouchId = null;  // which finger controls movement

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code === 'Enter') this.primaryPressed = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    const pointerDown = (x) => {
      this.pointerActive = true;
      this.pointerX = x;
      this.primaryPressed = true;
      this.fireTaps += 1;
    };
    const pointerMove = (x) => {
      if (this.pointerActive) this.pointerX = x;
    };
    const pointerUp = () => {
      this.pointerActive = false;
      this.pointerX = null;
      this.moveTouchId = null;
    };

    // First finger steers the ship (and fires once); any extra finger
    // is a fire tap, so you can shoot while dragging.
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (this.moveTouchId === null) {
          this.moveTouchId = t.identifier;
          pointerDown(t.clientX);
        } else {
          this.fireTaps += 1;
          this.primaryPressed = true;
        }
      }
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === this.moveTouchId) pointerMove(t.clientX);
      }
    }, { passive: false });
    const touchEnd = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === this.moveTouchId) pointerUp();
      }
    };
    canvas.addEventListener('touchend', touchEnd, { passive: false });
    canvas.addEventListener('touchcancel', touchEnd, { passive: false });

    canvas.addEventListener('mousedown', (e) => pointerDown(e.clientX));
    canvas.addEventListener('mousemove', (e) => pointerMove(e.clientX));
    window.addEventListener('mouseup', pointerUp);
  }

  update() {
    const left = this.keys.has('ArrowLeft') || this.keys.has('KeyA');
    const right = this.keys.has('ArrowRight') || this.keys.has('KeyD');
    this.moveAxis = (right ? 1 : 0) - (left ? 1 : 0);
    this.fireHeld = this.keys.has('Space');
  }

  // Returns true once per press, then resets.
  consumePrimary() {
    const pressed = this.primaryPressed;
    this.primaryPressed = false;
    return pressed;
  }

  // Returns true if any taps/clicks happened since last call, then resets.
  consumeFireTap() {
    const tapped = this.fireTaps > 0;
    this.fireTaps = 0;
    return tapped;
  }
}
