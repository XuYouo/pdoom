export const TUNING = {
  stepMs: 1000 / 60, runSpeed: 190, acceleration: 2400, friction: 2800,
  riseGravity: 1180, fallGravity: 1560, jumpSpeed: 440, terminalSpeed: 620,
  coyoteMs: 110, jumpBufferMs: 130, dashSpeed: 490, dashMs: 140, dashCooldownMs: 950,
  fireIntervalMs: 185, bulletSpeed: 510, rewindWindowMs: 2000, rewindDurationMs: 600,
  rewindCooldownMs: 6500, immunityMs: 10000, insightDurationMs: 4000, insightCooldownMs: 8500,
  maxBullets: 180, bossHp: 360,
} as const;
