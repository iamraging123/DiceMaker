/**
 * animator.js
 * -----------
 * Lightweight kinematic rolling animation for a dice Group.
 *
 * No physics engine — we pick a random face to "land" on, then tween the
 * quaternion to the orientation that places that face's normal up (+Y),
 * while adding random tumbles along the way for visual flair.
 */

import * as THREE from 'three';

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Roll the die. Returns a Promise that resolves with the chosen face index
 * (and its label) once the animation completes.
 *
 * @param {THREE.Group} group  - dice group (userData.faces must exist)
 * @param {number} duration    - animation duration in ms
 */
export function rollDice(group, duration = 1600) {
  if (!group || !group.userData || !group.userData.faces) {
    return Promise.resolve(null);
  }

  const faces = group.userData.faces;
  const labeledFaces = faces.filter((f) => f.label);
  const pool = labeledFaces.length ? labeledFaces : faces;
  const chosen = pool[Math.floor(Math.random() * pool.length)];

  // Compute target orientation: rotate so chosen face's normal points up (+Y),
  // plus a random spin about the vertical axis.
  const worldUp = new THREE.Vector3(0, 1, 0);
  const targetQ = new THREE.Quaternion().setFromUnitVectors(
    chosen.normal.clone().normalize(),
    worldUp
  );
  const spin = new THREE.Quaternion().setFromAxisAngle(worldUp, Math.random() * Math.PI * 2);
  targetQ.premultiply(spin);

  const startQ = group.quaternion.clone();

  // Random tumble axis for mid-flight spinning
  const tumbleAxis = new THREE.Vector3(
    Math.random() - 0.5,
    Math.random() - 0.5,
    Math.random() - 0.5
  ).normalize();
  const tumbleTurns = 2 + Math.random() * 2; // 2..4 full rotations
  const tumbleQ = new THREE.Quaternion();

  const startY = group.position.y;
  const peakY = startY + 0.8;

  return new Promise((resolve) => {
    const t0 = performance.now();
    const step = () => {
      const elapsed = performance.now() - t0;
      const t = Math.min(elapsed / duration, 1);
      const e = easeOutCubic(t);

      // Interpolate toward the target final quaternion,
      // then overlay a decaying tumble around a random axis.
      const q = startQ.clone().slerp(targetQ, e);
      const tumbleAngle = tumbleTurns * Math.PI * 2 * (1 - e);
      tumbleQ.setFromAxisAngle(tumbleAxis, tumbleAngle);
      q.multiply(tumbleQ);
      group.quaternion.copy(q);

      // Gentle arc bounce
      const bounce = Math.sin(t * Math.PI) * (peakY - startY);
      group.position.y = startY + bounce;

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        group.quaternion.copy(targetQ);
        group.position.y = startY;
        resolve({
          faceIndex: chosen.faceIndex,
          label: chosen.label,
        });
      }
    };
    requestAnimationFrame(step);
  });
}
