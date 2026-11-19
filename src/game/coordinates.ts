/** Fixed camera yaw: screen up has negative screenY. */
export function screenToWorldMovement(screenX: number, screenY: number): { x: number; z: number } {
  return { x: screenX * 0.8 + screenY * 0.6, z: -screenX * 0.6 + screenY * 0.8 };
}
