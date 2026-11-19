import {
  COLORS,
  DEFAULT_OPTIONS,
  EMPTY_INPUT,
  FIGHTER_RADIUS,
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
  SeriesState,
  Tile,
} from "./types";
import { createStagePlan } from "./stages";
import { appearanceForFighter } from "./appearance";
import { safeZoneNavigationTarget, updateSafeZone } from "./safe-zone";
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
  private tilesById = new Map<number, Tile>();
  private meteorTimer = Infinity;
  private meteorId = 1;
  private topologyVersion = 0;
  private navigation = new Map<
    number,
    { start: number; goal: number; version: number; expires: number; next: number; jump: boolean }
  >();

  constructor(options: Partial<GameOptions> = {}) {
    this.state = this.createState({ ...DEFAULT_OPTIONS, ...options });
  }

  private random(): number {
    this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0;
    return this.rng / 0x100000000;
  }

  private createState(options: GameOptions, series?: SeriesState): GameState {
    const round = series?.round ?? 1;
    this.rng = (options.seed ^ Math.imul(round, 0x45d9f3b)) >>> 0;
    const plan = createStagePlan(options, round);
    this.tilesById = new Map(plan.tiles.map((tile) => [tile.id, tile]));
    this.meteorTimer = plan.stage.meteor?.interval ?? Infinity;
    this.cannonTimer = Math.min(4, plan.stage.projectileInterval);
    const fighters: Fighter[] = [];
    const botColors = COLORS.filter((color) => color !== options.playerColor);
    for (let id = 0; id < options.playerCount; id++) {
      const spawn = plan.spawns[id]!;
      const x = spawn.x;
      const z = spawn.z;
      fighters.push({
        id,
        name:
          id === 0
            ? "YOU"
            : `${BOT_NAMES[(id - 1) % BOT_NAMES.length]}${id > BOT_NAMES.length ? ` ${Math.ceil(id / BOT_NAMES.length)}` : ""}`,
        color: id === 0 ? options.playerColor : botColors[(id - 1) % botColors.length],
        appearance: appearanceForFighter(id, options),
        outsideZoneTime: 0,
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
    const firstBar = plan.spinners[0];
    return {
      phase: "lobby",
      options,
      series: series ?? {
        round: 1,
        targetWins: options.mode === "first-to-three" ? 3 : 1,
        wins: Array.from({ length: options.playerCount }, () => 0),
        championId: null,
        history: [],
      },
      stage: plan.stage,
      safeZone: plan.safeZone,
      elapsed: 0,
      countdown: 3,
      fighters,
      tiles: plan.tiles,
      projectiles: [],
      pickups: plan.pickups,
      bumpers: plan.bumpers,
      spinners: plan.spinners,
      hammers: plan.hammers,
      meteors: [],
      events: [],
      spinnerAngle: firstBar?.angle ?? 0,
      spinnerSpeed: firstBar?.speed ?? 0,
      spinnerRadius: firstBar?.radius ?? 0,
      safeRing: plan.stage.gridRadius,
      nextCollapse: plan.stage.firstCollapse,
      warning: false,
      winnerId: null,
      shake: 0,
    };
  }

  private clearRoundCaches(): void {
    this.previousInput = { ...EMPTY_INPUT };
    this.cannonSide = 0;
    this.reflectedAttacks.clear();
    this.springCooldown.clear();
    this.navigation.clear();
    this.topologyVersion++;
  }

  reset(options: Partial<GameOptions> = {}): void {
    this.eventId = 1;
    this.projectileId = 1;
    this.meteorId = 1;
    this.attackSequence = 1;
    this.clearRoundCaches();
    this.state = this.createState({ ...this.state.options, ...options });
  }

  nextRound(): void {
    const previous = this.state;
    if (
      previous.phase !== "finished" ||
      previous.options.mode !== "first-to-three" ||
      previous.series.championId !== null
    )
      return;
    const series: SeriesState = {
      ...previous.series,
      round: previous.series.round + 1,
      wins: [...previous.series.wins],
      history: [...previous.series.history],
    };
    this.clearRoundCaches();
    this.state = this.createState(previous.options, series);
    this.state.phase = "countdown";
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
      // Lobby is a static, readable preview; no hazard clocks advance.
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
    this.updateStageHazards(dt);
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
    this.updateMeteors(dt);
    const outside = new Set(updateSafeZone(state, dt));
    for (const fighter of state.fighters) {
      if (
        fighter.alive &&
        (fighter.y < -7 ||
          Math.abs(fighter.x) > 35 ||
          Math.abs(fighter.z) > 35 ||
          outside.has(fighter.id))
      )
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
    const { firstCollapse, collapseInterval, collapseWarning } = state.stage;
    if (state.stage.groundMode === "safe-zone") {
      state.safeRing = state.stage.gridRadius;
      state.warning = false;
      state.nextCollapse = 0;
      return;
    }
    const fallenRings =
      state.elapsed < firstCollapse
        ? 0
        : 1 + Math.floor((state.elapsed - firstCollapse) / collapseInterval);
    const safeRing = Math.max(-1, state.stage.gridRadius - fallenRings);
    if (safeRing < state.safeRing) {
      state.safeRing = safeRing;
      this.topologyVersion++;
      this.emit("collapse", 0, 0, 0, 0xff896b);
      state.shake = 0.5;
    }
    state.nextCollapse =
      safeRing < 0
        ? 0
        : Math.max(0, firstCollapse + fallenRings * collapseInterval - state.elapsed);
    state.warning = safeRing >= 0 && state.nextCollapse <= collapseWarning;
    for (const tile of state.tiles) {
      if (tile.ring > safeRing && (tile.state === "solid" || tile.state === "warning")) {
        tile.state = "falling";
        tile.fallTime = 0;
      }
      if (tile.state === "falling") {
        tile.fallTime += dt;
        if (tile.fallTime > 1.4) tile.state = "gone";
      } else if (tile.state !== "gone") {
        const nextState = state.warning && tile.ring === safeRing ? "warning" : "solid";
        if (tile.state !== nextState) this.topologyVersion++;
        tile.state = nextState;
      }
      if (tile.trap && tile.state !== "gone" && tile.state !== "falling") {
        const trap = tile.trap;
        const previous = trap.phase;
        const start = 8 + (trap.group * state.stage.trapCycle) / 3;
        const elapsed = state.elapsed - start;
        const phaseTime =
          ((elapsed % state.stage.trapCycle) + state.stage.trapCycle) % state.stage.trapCycle;
        const warn = state.stage.trapWarningDuration;
        const open = state.stage.trapOpenDuration;
        if (elapsed < 0) {
          trap.phase = "closed";
          trap.remaining = -elapsed;
          trap.openness = 0;
        } else if (phaseTime < warn) {
          trap.phase = "warning";
          trap.remaining = warn - phaseTime;
          trap.openness = 0;
        } else if (phaseTime < warn + open) {
          const openAge = phaseTime - warn;
          trap.phase = "open";
          trap.remaining = open - openAge;
          trap.openness = Math.min(1, openAge / 0.18, (open - openAge) / 0.22);
        } else {
          trap.phase = "closed";
          trap.remaining = state.stage.trapCycle - phaseTime;
          trap.openness = 0;
        }
        if (trap.phase !== previous) this.topologyVersion++;
      }
      if (tile.conveyor) {
        const period = state.stage.conveyorPeriod;
        const sign = Math.floor(state.elapsed / period) % 2 ? -1 : 1;
        tile.conveyor.x = tile.conveyor.baseX * sign;
        tile.conveyor.z = tile.conveyor.baseZ * sign;
        tile.conveyor.reversing = period - (state.elapsed % period) <= 1.6;
      }
    }
  }

  private cellId(col: number, row: number): number {
    const radius = this.state.stage.gridRadius;
    if (Math.abs(col) > radius || Math.abs(row) > radius) return -1;
    return (row + radius) * (radius * 2 + 1) + col + radius;
  }

  /** Sparse footprints and temporarily open traps participate in real collision. */
  tileAt(x: number, z: number): Tile | undefined {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return undefined;
    const col = Math.floor(x / TILE_SIZE + 0.5);
    const row = Math.floor(z / TILE_SIZE + 0.5);
    const tile = this.tilesById.get(this.cellId(col, row));
    return tile &&
      (tile.state === "solid" || tile.state === "warning") &&
      tile.trap?.phase !== "open"
      ? tile
      : undefined;
  }

  private updateStageHazards(dt: number): void {
    const state = this.state;
    // Remove both rendering data and collision when an anchor loses support.
    state.spinners = state.spinners.filter((bar) => this.tileAt(bar.x, bar.z));
    state.hammers = state.hammers.filter((hammer) => this.tileAt(hammer.pivot.x, hammer.pivot.z));
    state.bumpers = state.bumpers.filter((bumper) => this.tileAt(bumper.x, bumper.z));
    for (const bar of state.spinners) {
      bar.speed = bar.baseSpeed * (1 + Math.min(0.6, state.elapsed * 0.005));
      bar.angle = (bar.angle + bar.speed * dt) % TWO_PI;
      const available =
        (state.safeRing + 0.25) * TILE_SIZE - Math.max(Math.abs(bar.x), Math.abs(bar.z));
      bar.radius = Math.max(0.8, Math.min(bar.maxRadius, available));
    }
    for (const hammer of state.hammers) {
      hammer.angle = Math.sin(state.elapsed * hammer.speed + hammer.phase) * hammer.amplitude;
      const swing = Math.sin(hammer.angle) * hammer.length;
      hammer.x = hammer.pivot.x + (hammer.axis === "x" ? swing : 0);
      hammer.y = hammer.pivot.y - Math.cos(hammer.angle) * hammer.length;
      hammer.z = hammer.pivot.z + (hammer.axis === "z" ? swing : 0);
    }
    const first = state.spinners[0];
    state.spinnerAngle = first?.angle ?? 0;
    state.spinnerSpeed = first?.speed ?? 0;
    state.spinnerRadius = first?.radius ?? 0;
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
    let moveX = Number.isFinite(input.moveX) ? input.moveX : 0;
    let moveZ = Number.isFinite(input.moveZ) ? input.moveZ : 0;
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
    const belt = fighter.grounded ? this.tileAt(fighter.x, fighter.z)?.conveyor : undefined;
    fighter.x += (fighter.vx + (belt ? belt.x * belt.speed : 0)) * dt;
    fighter.z += (fighter.vz + (belt ? belt.z * belt.speed : 0)) * dt;
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
      for (const bar of this.state.spinners) {
        const dx = fighter.x - bar.x;
        const dz = fighter.z - bar.z;
        const distance = Math.hypot(dx, dz);
        const minimum = HUB_RADIUS + FIGHTER_RADIUS;
        if (distance < minimum) {
          const direction = normalized(dx, dz);
          fighter.x = bar.x + direction.x * minimum;
          fighter.z = bar.z + direction.z * minimum;
          const inwardVelocity = fighter.vx * direction.x + fighter.vz * direction.z;
          if (inwardVelocity < 0) {
            fighter.vx -= inwardVelocity * direction.x;
            fighter.vz -= inwardVelocity * direction.z;
          }
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
    if (fighter.y < -0.15) return;
    const state = this.state;
    for (const bar of state.spinners) {
      const dx = fighter.x - bar.x;
      const dz = fighter.z - bar.z;
      const along = dx * Math.cos(bar.angle) - dz * Math.sin(bar.angle);
      const across = dx * Math.sin(bar.angle) + dz * Math.cos(bar.angle);
      if (
        fighter.y < bar.y + 0.2 &&
        fighter.y + 1.0 > bar.y - 0.2 &&
        Math.abs(along) < bar.radius + 0.15 &&
        Math.abs(along) > HUB_RADIUS &&
        Math.abs(across) < 0.58
      ) {
        const side = (along >= 0 ? 1 : -1) * Math.sign(bar.speed || 1);
        this.hit(fighter, 7, 3.9, -Math.sin(bar.angle) * side, -Math.cos(bar.angle) * side, null);
      }
    }
    for (const hammer of state.hammers) {
      if (
        Math.abs(fighter.y + 0.65 - hammer.y) < hammer.radius + 0.6 &&
        Math.hypot(fighter.x - hammer.x, fighter.z - hammer.z) < hammer.radius + FIGHTER_RADIUS
      ) {
        const velocity = Math.cos(state.elapsed * hammer.speed + hammer.phase) * hammer.speed;
        const sign = Math.sign(velocity || hammer.angle || 1);
        this.hit(
          fighter,
          16,
          6.3,
          hammer.axis === "x" ? sign : 0,
          hammer.axis === "z" ? sign : 0,
          null,
        );
      }
    }
    if (fighter.y > 1.0) return;
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
      this.cannonTimer = Math.max(2.1, state.stage.projectileInterval - state.elapsed * 0.012);
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

  private updateMeteors(dt: number): void {
    const state = this.state;
    const config = state.stage.meteor;
    this.meteorTimer -= dt;
    if (config && this.meteorTimer <= 0) {
      this.meteorTimer = config.interval;
      const candidates = state.tiles.filter(
        (tile) =>
          this.tileAt(tile.x, tile.z) && tile.state === "solid" && tile.trap?.phase !== "warning",
      );
      const selected: Tile[] = [];
      for (let i = 0; i < config.count && candidates.length > 0; i++) {
        let tile = candidates[Math.floor(this.random() * candidates.length)]!;
        for (
          let attempt = 0;
          attempt < 12 &&
          selected.some((old) => Math.hypot(old.x - tile.x, old.z - tile.z) < config.radius * 1.6);
          attempt++
        ) {
          tile = candidates[Math.floor(this.random() * candidates.length)]!;
        }
        if (selected.some((old) => old.id === tile.id)) continue;
        selected.push(tile);
        state.meteors.push({
          id: this.meteorId++,
          x: tile.x,
          z: tile.z,
          radius: config.radius,
          warningTime: config.warningTime,
          timeToImpact: config.warningTime,
          impactAge: 0,
          phase: "warning",
          hitTargets: [],
        });
      }
      if (selected.length > 0) this.topologyVersion++;
    }
    for (const meteor of state.meteors) {
      // A disappearing anchor removes its warning and its hitbox together.
      if (!this.tileAt(meteor.x, meteor.z)) {
        meteor.impactAge = 1;
        continue;
      }
      const previousAge = meteor.impactAge;
      if (meteor.phase === "warning") {
        meteor.timeToImpact = Math.max(0, meteor.timeToImpact - dt);
        if (meteor.timeToImpact > 0) continue;
        meteor.phase = "impact";
        meteor.impactAge = 0;
        this.topologyVersion++;
        this.emit("meteor", meteor.x, 0.1, meteor.z, 0xff9c70);
        state.shake = Math.max(state.shake, 0.65);
        for (const fighter of state.fighters) {
          if (
            !fighter.alive ||
            fighter.y < -0.15 ||
            fighter.y >= 2.8 ||
            meteor.hitTargets.includes(fighter.id)
          )
            continue;
          if (
            Math.hypot(fighter.x - meteor.x, fighter.z - meteor.z) <= meteor.radius &&
            this.hit(fighter, 22, 7.2, fighter.x - meteor.x, fighter.z - meteor.z, null)
          )
            meteor.hitTargets.push(fighter.id);
        }
      } else {
        meteor.impactAge += dt;
      }
      if (previousAge <= 0.65) {
        const oldRadius = meteor.radius + Math.min(previousAge / 0.65, 1) * 3.2;
        const radius = meteor.radius + Math.min(meteor.impactAge / 0.65, 1) * 3.2;
        for (const fighter of state.fighters) {
          if (
            !fighter.alive ||
            fighter.y < -0.15 ||
            fighter.y >= 0.85 ||
            meteor.hitTargets.includes(fighter.id)
          )
            continue;
          const distance = Math.hypot(fighter.x - meteor.x, fighter.z - meteor.z);
          if (
            distance >= oldRadius - 0.4 &&
            distance <= radius + 0.4 &&
            this.hit(fighter, 10, 4.8, fighter.x - meteor.x, fighter.z - meteor.z, null)
          )
            meteor.hitTargets.push(fighter.id);
        }
      }
    }
    state.meteors = state.meteors.filter((meteor) => meteor.impactAge < 0.9);
  }

  private nearestSupported(x: number, z: number, safe = false): Tile | undefined {
    let best: Tile | undefined;
    let score = Infinity;
    for (const tile of this.state.tiles) {
      if (!this.tileAt(tile.x, tile.z) || (safe && !this.safeForBot(tile))) continue;
      const distance = (tile.x - x) ** 2 + (tile.z - z) ** 2;
      if (distance < score) {
        best = tile;
        score = distance;
      }
    }
    return best;
  }

  private safeForBot(tile: Tile): boolean {
    if (!this.tileAt(tile.x, tile.z) || tile.state === "warning" || tile.trap?.phase === "warning")
      return false;
    if (
      this.state.spinners.some(
        (bar) => Math.hypot(tile.x - bar.x, tile.z - bar.z) < HUB_RADIUS + 0.3,
      )
    )
      return false;
    return !this.state.meteors.some(
      (meteor) =>
        meteor.phase === "warning" &&
        Math.hypot(tile.x - meteor.x, tile.z - meteor.z) < meteor.radius + 0.35,
    );
  }

  private floorAlong(x: number, z: number, targetX: number, targetZ: number): boolean {
    const length = Math.hypot(targetX - x, targetZ - z);
    const samples = Math.max(1, Math.ceil(length / 0.4));
    for (let i = 1; i <= samples; i++) {
      const tile = this.tileAt(
        x + ((targetX - x) * i) / samples,
        z + ((targetZ - z) * i) / samples,
      );
      if (!tile || !this.safeForBot(tile)) return false;
    }
    return true;
  }

  /** A roll cannot steer or brake; reserve its complete travel and landing first. */
  private safeRollPath(fighter: Fighter, input: InputFrame): boolean {
    const direction =
      Math.hypot(input.moveX, input.moveZ) > 0.12
        ? normalized(input.moveX, input.moveZ)
        : { x: Math.sin(fighter.facing), z: Math.cos(fighter.facing) };
    const travel = 3.5;
    const clearance = FIGHTER_RADIUS * 0.7;
    for (const offset of [-clearance, 0, clearance]) {
      const x = fighter.x + direction.z * offset;
      const z = fighter.z - direction.x * offset;
      if (!this.floorAlong(x, z, x + direction.x * travel, z + direction.z * travel)) return false;
    }
    return true;
  }

  /** Cached BFS follows real floor. A jump edge spans at most one missing cell. */
  private routeBot(
    fighter: Fighter,
    targetX: number,
    targetZ: number,
  ): { x: number; z: number; jump: boolean } {
    const start = this.tileAt(fighter.x, fighter.z) ?? this.nearestSupported(fighter.x, fighter.z);
    const goal =
      this.nearestSupported(targetX, targetZ, true) ?? this.nearestSupported(targetX, targetZ);
    if (!start || !goal) return { x: 0, z: 0, jump: false };
    let cached = this.navigation.get(fighter.id);
    if (
      !cached ||
      cached.start !== start.id ||
      cached.goal !== goal.id ||
      cached.version !== this.topologyVersion ||
      cached.expires < this.state.elapsed
    ) {
      const escaping = !this.safeForBot(start);
      const queue: number[] = [start.id];
      const previous = new Map<number, number>([[start.id, start.id]]);
      const jumpEdges = new Set<number>();
      let best = start;
      let bestScore = Infinity;
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const tile = this.tilesById.get(queue[cursor]!)!;
        const score =
          (tile.x - goal.x) ** 2 + (tile.z - goal.z) ** 2 + (this.safeForBot(tile) ? 0 : 1000);
        if (score < bestScore) {
          best = tile;
          bestScore = score;
        }
        if (tile.id === goal.id) {
          best = tile;
          break;
        }
        for (const [dc, dr] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const adjacent = this.tilesById.get(this.cellId(tile.col + dc, tile.row + dr));
          if (
            adjacent &&
            (this.safeForBot(adjacent) || (escaping && this.tileAt(adjacent.x, adjacent.z))) &&
            !previous.has(adjacent.id)
          ) {
            previous.set(adjacent.id, tile.id);
            queue.push(adjacent.id);
          } else if (!adjacent || !this.tileAt(adjacent.x, adjacent.z)) {
            const landing = this.tilesById.get(this.cellId(tile.col + dc * 2, tile.row + dr * 2));
            if (landing && this.safeForBot(landing) && !previous.has(landing.id)) {
              previous.set(landing.id, tile.id);
              jumpEdges.add(landing.id);
              queue.push(landing.id);
            }
          }
        }
      }
      let next = best.id;
      while (previous.get(next) !== start.id && previous.get(next) !== next && previous.has(next))
        next = previous.get(next)!;
      cached = {
        start: start.id,
        goal: goal.id,
        version: this.topologyVersion,
        expires: this.state.elapsed + 0.35,
        next,
        jump: jumpEdges.has(next),
      };
      this.navigation.set(fighter.id, cached);
    }
    const next = this.tilesById.get(cached.next)!;
    const atGoal = next.id === start.id;
    const x = atGoal
      ? clamp(targetX, next.x - TILE_SIZE * 0.22, next.x + TILE_SIZE * 0.22)
      : next.x;
    const z = atGoal
      ? clamp(targetZ, next.z - TILE_SIZE * 0.22, next.z + TILE_SIZE * 0.22)
      : next.z;
    const distance = Math.hypot(x - fighter.x, z - fighter.z);
    return distance < 0.12
      ? { x: 0, z: 0, jump: false }
      : { ...normalized(x - fighter.x, z - fighter.z), jump: cached.jump };
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
    const state = this.state;
    if (state.phase !== "playing") return;
    const survivors = state.fighters.filter((fighter) => fighter.alive);
    if (survivors.length > 1) return;
    state.phase = "finished";
    state.winnerId = survivors[0]?.id ?? null;
    if (survivors[0]) survivors[0].placement = 1;
    if (!state.series.history.some((result) => result.round === state.series.round)) {
      state.series.history.push({
        round: state.series.round,
        stageId: state.stage.id,
        winnerId: state.winnerId,
      });
      if (state.winnerId !== null) {
        state.series.wins[state.winnerId] = (state.series.wins[state.winnerId] ?? 0) + 1;
        if (state.series.wins[state.winnerId]! >= state.series.targetWins)
          state.series.championId = state.winnerId;
      }
    }
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
    const state = this.state;
    const difficulty = state.options.difficulty;
    if (fighter.y < -0.1) {
      const landing = this.nearestSupported(fighter.x, fighter.z);
      if (landing) {
        const direction = normalized(landing.x - fighter.x, landing.z - fighter.z);
        input.moveX = direction.x;
        input.moveZ = direction.z;
      }
      return input;
    }
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
    const distance = Math.sqrt(closestSquared);
    const currentTile = this.tileAt(fighter.x, fighter.z);
    const zoneTarget = safeZoneNavigationTarget(state, fighter);
    const atRisk = !currentTile || !this.safeForBot(currentTile) || zoneTarget !== null;
    let desiredX = target.x;
    let desiredZ = target.z;
    if (zoneTarget) {
      desiredX = zoneTarget.x;
      desiredZ = zoneTarget.z;
    } else if (atRisk) {
      const refuge = this.nearestSupported(fighter.x, fighter.z, true);
      if (refuge) {
        desiredX = refuge.x;
        desiredZ = refuge.z;
      }
    } else if (fighter.stamina < 28 && distance < 3) {
      const away = normalized(fighter.x - target.x, fighter.z - target.z);
      desiredX = fighter.x + away.x * 2;
      desiredZ = fighter.z + away.z * 2;
    } else if (distance < 1.3) {
      const toTarget = normalized(target.x - fighter.x, target.z - fighter.z);
      desiredX = fighter.x + toTarget.z * fighter.aiStrafe;
      desiredZ = fighter.z - toTarget.x * fighter.aiStrafe;
    }
    const direct = normalized(desiredX - fighter.x, desiredZ - fighter.z);
    const lookahead = Math.min(1.3, Math.hypot(desiredX - fighter.x, desiredZ - fighter.z));
    const directSafe =
      !atRisk &&
      this.floorAlong(
        fighter.x,
        fighter.z,
        fighter.x + direct.x * lookahead,
        fighter.z + direct.z * lookahead,
      ) &&
      this.floorAlong(fighter.x, fighter.z, desiredX, desiredZ);
    const route = directSafe
      ? { ...direct, jump: false }
      : this.routeBot(fighter, desiredX, desiredZ);
    const movementScale = difficulty === "easy" ? 0.77 : 0.93;
    input.moveX = route.x * movementScale;
    input.moveZ = route.z * movementScale;
    for (const bumper of state.bumpers) {
      const bx = fighter.x - bumper.x;
      const bz = fighter.z - bumper.z;
      const bd = Math.hypot(bx, bz);
      if (bd < 1.65 && bd > 0) {
        const pushX = input.moveX + (bx / bd) * (1.65 - bd) * 2;
        const pushZ = input.moveZ + (bz / bd) * (1.65 - bd) * 2;
        if (this.tileAt(fighter.x + pushX * 0.5, fighter.z + pushZ * 0.5)) {
          input.moveX = pushX;
          input.moveZ = pushZ;
        }
      }
    }
    if (fighter.action !== "idle") return input;
    if (route.jump && fighter.grounded && fighter.vx * route.x + fighter.vz * route.z > 2.8) {
      input.jump = true;
      return input;
    }
    const lead = difficulty === "hard" ? 0.24 : difficulty === "easy" ? 0.11 : 0.19;
    for (const bar of state.spinners) {
      const futureAngle = bar.angle + bar.speed * lead;
      const dx = fighter.x - bar.x;
      const dz = fighter.z - bar.z;
      const across = dx * Math.sin(futureAngle) + dz * Math.cos(futureAngle);
      const along = dx * Math.cos(futureAngle) - dz * Math.sin(futureAngle);
      if (
        fighter.grounded &&
        Math.abs(across) < 0.88 &&
        Math.abs(along) < bar.radius + 0.2 &&
        Math.abs(along) > HUB_RADIUS &&
        (difficulty !== "easy" || fighter.aiTimer < 0.1)
      ) {
        input.jump = true;
        fighter.aiTimer = difficulty === "easy" ? 0.8 : 0.38;
        return input;
      }
    }
    for (const meteor of state.meteors) {
      const d = Math.hypot(fighter.x - meteor.x, fighter.z - meteor.z);
      const nextWave = meteor.radius + clamp((meteor.impactAge + 0.15) / 0.65, 0, 1) * 3.2;
      if (
        fighter.grounded &&
        meteor.phase === "impact" &&
        meteor.impactAge < 0.65 &&
        Math.abs(d - nextWave) < 0.9
      ) {
        input.jump = true;
        return input;
      }
    }
    if (
      fighter.grounded &&
      fighter.stamina >= ROLL_COST &&
      state.hammers.some(
        (hammer) => hammer.y < 1.7 && Math.hypot(fighter.x - hammer.x, fighter.z - hammer.z) < 1.7,
      ) &&
      this.safeRollPath(fighter, input)
    ) {
      input.roll = true;
      return input;
    }
    if (fighter.aiTimer > 0 || atRisk || route.jump) return input;
    fighter.aiTimer =
      (difficulty === "hard" ? 0.16 : difficulty === "easy" ? 0.56 : 0.3) + this.random() * 0.28;
    if (this.random() < 0.13) fighter.aiStrafe *= -1;
    const projectile = state.projectiles.find(
      (ball) =>
        ball.ownerId !== fighter.id && Math.hypot(ball.x - fighter.x, ball.z - fighter.z) < 3.1,
    );
    const targetAttacking = isAttack(target.action) && target.actionTime < 0.3;
    if (projectile && fighter.grounded && fighter.stamina >= 25 && difficulty !== "easy")
      input.strong = true;
    else if (
      targetAttacking &&
      distance < 2.3 &&
      fighter.grounded &&
      fighter.stamina >= ROLL_COST + 10 &&
      this.random() < 0.5 &&
      this.safeRollPath(fighter, input)
    )
      input.roll = true;
    else if (fighter.item && distance > 2.6 && distance < 8) {
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
    } else if (fighter.grounded && distance < 3.5 && this.random() < 0.1) input.jump = true;
    return input;
  }
}
