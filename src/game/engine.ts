import {
  COLORS,
  DEFAULT_OPTIONS,
  EMPTY_INPUT,
  FIGHTER_RADIUS,
  GRID_RADIUS,
  MAX_STAMINA,
  TILE_SIZE,
} from "./types";
import type {
  Action,
  EventKind,
  Fighter,
  GameController,
  GameOptions,
  GameState,
  InputFrame,
  Phase,
  Tile,
} from "./types";
import {
  ATTACKS,
  attackIsActive,
  isAttack,
  knockbackSpeed,
  normalized,
  ROLL_COST,
  ROLL_DURATION,
  ROLL_IFRAMES,
} from "./combat";

const GRAVITY = 21;
const WALK_SPEED = 4.5;
const JUMP_SPEED = 8.2;
const FIRST_COLLAPSE = 30;
const COLLAPSE_INTERVAL = 25;
const COLLAPSE_WARNING = 5;
const HUB_RADIUS = 0.67;
const TWO_PI = Math.PI * 2;
const BOT_NAMES = ["POPPY", "LUNA", "PEACH", "SKY", "LEMON", "EMBER", "SPROUT"];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Seeded, renderer-independent simulation. All distances are in world units. */
export class GameEngine implements GameController {
  state: GameState;
  private rng = 1;
  private eventId = 1;
  private projectileId = 1;
  private attackSequence = 1;
  private previousInput: InputFrame = { ...EMPTY_INPUT };
  private resumePhase: Phase = "playing";
  private cannonTimer = 4;
  private cannonSide = 0;
  private reflectedAttacks = new Map<number, Set<number>>();
  private springCooldown = new Map<number, number>();

  constructor(options: Partial<GameOptions> = {}) {
    this.state = this.createState({ ...DEFAULT_OPTIONS, ...options });
  }

  private random(): number {
    this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0;
    return this.rng / 0x100000000;
  }

  private createState(options: GameOptions): GameState {
    this.rng = options.seed >>> 0;
    const tiles: Tile[] = [];
    for (let row = -GRID_RADIUS; row <= GRID_RADIUS; row++) {
      for (let col = -GRID_RADIUS; col <= GRID_RADIUS; col++) {
        tiles.push({
          id: tiles.length,
          col,
          row,
          x: col * TILE_SIZE,
          z: row * TILE_SIZE,
          ring: Math.max(Math.abs(col), Math.abs(row)),
          state: "solid",
          fallTime: 0,
          kind: (col === -2 && row === 0) || (col === 2 && row === 0) ? "spring" : "normal",
        });
      }
    }
    const fighters: Fighter[] = [];
    const botColors = COLORS.filter((color) => color !== options.playerColor);
    for (let id = 0; id < options.playerCount; id++) {
      const outerCount = options.playerCount > 16 ? 16 : options.playerCount;
      const outer = id < outerCount;
      const ringCount = outer ? outerCount : options.playerCount - outerCount;
      const ringIndex = outer ? id : id - outerCount;
      const angle = (ringIndex * TWO_PI) / ringCount + Math.PI / 4 + (outer ? 0 : Math.PI / 8);
      const spawnRadius = options.playerCount > 16 ? (outer ? 7.5 : 4.4) : 6.4;
      const x = Math.sin(angle) * spawnRadius;
      const z = Math.cos(angle) * spawnRadius;
      fighters.push({
        id,
        name:
          id === 0
            ? "YOU"
            : `${BOT_NAMES[(id - 1) % BOT_NAMES.length]}${id > BOT_NAMES.length ? ` ${Math.ceil(id / BOT_NAMES.length)}` : ""}`,
        color: id === 0 ? options.playerColor : botColors[(id - 1) % botColors.length],
        isPlayer: id === 0,
        x,
        y: 0,
        z,
        vx: 0,
        vy: 0,
        vz: 0,
        facing: Math.atan2(-x, -z),
        damage: 0,
        stamina: MAX_STAMINA,
        staminaDelay: 0,
        alive: true,
        grounded: true,
        action: "idle",
        actionTime: 0,
        actionDuration: 0,
        invulnerable: 0,
        attackId: 0,
        hitTargets: [],
        item: false,
        kills: 0,
        damageDealt: 0,
        reflections: 0,
        placement: 0,
        lastHitBy: null,
        lastHitTime: -100,
        aiTimer: 0.4 + this.random() * 0.8,
        aiStrafe: this.random() < 0.5 ? -1 : 1,
      });
    }
    // Give the human a readable opening in a 24-fighter crowd. Everyone keeps
    // the same combat rules; swap with one inner spawn instead of adding a slot.
    if (fighters.length > 16) {
      const player = fighters[0];
      const inner = fighters[16];
      const opening = { x: player.x, z: player.z, facing: player.facing };
      Object.assign(player, { x: inner.x, z: inner.z, facing: inner.facing });
      Object.assign(inner, opening);
    }
    return {
      phase: "lobby",
      options,
      elapsed: 0,
      countdown: 3,
      fighters,
      tiles,
      projectiles: [],
      pickups: [
        { id: 0, x: 0, y: 0.65, z: -3.6, active: true, respawn: 0 },
        { id: 1, x: 0, y: 0.65, z: 3.6, active: true, respawn: 0 },
      ],
      bumpers: [
        { id: 0, x: -3.6, z: -3.6, radius: 0.6, pulse: 0 },
        { id: 1, x: 3.6, z: 3.6, radius: 0.6, pulse: 0 },
      ],
      events: [],
      spinnerAngle: 0.3,
      spinnerSpeed: 0.72,
      spinnerRadius: 6.8,
      safeRing: GRID_RADIUS,
      nextCollapse: FIRST_COLLAPSE,
      warning: false,
      winnerId: null,
      shake: 0,
    };
  }

  reset(options: Partial<GameOptions> = {}): void {
    this.eventId = 1;
    this.projectileId = 1;
    this.attackSequence = 1;
    this.cannonTimer = 4;
    this.cannonSide = 0;
    this.previousInput = { ...EMPTY_INPUT };
    this.reflectedAttacks.clear();
    this.springCooldown.clear();
    this.state = this.createState({ ...this.state.options, ...options });
  }

  start(options: Partial<GameOptions> = {}): void {
    this.reset(options);
    this.state.phase = "countdown";
  }

  setPaused(paused: boolean): void {
    if (paused && (this.state.phase === "playing" || this.state.phase === "countdown")) {
      this.resumePhase = this.state.phase;
      this.state.phase = "paused";
      this.previousInput = { ...EMPTY_INPUT };
    } else if (!paused && this.state.phase === "paused") {
      this.state.phase = this.resumePhase;
    }
  }

  step(input: InputFrame, dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0 || this.state.phase === "paused") return;
    const safeDt = Math.min(dt, 0.1);
    const pulses: InputFrame = { ...input };
    for (const key of ["jump", "weak", "strong", "roll", "throw"] as const) {
      pulses[key] = input[key] && !this.previousInput[key];
    }
    this.previousInput = { ...input };
    const count = Math.ceil(safeDt / (1 / 60));
    for (let i = 0; i < count; i++) {
      this.tick(
        i === 0 ? pulses : { ...EMPTY_INPUT, moveX: input.moveX, moveZ: input.moveZ },
        safeDt / count,
      );
    }
  }

  private tick(input: InputFrame, dt: number): void {
    const state = this.state;
    for (const event of state.events) event.age += dt;
    state.events = state.events.filter((event) => event.age < 1.3);
    state.shake = Math.max(0, state.shake - dt * 3);
    if (state.phase === "lobby") {
      state.spinnerAngle = (state.spinnerAngle + dt * 0.2) % TWO_PI;
      return;
    }
    if (state.phase === "finished") return;
    if (state.phase === "countdown") {
      state.countdown = Math.max(0, state.countdown - dt);
      if (state.countdown <= 0) {
        state.phase = "playing";
        this.emit("start", 0, 1, 0, 0x76e7c6);
      }
      return;
    }
    state.elapsed += dt;
    this.updateArena(dt);
    state.spinnerSpeed = 0.72 + Math.min(0.55, state.elapsed * 0.0045);
    state.spinnerAngle = (state.spinnerAngle + state.spinnerSpeed * dt) % TWO_PI;
    state.spinnerRadius = Math.min(6.8, Math.max(1.0, (state.safeRing + 0.2) * TILE_SIZE));
    for (const bumper of state.bumpers) bumper.pulse = Math.max(0, bumper.pulse - dt * 2.5);
    for (const [id, seconds] of this.springCooldown)
      this.springCooldown.set(id, Math.max(0, seconds - dt));

    for (const fighter of state.fighters) {
      if (!fighter.alive) continue;
      this.updateFighter(fighter, fighter.isPlayer ? input : this.botInput(fighter, dt), dt);
    }
    this.separateFighters();
    for (const fighter of state.fighters) {
      if (!fighter.alive) continue;
      this.resolveAttack(fighter);
      this.resolveHazards(fighter);
    }
    this.updatePickups(dt);
    this.updateProjectiles(dt);
    for (const fighter of state.fighters) {
      if (fighter.alive && (fighter.y < -7 || Math.abs(fighter.x) > 30 || Math.abs(fighter.z) > 30))
        this.eliminate(fighter);
    }
    this.checkWinner();
  }

  private emit(
    kind: EventKind,
    x: number,
    y: number,
    z: number,
    color: number,
    fighterId?: number,
    amount?: number,
  ): void {
    this.state.events.push({ id: this.eventId++, kind, age: 0, x, y, z, color, fighterId, amount });
  }

  private updateArena(dt: number): void {
    const state = this.state;
    const fallenRings =
      state.elapsed < FIRST_COLLAPSE
        ? 0
        : 1 + Math.floor((state.elapsed - FIRST_COLLAPSE) / COLLAPSE_INTERVAL);
    const safeRing = Math.max(-1, GRID_RADIUS - fallenRings);
    if (safeRing < state.safeRing) {
      state.safeRing = safeRing;
      this.emit("collapse", 0, 0, 0, 0xff896b);
      state.shake = 0.5;
    }
    state.nextCollapse =
      safeRing < 0
        ? 0
        : Math.max(0, FIRST_COLLAPSE + fallenRings * COLLAPSE_INTERVAL - state.elapsed);
    state.warning = safeRing >= 0 && state.nextCollapse <= COLLAPSE_WARNING;
    for (const tile of state.tiles) {
      if (tile.ring > safeRing && (tile.state === "solid" || tile.state === "warning")) {
        tile.state = "falling";
        tile.fallTime = 0;
      }
      if (tile.state === "falling") {
        tile.fallTime += dt;
        if (tile.fallTime > 1.4) tile.state = "gone";
      } else if (tile.state !== "gone") {
        tile.state = state.warning && tile.ring === safeRing ? "warning" : "solid";
      }
    }
  }

  /** Exact tile support also handles holes and staged collapse, not just bounds. */
  tileAt(x: number, z: number): Tile | undefined {
    const col = Math.floor(x / TILE_SIZE + 0.5);
    const row = Math.floor(z / TILE_SIZE + 0.5);
    if (Math.abs(col) > GRID_RADIUS || Math.abs(row) > GRID_RADIUS) return undefined;
    const tile = this.state.tiles[(row + GRID_RADIUS) * (GRID_RADIUS * 2 + 1) + col + GRID_RADIUS];
    return tile && (tile.state === "solid" || tile.state === "warning") ? tile : undefined;
  }

  private beginAction(fighter: Fighter, action: Action, duration: number): void {
    fighter.action = action;
    fighter.actionTime = 0;
    fighter.actionDuration = duration;
    fighter.hitTargets = [];
    fighter.attackId = this.attackSequence++;
  }

  private updateFighter(fighter: Fighter, input: InputFrame, dt: number): void {
    fighter.invulnerable = Math.max(0, fighter.invulnerable - dt);
    fighter.staminaDelay = Math.max(0, fighter.staminaDelay - dt);
    if (fighter.action !== "idle") {
      fighter.actionTime += dt;
      if (fighter.actionTime >= fighter.actionDuration) {
        fighter.action = "idle";
        fighter.actionTime = 0;
        fighter.actionDuration = 0;
      }
    }
    if (fighter.staminaDelay === 0 && fighter.action !== "roll" && fighter.action !== "strong") {
      fighter.stamina = Math.min(MAX_STAMINA, fighter.stamina + dt * 24);
    }
    let moveX = input.moveX;
    let moveZ = input.moveZ;
    const movementLength = Math.hypot(moveX, moveZ);
    if (movementLength > 1) {
      moveX /= movementLength;
      moveZ /= movementLength;
    }
    if (movementLength > 0.12 && (fighter.action === "idle" || fighter.action === "weak"))
      fighter.facing = Math.atan2(moveX, moveZ);
    if (fighter.action === "idle") {
      if (input.roll && fighter.grounded && fighter.stamina >= ROLL_COST) {
        fighter.stamina -= ROLL_COST;
        fighter.staminaDelay = 0.85;
        fighter.invulnerable = ROLL_IFRAMES;
        this.beginAction(fighter, "roll", ROLL_DURATION);
        fighter.vx = Math.sin(fighter.facing) * 9.7;
        fighter.vz = Math.cos(fighter.facing) * 9.7;
        this.emit("roll", fighter.x, fighter.y + 0.2, fighter.z, fighter.color, fighter.id);
      } else if (input.jump && fighter.grounded) {
        fighter.vy = JUMP_SPEED;
        fighter.grounded = false;
        this.emit("jump", fighter.x, fighter.y, fighter.z, fighter.color, fighter.id);
      } else if ((input.strong || input.weak) && fighter.y > -0.1) {
        const action = fighter.grounded ? (input.strong ? "strong" : "weak") : "air";
        const spec = ATTACKS[action];
        if (fighter.stamina >= spec.cost) {
          fighter.stamina -= spec.cost;
          fighter.staminaDelay = spec.cost > 0 ? 0.75 : Math.max(fighter.staminaDelay, 0.16);
          this.beginAction(fighter, action, spec.duration);
          if (action === "strong")
            this.emit("strong", fighter.x, fighter.y + 0.6, fighter.z, fighter.color, fighter.id);
        }
      } else if (input.throw && fighter.item && fighter.y > -0.1) {
        fighter.item = false;
        this.spawnProjectile(
          fighter.x,
          fighter.y + 0.65,
          fighter.z,
          Math.sin(fighter.facing),
          Math.cos(fighter.facing),
          fighter.id,
        );
        this.beginAction(fighter, "weak", 0.28);
        // Throwing has recovery but is not a second invisible melee attack.
        fighter.hitTargets = this.state.fighters.map((target) => target.id);
        this.emit("throw", fighter.x, fighter.y + 0.65, fighter.z, fighter.color, fighter.id);
      }
    }

    const action = fighter.action;
    if (action === "roll") {
      if (fighter.actionTime > 0.27) {
        fighter.vx *= Math.exp(-dt * 17);
        fighter.vz *= Math.exp(-dt * 17);
      }
    } else if (action === "hurt") {
      fighter.vx += moveX * dt * 3;
      fighter.vz += moveZ * dt * 3;
      fighter.vx *= Math.exp(-dt * (fighter.grounded ? 5 : 1.1));
      fighter.vz *= Math.exp(-dt * (fighter.grounded ? 5 : 1.1));
    } else if (fighter.grounded) {
      const slow = action === "strong" ? 0.24 : action === "weak" ? 0.62 : 1;
      const response = 1 - Math.exp(-dt * 15);
      fighter.vx += (moveX * WALK_SPEED * slow - fighter.vx) * response;
      fighter.vz += (moveZ * WALK_SPEED * slow - fighter.vz) * response;
    } else {
      const steering = 1 - Math.exp(-dt * 1.2);
      fighter.vx += (moveX * WALK_SPEED - fighter.vx) * steering;
      fighter.vz += (moveZ * WALK_SPEED - fighter.vz) * steering;
    }
    fighter.x += fighter.vx * dt;
    fighter.z += fighter.vz * dt;
    const previousY = fighter.y;
    if (!fighter.grounded) {
      fighter.vy -= GRAVITY * dt;
      fighter.y += fighter.vy * dt;
    }
    const support = this.tileAt(fighter.x, fighter.z);
    if (fighter.grounded && !support) {
      fighter.grounded = false;
      fighter.vy = Math.min(0, fighter.vy);
    }
    if (!fighter.grounded && previousY >= 0 && fighter.y <= 0 && fighter.vy <= 0 && support) {
      fighter.y = 0;
      fighter.vy = 0;
      fighter.grounded = true;
    }
    if (fighter.y > -0.1 && fighter.y < 1.05) {
      const distance = Math.hypot(fighter.x, fighter.z);
      const minimum = HUB_RADIUS + FIGHTER_RADIUS;
      if (distance < minimum && distance > 0.001) {
        const direction = normalized(fighter.x, fighter.z);
        fighter.x = direction.x * minimum;
        fighter.z = direction.z * minimum;
        const inwardVelocity = fighter.vx * direction.x + fighter.vz * direction.z;
        if (inwardVelocity < 0) {
          fighter.vx -= inwardVelocity * direction.x;
          fighter.vz -= inwardVelocity * direction.z;
        }
      }
    }
    if (
      support?.kind === "spring" &&
      fighter.grounded &&
      (this.springCooldown.get(fighter.id) ?? 0) <= 0
    ) {
      const distanceToPad = Math.hypot(fighter.x - support.x, fighter.z - support.z);
      if (distanceToPad < 0.52) {
        fighter.vy = 10.8;
        fighter.grounded = false;
        this.springCooldown.set(fighter.id, 0.8);
        this.emit("bounce", fighter.x, 0.15, fighter.z, 0xb89aff, fighter.id);
      }
    }
  }

  private separateFighters(): void {
    const fighters = this.state.fighters;
    for (let i = 0; i < fighters.length; i++) {
      const a = fighters[i];
      if (!a.alive || a.y < -0.1 || a.action === "roll") continue;
      for (let j = i + 1; j < fighters.length; j++) {
        const b = fighters[j];
        if (!b.alive || b.y < -0.1 || b.action === "roll" || Math.abs(a.y - b.y) > 0.8) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const distance = Math.hypot(dx, dz);
        if (distance < FIGHTER_RADIUS * 1.8) {
          const direction = normalized(distance > 0.001 ? dx : 1, dz);
          const overlap = (FIGHTER_RADIUS * 1.8 - distance) * 0.5;
          a.x -= direction.x * overlap;
          a.z -= direction.z * overlap;
          b.x += direction.x * overlap;
          b.z += direction.z * overlap;
        }
      }
    }
  }

  private resolveAttack(attacker: Fighter): void {
    if (!attackIsActive(attacker) || !isAttack(attacker.action)) return;
    const spec = ATTACKS[attacker.action];
    for (const target of this.state.fighters) {
      if (
        !target.alive ||
        target.id === attacker.id ||
        target.invulnerable > 0 ||
        target.y < -0.15 ||
        attacker.hitTargets.includes(target.id)
      )
        continue;
      const dx = target.x - attacker.x;
      const dz = target.z - attacker.z;
      const distance = Math.hypot(dx, dz);
      if (distance > spec.radius + FIGHTER_RADIUS * 0.3 || Math.abs(target.y - attacker.y) > 1.1)
        continue;
      const direction = normalized(dx, dz);
      const dot = direction.x * Math.sin(attacker.facing) + direction.z * Math.cos(attacker.facing);
      if (dot < spec.cone) continue;
      attacker.hitTargets.push(target.id);
      this.hit(target, spec.damage, spec.power, direction.x, direction.z, attacker.id);
    }
  }

  private hit(
    target: Fighter,
    damage: number,
    power: number,
    dx: number,
    dz: number,
    source: number | null,
  ): boolean {
    if (!target.alive || target.invulnerable > 0 || target.y < -0.2) return false;
    const direction = normalized(dx, dz);
    target.damage = Math.min(999, target.damage + damage);
    const speed = knockbackSpeed(power, target.damage);
    target.vx = direction.x * speed;
    target.vz = direction.z * speed;
    target.vy = Math.max(target.vy, 4.1 + Math.min(4.8, speed * 0.16));
    target.y = Math.max(0.03, target.y);
    target.grounded = false;
    target.invulnerable = 0.46;
    target.lastHitBy = source;
    target.lastHitTime = this.state.elapsed;
    this.beginAction(target, "hurt", 0.23 + Math.min(0.16, target.damage / 700));
    if (source !== null) {
      const attacker = this.state.fighters.find((fighter) => fighter.id === source);
      if (attacker) attacker.damageDealt += damage;
    }
    this.state.shake = Math.max(this.state.shake, target.isPlayer ? 0.38 : 0.12);
    this.emit("hit", target.x, target.y + 0.65, target.z, target.color, target.id, damage);
    return true;
  }

  private resolveHazards(fighter: Fighter): void {
    if (fighter.y < -0.15 || fighter.y > 1.0) return;
    const state = this.state;
    const along =
      fighter.x * Math.cos(state.spinnerAngle) - fighter.z * Math.sin(state.spinnerAngle);
    const across =
      fighter.x * Math.sin(state.spinnerAngle) + fighter.z * Math.cos(state.spinnerAngle);
    if (
      fighter.y < 0.72 &&
      Math.abs(along) < state.spinnerRadius + 0.15 &&
      Math.abs(along) > HUB_RADIUS &&
      Math.abs(across) < 0.58
    ) {
      const side = along >= 0 ? 1 : -1;
      this.hit(
        fighter,
        7,
        3.9,
        -Math.sin(state.spinnerAngle) * side,
        -Math.cos(state.spinnerAngle) * side,
        null,
      );
    }
    for (const bumper of state.bumpers) {
      if (!this.tileAt(bumper.x, bumper.z)) continue;
      const distance = Math.hypot(fighter.x - bumper.x, fighter.z - bumper.z);
      if (distance < bumper.radius + FIGHTER_RADIUS) {
        const direction = normalized(fighter.x - bumper.x, fighter.z - bumper.z);
        fighter.x = bumper.x + direction.x * (bumper.radius + FIGHTER_RADIUS + 0.01);
        fighter.z = bumper.z + direction.z * (bumper.radius + FIGHTER_RADIUS + 0.01);
        if (this.hit(fighter, 5, 4.4, direction.x, direction.z, null)) {
          bumper.pulse = 1;
          this.emit("bounce", bumper.x, 0.6, bumper.z, 0xffb957, fighter.id);
        }
      }
    }
  }

  private updatePickups(dt: number): void {
    for (const pickup of this.state.pickups) {
      if (!this.tileAt(pickup.x, pickup.z)) {
        pickup.active = false;
        continue;
      }
      if (!pickup.active) {
        pickup.respawn = Math.max(0, pickup.respawn - dt);
        if (pickup.respawn === 0) pickup.active = true;
      }
      if (!pickup.active) continue;
      for (const fighter of this.state.fighters) {
        if (
          fighter.alive &&
          !fighter.item &&
          Math.abs(fighter.y) < 1.2 &&
          Math.hypot(fighter.x - pickup.x, fighter.z - pickup.z) < 0.8
        ) {
          fighter.item = true;
          pickup.active = false;
          pickup.respawn = 10;
          this.emit("pickup", fighter.x, fighter.y + 0.8, fighter.z, 0xffe276, fighter.id);
          break;
        }
      }
    }
  }

  private spawnProjectile(
    x: number,
    y: number,
    z: number,
    dx: number,
    dz: number,
    ownerId: number | null,
  ): void {
    const direction = normalized(dx, dz);
    const owner = this.state.fighters.find((fighter) => fighter.id === ownerId);
    const offset = ownerId !== null ? 0.95 : 0;
    const speed = ownerId !== null ? 8 : 5.8;
    this.state.projectiles.push({
      id: this.projectileId++,
      x: x + direction.x * offset,
      y,
      z: z + direction.z * offset,
      vx: direction.x * speed,
      vy: 0,
      vz: direction.z * speed,
      ownerId,
      color: owner?.color ?? 0xffd56b,
      radius: 0.24,
      ttl: 6,
      reflections: 0,
      immunity: 0.15,
    });
  }

  private updateProjectiles(dt: number): void {
    const state = this.state;
    this.cannonTimer -= dt;
    if (this.cannonTimer <= 0 && state.safeRing >= 1) {
      this.cannonTimer = Math.max(2.5, 5.8 - state.elapsed * 0.015);
      const side = this.cannonSide++ % 4;
      const edge = (state.safeRing + 0.8) * TILE_SIZE;
      const target = state.fighters.filter((fighter) => fighter.alive && fighter.y >= -0.1);
      if (target.length) {
        const picked = target[Math.floor(this.random() * target.length)];
        const x = side === 0 ? edge : side === 2 ? -edge : (this.random() - 0.5) * edge;
        const z = side === 1 ? edge : side === 3 ? -edge : (this.random() - 0.5) * edge;
        this.spawnProjectile(x, 0.65, z, picked.x - x, picked.z - z, null);
      }
    }
    for (const projectile of state.projectiles) {
      projectile.ttl -= dt;
      projectile.immunity = Math.max(0, projectile.immunity - dt);
      projectile.x += projectile.vx * dt;
      projectile.z += projectile.vz * dt;
      projectile.y += projectile.vy * dt;
      let reflectedThisTick = false;
      for (const fighter of state.fighters) {
        if (!fighter.alive || fighter.y < -0.1 || Math.abs(projectile.y - (fighter.y + 0.65)) > 0.9)
          continue;
        const distance = Math.hypot(projectile.x - fighter.x, projectile.z - fighter.z);
        // A spin changes ownership before body collision. The same spin cannot bat its own ball repeatedly.
        if (
          fighter.action === "strong" &&
          attackIsActive(fighter) &&
          distance < ATTACKS.strong.radius + projectile.radius &&
          !this.reflectedAttacks.get(projectile.id)?.has(fighter.attackId) &&
          (projectile.ownerId !== fighter.id || projectile.immunity === 0)
        ) {
          const incoming = normalized(-projectile.vx, -projectile.vz);
          const nearestEnemy = state.fighters
            .filter((target) => target.alive && target.id !== fighter.id && target.y > -0.1)
            .sort(
              (a, b) =>
                Math.hypot(a.x - fighter.x, a.z - fighter.z) -
                Math.hypot(b.x - fighter.x, b.z - fighter.z),
            )[0];
          const aim =
            nearestEnemy && Math.hypot(nearestEnemy.x - fighter.x, nearestEnemy.z - fighter.z) < 7
              ? normalized(nearestEnemy.x - fighter.x, nearestEnemy.z - fighter.z)
              : incoming;
          const speed = Math.min(17, Math.hypot(projectile.vx, projectile.vz) * 1.2 + 1);
          projectile.vx = aim.x * speed;
          projectile.vz = aim.z * speed;
          projectile.ownerId = fighter.id;
          projectile.color = fighter.color;
          projectile.reflections++;
          projectile.immunity = 0.22;
          projectile.ttl = 5;
          projectile.x = fighter.x + aim.x * (ATTACKS.strong.radius + 0.3);
          projectile.z = fighter.z + aim.z * (ATTACKS.strong.radius + 0.3);
          const reflectionHistory = this.reflectedAttacks.get(projectile.id) ?? new Set<number>();
          reflectionHistory.add(fighter.attackId);
          this.reflectedAttacks.set(projectile.id, reflectionHistory);
          fighter.reflections++;
          this.emit(
            "reflect",
            fighter.x + aim.x,
            fighter.y + 0.75,
            fighter.z + aim.z,
            fighter.color,
            fighter.id,
          );
          state.shake = 0.18;
          reflectedThisTick = true;
          break;
        }
      }
      if (reflectedThisTick) continue;
      for (const fighter of state.fighters) {
        if (!fighter.alive || fighter.id === projectile.ownerId || fighter.y < -0.1) continue;
        if (
          Math.hypot(projectile.x - fighter.x, projectile.z - fighter.z) <
            FIGHTER_RADIUS + projectile.radius &&
          Math.abs(projectile.y - (fighter.y + 0.65)) < 0.7
        ) {
          if (
            this.hit(
              fighter,
              12 + Math.min(12, projectile.reflections * 3),
              5.5 + Math.min(3, projectile.reflections),
              projectile.vx,
              projectile.vz,
              projectile.ownerId,
            )
          ) {
            projectile.ttl = 0;
            break;
          }
        }
      }
    }
    state.projectiles = state.projectiles.filter((projectile) => {
      const alive =
        projectile.ttl > 0 && Math.abs(projectile.x) < 23 && Math.abs(projectile.z) < 23;
      if (!alive) this.reflectedAttacks.delete(projectile.id);
      return alive;
    });
  }

  private eliminate(fighter: Fighter): void {
    fighter.alive = false;
    fighter.placement = this.state.fighters.filter((other) => other.alive).length + 1;
    fighter.item = false;
    if (fighter.lastHitBy !== null && this.state.elapsed - fighter.lastHitTime < 8) {
      const attacker = this.state.fighters.find((other) => other.id === fighter.lastHitBy);
      if (attacker) attacker.kills++;
    }
    this.emit(
      "eliminate",
      fighter.x,
      Math.max(-1, fighter.y),
      fighter.z,
      fighter.color,
      fighter.id,
    );
    this.state.shake = fighter.isPlayer ? 0.55 : 0.2;
  }

  private checkWinner(): void {
    const survivors = this.state.fighters.filter((fighter) => fighter.alive);
    if (survivors.length > 1) return;
    this.state.phase = "finished";
    this.state.winnerId = survivors[0]?.id ?? null;
    if (survivors[0]) survivors[0].placement = 1;
    this.emit(
      "finish",
      survivors[0]?.x ?? 0,
      1,
      survivors[0]?.z ?? 0,
      survivors[0]?.color ?? 0xffffff,
      survivors[0]?.id,
    );
  }

  private botInput(fighter: Fighter, dt: number): InputFrame {
    const input: InputFrame = { ...EMPTY_INPUT };
    fighter.aiTimer -= dt;
    if (fighter.y < -0.1) {
      const direction = normalized(-fighter.x, -fighter.z);
      input.moveX = direction.x;
      input.moveZ = direction.z;
      return input;
    }
    const state = this.state;
    const difficulty = state.options.difficulty;
    let target: Fighter | undefined;
    let closestSquared = Infinity;
    for (const candidate of state.fighters) {
      if (!candidate.alive || candidate.id === fighter.id || candidate.y < -0.1) continue;
      const distanceSquared = (candidate.x - fighter.x) ** 2 + (candidate.z - fighter.z) ** 2;
      if (distanceSquared < closestSquared) {
        target = candidate;
        closestSquared = distanceSquared;
      }
    }
    if (!target) return input;
    const nextRing = state.warning ? Math.max(0, state.safeRing - 1) : state.safeRing;
    const safeEdge = Math.max(0.7, (nextRing + 0.5) * TILE_SIZE - 2.0);
    let dx = target.x - fighter.x;
    let dz = target.z - fighter.z;
    const distance = Math.hypot(dx, dz);
    const atEdge = Math.abs(fighter.x) > safeEdge || Math.abs(fighter.z) > safeEdge;
    if (atEdge) {
      dx = clamp(fighter.x, -safeEdge * 0.8, safeEdge * 0.8) - fighter.x;
      dz = clamp(fighter.z, -safeEdge * 0.8, safeEdge * 0.8) - fighter.z;
    } else if (fighter.stamina < 28 && distance < 3) {
      const away = normalized(-dx, -dz);
      dx = away.x + fighter.aiStrafe * away.z * 0.5;
      dz = away.z - fighter.aiStrafe * away.x * 0.5;
    } else if (distance < 1.3) {
      const toTarget = normalized(dx, dz);
      dx = toTarget.z * fighter.aiStrafe * 0.55;
      dz = -toTarget.x * fighter.aiStrafe * 0.55;
    }
    const move = normalized(dx, dz);
    input.moveX = move.x * (difficulty === "easy" ? 0.77 : 0.93);
    input.moveZ = move.z * (difficulty === "easy" ? 0.77 : 0.93);
    // Do not run through the hub: choose a consistent tangent around it.
    const radius = Math.hypot(fighter.x, fighter.z);
    if (radius < 2 && fighter.x * input.moveX + fighter.z * input.moveZ < 0) {
      const radial = normalized(fighter.x, fighter.z);
      input.moveX = radial.z * fighter.aiStrafe;
      input.moveZ = -radial.x * fighter.aiStrafe;
    }
    for (const bumper of state.bumpers) {
      if (!this.tileAt(bumper.x, bumper.z)) continue;
      const bx = fighter.x - bumper.x;
      const bz = fighter.z - bumper.z;
      const bd = Math.hypot(bx, bz);
      if (bd < 1.65 && bd > 0) {
        input.moveX += (bx / bd) * (1.65 - bd) * 2;
        input.moveZ += (bz / bd) * (1.65 - bd) * 2;
      }
    }
    const anticipatedX = fighter.x + input.moveX * 0.65;
    const anticipatedZ = fighter.z + input.moveZ * 0.65;
    if (
      !this.tileAt(anticipatedX, anticipatedZ) ||
      Math.abs(anticipatedX) > safeEdge + 0.2 ||
      Math.abs(anticipatedZ) > safeEdge + 0.2
    ) {
      const inward = normalized(-fighter.x, -fighter.z);
      input.moveX = inward.x;
      input.moveZ = inward.z;
    }
    if (fighter.action !== "idle") return input;
    // Read the future bar position to jump before contact. Each difficulty has deliberate mistakes.
    const lead = difficulty === "hard" ? 0.24 : difficulty === "easy" ? 0.11 : 0.19;
    const futureAngle = state.spinnerAngle + state.spinnerSpeed * lead;
    const across = fighter.x * Math.sin(futureAngle) + fighter.z * Math.cos(futureAngle);
    const along = fighter.x * Math.cos(futureAngle) - fighter.z * Math.sin(futureAngle);
    if (
      fighter.grounded &&
      Math.abs(across) < 0.88 &&
      Math.abs(along) < state.spinnerRadius + 0.2 &&
      Math.abs(along) > HUB_RADIUS &&
      fighter.aiTimer < 0.1
    ) {
      input.jump = true;
      fighter.aiTimer = difficulty === "easy" ? 0.8 : 0.38;
      return input;
    }
    if (fighter.aiTimer > 0 || atEdge) return input;
    fighter.aiTimer =
      (difficulty === "hard" ? 0.16 : difficulty === "easy" ? 0.56 : 0.3) + this.random() * 0.28;
    if (this.random() < 0.13) fighter.aiStrafe *= -1;
    const projectile = state.projectiles.find(
      (ball) =>
        ball.ownerId !== fighter.id && Math.hypot(ball.x - fighter.x, ball.z - fighter.z) < 3.1,
    );
    const targetAttacking = isAttack(target.action) && target.actionTime < 0.3;
    if (projectile && fighter.grounded && fighter.stamina >= 25 && difficulty !== "easy") {
      input.strong = true;
    } else if (
      targetAttacking &&
      distance < 2.3 &&
      fighter.grounded &&
      fighter.stamina >= ROLL_COST + 10 &&
      this.random() < 0.5
    ) {
      input.roll = true;
    } else if (fighter.item && distance > 2.6 && distance < 8) {
      fighter.facing = Math.atan2(target.x - fighter.x, target.z - fighter.z);
      input.moveX = 0;
      input.moveZ = 0;
      input.throw = true;
    } else if (distance < 2.1) {
      fighter.facing = Math.atan2(target.x - fighter.x, target.z - fighter.z);
      input.moveX = 0;
      input.moveZ = 0;
      if (fighter.stamina >= 32 && (distance > 1.35 || this.random() < 0.5)) input.strong = true;
      else if (distance < 1.6) input.weak = true;
    } else if (!atEdge && fighter.grounded && distance < 3.5 && this.random() < 0.1) {
      input.jump = true;
    }
    return input;
  }
}
