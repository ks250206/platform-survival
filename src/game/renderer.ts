import { Application, Container, Graphics, RendererType, Sprite, Text, Texture } from "pixi.js";
import type { WebGLRenderer } from "pixi.js";
import { AmbientLight, Container3D, DirectionalLight, Mesh3D, View3D } from "@pixi/3d";
import { ArenaMeshes, CreatureMesh, DynamicRingGeometry, mix } from "./meshes";
import { GRID_RADIUS, TILE_SIZE } from "./types";
import type {
  Bumper,
  Fighter,
  GameEvent,
  GameState,
  Hammer,
  Meteor,
  Pickup,
  Projectile,
  Spinner,
  Tile,
} from "./types";
import { getStageDefinition } from "./stages";
import { appearanceKey } from "./appearance";

const TAU = Math.PI * 2;
const CAMERA_X = 18;
const CAMERA_Y = 24;
const CAMERA_Z = 24;

export { screenToWorldMovement } from "./coordinates";

interface TileView {
  root: Container3D;
  tops: Mesh3D[];
  original: number;
  accents: Mesh3D[];
  doors?: [Container3D, Container3D];
  lamps?: Mesh3D[];
  belt?: { root: Container3D; arrows: Container3D[]; marks: Mesh3D[] };
}
interface SpinnerView {
  root: Container3D;
  arm: Container3D;
  bar: Mesh3D;
  stripe: Mesh3D;
  caps: Mesh3D[];
  hub: Container3D;
}
interface HammerView {
  root: Container3D;
  mount: Container3D;
  arm: Container3D;
  shaft: Mesh3D;
  head: Container3D;
  shadow: Mesh3D;
  path: Mesh3D[];
}
interface MeteorView {
  root: Container3D;
  warning: Container3D;
  ring: Mesh3D;
  countdown: Text;
  rock: Container3D;
  flames: Mesh3D[];
  shockwave: Mesh3D;
  echo: Mesh3D;
  waveBand: Mesh3D;
  waveGeometry: DynamicRingGeometry;
  debris: Mesh3D[];
}
interface SafeZoneView {
  root: Container3D;
  current: Mesh3D;
  geometry: DynamicRingGeometry;
  next: Container3D;
  dashes: Mesh3D[];
  arrow: Container3D;
  label: Text;
}
interface FighterView {
  creature: CreatureMesh;
  label: Text;
  color: number;
  appearance: string;
}
interface BumperView {
  root: Container3D;
  cap: Mesh3D;
  halo: Mesh3D;
}
interface ItemView {
  root: Container3D;
  halo: Mesh3D;
  color: number;
}
interface EffectView {
  root: Container3D;
  particles: Mesh3D[];
  text: Text | null;
}
interface DriftingCloud {
  root: Container3D;
  x: number;
  y: number;
  z: number;
  phase: number;
}

/** GPU 3D stage. The app owns time: this class never starts a second ticker. */
export class ArenaRenderer {
  readonly app: Application;
  readonly canvas: HTMLCanvasElement;
  private readonly view: View3D;
  private readonly scene = new Container3D();
  private readonly scenery = new Container3D();
  private readonly labels = new Container();
  private readonly overlay = new Container();
  private readonly assets = new ArenaMeshes();
  private readonly tiles = new Map<number, TileView>();
  private readonly fighters = new Map<number, FighterView>();
  private readonly bumpers = new Map<number, BumperView>();
  private readonly pickups = new Map<number, ItemView>();
  private readonly projectiles = new Map<number, ItemView>();
  private readonly effects = new Map<number, EffectView>();
  private readonly clouds: DriftingCloud[] = [];
  private readonly floorLookup = new Map<string, boolean>();
  private readonly background: Sprite;
  private readonly skyTexture: Texture;
  private readonly resizeObserver: ResizeObserver;
  private readonly spinners = new Map<number, SpinnerView>();
  private readonly hammers = new Map<number, HammerView>();
  private readonly meteors = new Map<number, MeteorView>();
  private readonly footprint = new Set<string>();
  private arenaTiles: Tile[] | null = null;
  private arenaKey = "";
  private stageColor = 0x76cdb5;
  private arenaSize = (GRID_RADIUS * 2 + 1) * TILE_SIZE;
  private safeZoneView: SafeZoneView | null = null;
  private readonly playerArrow = new Graphics();
  private width = 1;
  private height = 1;
  private cameraScale = 1;
  private time = 0;
  private destroyed = false;

  private constructor(
    app: Application,
    private readonly host: HTMLElement,
  ) {
    this.app = app;
    this.canvas = app.canvas;
    this.canvas.setAttribute(
      "aria-label",
      "空中アリーナ。丸い尻尾つきキャラクターの3Dサバイバルバトル",
    );
    this.canvas.style.display = "block";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.touchAction = "none";
    host.appendChild(this.canvas);

    const skyCanvas = document.createElement("canvas");
    skyCanvas.width = 2;
    skyCanvas.height = 256;
    const context = skyCanvas.getContext("2d")!;
    const sky = context.createLinearGradient(0, 0, 0, 256);
    sky.addColorStop(0, "#adc7f0");
    sky.addColorStop(0.45, "#c5dce9");
    sky.addColorStop(1, "#e7e1f1");
    context.fillStyle = sky;
    context.fillRect(0, 0, 2, 256);
    this.skyTexture = Texture.from(skyCanvas);
    this.background = new Sprite(this.skyTexture);
    app.stage.addChild(this.background);

    const floatTargets =
      app.renderer.type !== RendererType.WEBGL ||
      Boolean((app.renderer as WebGLRenderer).context.extensions.colorBufferFloat);
    this.view = new View3D({
      width: host.clientWidth || 1280,
      height: host.clientHeight || 720,
      composite: true,
      resolution: Math.min(window.devicePixelRatio || 1, 1.15),
      toneMapping: "aces",
      exposure: 1.04,
      // Blob shadows deliberately avoid a second 24-character shadow render.
      environment: floatTargets
        ? { skyColor: 0xd6e9f9, groundColor: 0x8c82a3, intensity: 0.65 }
        : null,
      cull: "cpu",
    });
    this.view.eventMode = "none";
    this.labels.eventMode = "none";
    this.overlay.eventMode = "none";
    app.stage.addChild(this.view, this.labels, this.overlay);
    this.overlay.addChild(this.playerArrow);
    this.playerArrow.eventMode = "none";
    this.playerArrow
      .moveTo(0, 6)
      .lineTo(-5, -3)
      .lineTo(5, -3)
      .closePath()
      .fill({ color: 0xfff6cf });
    this.playerArrow.visible = false;
    this.view.root.addChild(this.scenery, this.scene);
    this.view.camera.mode = "perspective";
    this.view.camera.fov = 37;
    this.view.camera.near = 0.3;
    this.view.camera.far = 180;
    const sun = new DirectionalLight({ color: 0xffeed6, intensity: 2.7, castShadow: false });
    sun.position.set(-12, 20, 14);
    this.view.root.addChild(sun);
    sun.lookAt({ x: 0, y: 0, z: 0 });
    const fill = new DirectionalLight({ color: 0xb6dcff, intensity: 1.1 });
    fill.position.set(12, 8, -15);
    this.view.root.addChild(fill);
    fill.lookAt({ x: 0, y: 0, z: 0 });
    if (!floatTargets)
      this.view.root.addChild(new AmbientLight({ color: 0xcbd9f0, intensity: 1.6 }));

    this.buildScenery();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
  }

  static async create(host: HTMLElement): Promise<ArenaRenderer> {
    const app = new Application();
    try {
      await app.init({
        preference: "webgl",
        width: host.clientWidth || 1280,
        height: host.clientHeight || 720,
        background: 0xc7d9ee,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 1.5),
        autoStart: false,
        powerPreference: "high-performance",
      });
      if (app.renderer.type !== RendererType.WEBGL && app.renderer.type !== RendererType.WEBGPU) {
        throw new Error("このゲームには WebGL 2 が必要です。対応ブラウザーで開いてください。");
      }
      if (
        app.renderer.type === RendererType.WEBGL &&
        (app.renderer as WebGLRenderer).context.webGLVersion !== 2
      ) {
        throw new Error(
          "WebGL 2 を利用できません。ブラウザーのハードウェアアクセラレーションを確認してください。",
        );
      }
      app.ticker.stop();
      return new ArenaRenderer(app, host);
    } catch (error) {
      if (app.renderer) app.destroy(true, { children: true });
      throw error;
    }
  }

  private buildScenery(): void {
    const a = this.assets;
    const rock = a.material(0xaca5ce);
    const grass = a.material(0xb4cfca);
    const paleGrass = a.material(0xc1cfd9);
    const cloudMaterial = a.material(0xf4eff9);
    const places = [
      [-19, -7, -19, 2.2],
      [17, -9, -24, 3.6],
      [-28, -5, 5, 2.4],
      [25, -12, 9, 2.9],
      [-4, -12, -33, 2],
      [32, -6, -16, 1.8],
    ];
    for (const [i, coordinates] of places.entries()) {
      const [x, y, z, scale] = coordinates as [number, number, number, number];
      const island = new Container3D();
      island.position.set(x, y, z);
      island.scale.set(scale);
      island.rotation.y = i * 0.8;
      this.scenery.addChild(island);
      const base = a.mesh(island, a.cone, rock, 0, -1, 0, 1.6, 2, 1.4);
      base.rotation.z = Math.PI;
      a.mesh(island, a.cylinder, i % 2 ? grass : paleGrass, 0, 0.07, 0, 1.5, 0.23, 1.35);
      a.ball(island, grass, -0.4, 0.29, -0.2, 0.7, 0.28, 0.5, true);
      if (i % 2 === 0) {
        a.box(island, a.material(0x9991b9), 0.2, 0.49, 0, 0.13, 0.9, 0.13);
        a.ball(island, a.material(0xb0d7c8), 0.2, 1.1, 0, 0.58, 0.65, 0.53, true);
      }
    }
    for (let i = 0; i < 11; i++) {
      const angle = (i / 11) * TAU;
      const radius = 20 + (i % 3) * 7;
      const root = new Container3D();
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = -5 - (i % 4) * 2;
      root.position.set(x, y, z);
      root.scale.set(1.2 + (i % 3) * 0.45);
      this.scenery.addChild(root);
      a.ball(root, cloudMaterial, 0, 0, 0, 2.2, 0.48, 0.82, true);
      a.ball(root, cloudMaterial, -0.7, 0.35, 0, 0.9, 0.58, 0.74, true);
      a.ball(root, cloudMaterial, 0.5, 0.5, 0, 0.9, 0.75, 0.8, true);
      this.clouds.push({ root, x, y, z, phase: i * 1.7 });
    }
  }

  /** A fresh plan can reuse all IDs, so array identity also marks a restart. */
  private syncArena(state: GameState): void {
    const key = `${state.stage.id}/${state.series.round}/${state.stage.level}/${state.stage.gridRadius}`;
    if (key === this.arenaKey && state.tiles === this.arenaTiles) return;
    this.arenaKey = key;
    this.arenaTiles = state.tiles;
    this.stageColor = getStageDefinition(state.stage.id).color;
    const size = (state.stage.gridRadius * 2 + 1) * TILE_SIZE;
    if (this.arenaSize !== size) {
      this.arenaSize = size;
      this.resize();
    }
    if (this.safeZoneView) {
      this.safeZoneView.root.destroy({ children: true });
      this.safeZoneView.geometry.destroy(true);
      this.safeZoneView.label.destroy();
      this.safeZoneView = null;
    }
    for (const entries of [
      this.tiles,
      this.spinners,
      this.hammers,
      this.bumpers,
      this.pickups,
      this.projectiles,
    ]) {
      for (const entry of entries.values()) entry.root.destroy({ children: true });
      entries.clear();
    }
    for (const entry of this.meteors.values()) {
      entry.root.destroy({ children: true });
      entry.countdown.destroy();
      entry.waveGeometry.destroy(true);
    }
    this.meteors.clear();
    for (const entry of this.effects.values()) {
      entry.root.destroy({ children: true });
      entry.text?.destroy();
    }
    this.effects.clear();
    this.floorLookup.clear();
    this.footprint.clear();
    for (const tile of state.tiles) this.footprint.add(`${tile.col}/${tile.row}`);
  }

  private supported(x: number, z: number): boolean {
    return (
      this.floorLookup.get(`${Math.round(x / TILE_SIZE)}/${Math.round(z / TILE_SIZE)}`) === true
    );
  }

  private tileView(tile: Tile): TileView {
    const a = this.assets;
    const root = new Container3D();
    root.position.set(tile.x, 0, tile.z);
    this.scene.addChild(root);
    const edges = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ].filter(([x, z]) => !this.footprint.has(`${tile.col + x!}/${tile.row + z!}`));
    const original = tile.trap
      ? 0xa9bfd8
      : edges.length
        ? mix(this.stageColor, 0xffffff, (tile.col + tile.row) % 2 ? 0.47 : 0.63)
        : (tile.col + tile.row) % 2
          ? 0xdbd6e9
          : 0xc7c6df;
    const tops: Mesh3D[] = [];
    const accents: Mesh3D[] = [];
    const entry: TileView = { root, tops, original, accents };
    const base = a.material(edges.length ? 0x8970b7 : 0x9283b9);
    if (tile.trap) {
      // The base is a real frame: no solid slab remains below an open trapdoor.
      for (const side of [-1, 1]) {
        a.box(root, base, side * 0.84, -0.25, 0, 0.12, 0.4, TILE_SIZE - 0.035);
        a.box(root, base, 0, -0.25, side * 0.84, 1.56, 0.4, 0.12);
      }
      const left = new Container3D();
      const right = new Container3D();
      root.addChild(left, right);
      left.x = -0.78;
      right.x = 0.78;
      tops.push(a.box(left, a.material(original), 0.385, -0.075, 0, 0.755, 0.15, 1.55));
      tops.push(a.box(right, a.material(original), -0.385, -0.075, 0, 0.755, 0.15, 1.55));
      for (const door of [left, right]) {
        const sign = door === left ? 1 : -1;
        a.box(door, a.material(0x7f94b8), sign * 0.385, 0.008, 0, 0.045, 0.012, 1.34);
      }
      entry.doors = [left, right];
      entry.lamps = [];
      for (const x of [-0.78, 0.78])
        for (const z of [-0.78, 0.78]) {
          entry.lamps.push(
            a.ball(
              root,
              a.material(0x9be6d6, { glow: 0.35 }),
              x,
              0.025,
              z,
              0.075,
              0.045,
              0.075,
              true,
            ),
          );
        }
    } else {
      a.box(root, base, 0, -0.33, 0, TILE_SIZE - 0.035, 0.43, TILE_SIZE - 0.035);
      tops.push(
        a.box(root, a.material(original), 0, -0.075, 0, TILE_SIZE - 0.07, 0.15, TILE_SIZE - 0.07),
      );
    }
    // Every exposed edge is highlighted, including the inside of the donut and cross notches.
    for (const [x, z] of edges) {
      accents.push(
        a.box(
          root,
          a.material(0xf4c997),
          x! * 0.86,
          -0.16,
          z! * 0.86,
          x ? 0.055 : TILE_SIZE - 0.03,
          0.065,
          z ? 0.055 : TILE_SIZE - 0.03,
        ),
      );
    }
    if (tile.conveyor) {
      a.box(root, a.material(0x777ba8), 0, 0.015, 0, 1.7, 0.03, 1.35);
      for (const side of [-1, 1]) {
        a.box(root, a.material(0xe2c98b), 0, 0.035, side * 0.72, 1.7, 0.05, 0.055);
      }
      const motion = new Container3D();
      root.addChild(motion);
      const arrows: Container3D[] = [];
      const marks: Mesh3D[] = [];
      for (let i = 0; i < 3; i++) {
        const arrow = new Container3D();
        motion.addChild(arrow);
        for (const side of [-1, 1]) {
          const stripe = a.box(
            arrow,
            a.material(0xe5fff6, { glow: 0.15 }),
            side * 0.12,
            0.043,
            -0.03,
            0.07,
            0.018,
            0.32,
          );
          stripe.rotation.y = (-side * Math.PI) / 4;
          marks.push(stripe);
        }
        arrows.push(arrow);
      }
      entry.belt = { root: motion, arrows, marks };
    } else if (tile.kind === "spring") {
      a.mesh(root, a.cylinder, a.material(0x6c649d), 0, 0.06, 0, 0.49, 0.12, 0.49);
      a.mesh(root, a.ring, a.material(0xa289d6), 0, 0.17, 0, 0.39);
      a.mesh(root, a.cylinder, a.material(0xffdf91), 0, 0.24, 0, 0.43, 0.09, 0.43);
      a.mesh(root, a.cone, a.material(0xfffaf1), 0, 0.315, 0, 0.13, 0.17, 0.13);
    } else if (!tile.trap && (Math.abs(tile.col) + Math.abs(tile.row)) % 4 === 0 && !edges.length) {
      a.mesh(root, a.disc, a.material(mix(original, 0xffffff, 0.38)), 0, 0.006, 0, 0.065);
    }
    return entry;
  }

  private updateTiles(state: GameState): void {
    const liveIds = new Set(state.tiles.map((tile) => tile.id));
    for (const [id, entry] of this.tiles)
      if (!liveIds.has(id)) {
        entry.root.destroy({ children: true });
        this.tiles.delete(id);
      }
    this.floorLookup.clear();
    for (const tile of state.tiles) {
      let entry = this.tiles.get(tile.id);
      if (!entry) {
        entry = this.tileView(tile);
        this.tiles.set(tile.id, entry);
      }
      const falling = tile.state === "falling";
      const warning = tile.state === "warning";
      const gone = tile.state === "gone";
      const trapWarning = tile.trap?.phase === "warning";
      entry.root.visible = !gone;
      this.floorLookup.set(
        `${tile.col}/${tile.row}`,
        !gone && !falling && tile.trap?.phase !== "open",
      );
      const t = tile.fallTime;
      entry.root.y = falling
        ? -12 * t * t - 0.25 * t
        : warning
          ? Math.sin(this.time * 24 + tile.id) * 0.012
          : 0;
      entry.root.rotation.set(
        falling ? t * 0.4 * (tile.col % 2 ? 1 : -1) : 0,
        0,
        falling ? t * 0.35 * (tile.row % 2 ? 1 : -1) : 0,
      );
      const flashing = Math.sin(this.time * 9) > 0;
      const warnColor = flashing ? 0xffd184 : 0xf6a7a5;
      const zone = state.safeZone;
      const outside = zone && Math.hypot(tile.x - zone.x, tile.z - zone.z) > zone.radius;
      const floorColor = zone
        ? mix(entry.original, outside ? 0xf3a1ad : 0xa5e8d6, outside ? 0.52 : 0.18)
        : entry.original;
      const material = this.assets.material(
        warning || trapWarning ? warnColor : falling ? 0xf5b1b6 : floorColor,
      );
      for (const top of entry.tops) top.material = material;
      for (const accent of entry.accents)
        accent.material = this.assets.material(warning ? 0xffa37e : 0xf4c997);
      if (entry.doors && tile.trap) {
        const opening = Math.max(0, Math.min(1, tile.trap.openness));
        entry.doors[0].rotation.z = (-opening * Math.PI) / 2;
        entry.doors[1].rotation.z = (opening * Math.PI) / 2;
        for (const lamp of entry.lamps ?? [])
          lamp.material = this.assets.material(
            trapWarning
              ? flashing
                ? 0xffca74
                : 0xff867b
              : tile.trap.phase === "open"
                ? 0xff8f96
                : 0x9be6d6,
            { glow: 0.35 },
          );
      }
      if (entry.belt && tile.conveyor) {
        entry.belt.root.rotation.y = Math.atan2(tile.conveyor.x, tile.conveyor.z);
        for (let i = 0; i < entry.belt.arrows.length; i++) {
          entry.belt.arrows[i]!.z =
            ((i * 0.55 + this.time * tile.conveyor.speed * 0.7) % 1.65) - 0.825;
        }
        for (const mark of entry.belt.marks)
          mark.material = this.assets.material(
            tile.conveyor.reversing ? (flashing ? 0xffd57c : 0xffa58a) : 0xe5fff6,
            { glow: 0.15 },
          );
      }
    }
  }

  private makeSpinner(spinner: Spinner): SpinnerView {
    const a = this.assets;
    const root = new Container3D();
    const arm = new Container3D();
    const hub = new Container3D();
    this.scene.addChild(root);
    root.addChild(arm, hub);
    const bar = a.mesh(
      arm,
      a.cylinder,
      a.material(spinner.color, { roughness: 0.48 }),
      0,
      spinner.y,
      0,
      0.17,
      spinner.radius * 2,
      0.17,
    );
    bar.rotation.z = Math.PI / 2;
    const stripe = a.box(
      arm,
      a.material(0xffd788, { glow: 0.3 }),
      0,
      spinner.y + 0.01,
      0.16,
      spinner.radius * 2,
      0.065,
      0.03,
    );
    const caps: Mesh3D[] = [];
    for (const side of [-1, 1]) {
      const cap = a.mesh(
        arm,
        a.cylinder,
        a.material(0xffe3a0, { roughness: 0.45 }),
        side * spinner.radius,
        spinner.y,
        0,
        0.245,
        0.16,
        0.245,
      );
      cap.rotation.z = Math.PI / 2;
      caps.push(cap);
    }
    a.mesh(hub, a.cylinder, a.material(0x67619b), 0, 0.2, 0, 0.7, 0.4, 0.7);
    a.mesh(hub, a.cylinder, a.material(0x8979bd), 0, 0.62, 0, 0.53, 0.55, 0.53);
    a.mesh(hub, a.cylinder, a.material(0xe5d7fb), 0, 0.92, 0, 0.58, 0.12, 0.58);
    a.mesh(hub, a.ring, a.material(0xffda89, { glow: 0.5 }), 0, 0.9, 0, 0.4);
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * TAU;
      a.ball(
        hub,
        a.material(0xffd578, { glow: 0.65 }),
        Math.sin(angle) * 0.53,
        0.6,
        Math.cos(angle) * 0.53,
        0.085,
        0.13,
        0.085,
        true,
      );
    }
    return { root, arm, bar, stripe, caps, hub };
  }

  private updateSpinners(state: GameState): void {
    const ids = new Set(state.spinners.map((spinner) => spinner.id));
    for (const [id, entry] of this.spinners)
      if (!ids.has(id)) {
        entry.root.destroy({ children: true });
        this.spinners.delete(id);
      }
    for (const spinner of state.spinners) {
      let entry = this.spinners.get(spinner.id);
      if (!entry) {
        entry = this.makeSpinner(spinner);
        this.spinners.set(spinner.id, entry);
      }
      entry.root.position.set(spinner.x, 0, spinner.z);
      entry.root.visible = this.supported(spinner.x, spinner.z) && spinner.radius > 0;
      // Matches physics exactly: +X endpoint travels toward -Z for positive angle.
      entry.arm.rotation.y = spinner.angle;
      entry.bar.scale.y = spinner.radius * 2;
      entry.bar.y = spinner.y;
      entry.stripe.scale.x = Math.max(0.1, spinner.radius * 2 - 0.1);
      entry.stripe.y = spinner.y + 0.01;
      entry.caps[0]!.position.set(-spinner.radius, spinner.y, 0);
      entry.caps[1]!.position.set(spinner.radius, spinner.y, 0);
      // Coaxial bars share one visible hub and never create coincident surfaces.
      entry.hub.visible = !state.spinners.some(
        (other) => other.id < spinner.id && other.x === spinner.x && other.z === spinner.z,
      );
    }
  }

  private makeHammer(hammer: Hammer): HammerView {
    const a = this.assets;
    const root = new Container3D();
    const mount = new Container3D();
    const arm = new Container3D();
    const head = new Container3D();
    root.addChild(mount, arm, head);
    this.scene.addChild(root);
    // A floating overhead motor has no decorative floor posts to confuse collision.
    a.box(mount, a.material(0x8b80b2), 0, 0.17, 0, 1.25, 0.28, 0.48);
    a.ball(mount, a.material(0xe7d8f4), 0, 0, 0, 0.32, 0.3, 0.3, true);
    a.mesh(mount, a.ring, a.material(0xffd48a, { glow: 0.25 }), 0, 0, 0, 0.34).rotation.x =
      Math.PI / 2;
    const shaft = a.mesh(
      arm,
      a.cylinder,
      a.material(0xe8bf82),
      0,
      0,
      hammer.length / 2,
      0.12,
      hammer.length,
      0.12,
    );
    shaft.rotation.x = Math.PI / 2;
    const pink = a.material(0xef9fb8, { roughness: 0.4 });
    a.ball(head, pink, 0, 0, 0, hammer.radius, hammer.radius * 0.9, hammer.radius * 0.9);
    for (const side of [-1, 1]) {
      a.ball(
        head,
        a.material(0xffd896),
        side * hammer.radius * 0.75,
        0,
        0,
        hammer.radius * 0.16,
        hammer.radius * 0.65,
        hammer.radius * 0.65,
        true,
      );
      a.ball(
        head,
        a.material(0xfff0d2),
        side * hammer.radius * 0.88,
        0,
        0,
        hammer.radius * 0.055,
        hammer.radius * 0.34,
        hammer.radius * 0.34,
        true,
      );
    }
    const shadow = a.mesh(
      root,
      a.disc,
      a.material(0x4e4182, { alpha: 0.22 }),
      0,
      0.023,
      0,
      hammer.radius * 1.1,
    );
    const path: Mesh3D[] = [];
    for (let i = -3; i <= 3; i++) {
      const dot = a.mesh(root, a.disc, a.material(0xf1c992), 0, 0.012, 0, 0.075);
      path.push(dot);
    }
    return { root, mount, arm, shaft, head, shadow, path };
  }

  private updateHammers(state: GameState): void {
    const ids = new Set(state.hammers.map((hammer) => hammer.id));
    for (const [id, entry] of this.hammers)
      if (!ids.has(id)) {
        entry.root.destroy({ children: true });
        this.hammers.delete(id);
      }
    for (const hammer of state.hammers) {
      let entry = this.hammers.get(hammer.id);
      if (!entry) {
        entry = this.makeHammer(hammer);
        this.hammers.set(hammer.id, entry);
      }
      entry.root.visible = this.supported(hammer.pivot.x, hammer.pivot.z);
      entry.mount.position.set(hammer.pivot.x, hammer.pivot.y, hammer.pivot.z);
      entry.mount.rotation.y = hammer.axis === "x" ? Math.PI / 2 : 0;
      entry.arm.position.set(hammer.pivot.x, hammer.pivot.y, hammer.pivot.z);
      // No second trigonometric simulation: point the shaft at the actual collision sphere.
      entry.arm.lookAt({ x: hammer.x, y: hammer.y, z: hammer.z });
      const length = Math.hypot(
        hammer.x - hammer.pivot.x,
        hammer.y - hammer.pivot.y,
        hammer.z - hammer.pivot.z,
      );
      entry.shaft.z = length / 2;
      entry.shaft.scale.y = length;
      entry.head.position.set(hammer.x, hammer.y, hammer.z);
      entry.head.rotation.set(
        hammer.axis === "z" ? hammer.angle : 0,
        hammer.axis === "x" ? Math.PI / 2 : 0,
        hammer.axis === "x" ? -hammer.angle : 0,
      );
      entry.shadow.position.set(hammer.x, 0.024, hammer.z);
      entry.shadow.visible = this.supported(hammer.x, hammer.z);
      const shadowScale = hammer.radius * Math.max(0.7, 1.15 - hammer.y * 0.07);
      entry.shadow.scale.set(shadowScale, 1, shadowScale);
      for (let i = 0; i < entry.path.length; i++) {
        const offset = ((i - 3) / 3) * Math.sin(hammer.amplitude) * hammer.length;
        const x = hammer.pivot.x + (hammer.axis === "x" ? offset : 0);
        const z = hammer.pivot.z + (hammer.axis === "z" ? offset : 0);
        entry.path[i]!.position.set(x, 0.012, z);
        entry.path[i]!.visible = this.supported(x, z);
      }
    }
  }

  private makeMeteor(meteor: Meteor): MeteorView {
    const a = this.assets;
    const root = new Container3D();
    const warning = new Container3D();
    const rock = new Container3D();
    root.addChild(warning, rock);
    this.scene.addChild(root);
    a.mesh(
      warning,
      a.disc,
      a.material(0xff8c75, { alpha: 0.17, glow: 0.15 }),
      0,
      0.028,
      0,
      meteor.radius,
    );
    const ring = a.mesh(
      warning,
      a.ring,
      a.material(0xff8872, { glow: 0.65 }),
      0,
      0.055,
      0,
      meteor.radius,
    );
    for (const turn of [-1, 1]) {
      const cross = a.box(
        warning,
        a.material(0xffd19b, { glow: 0.35 }),
        0,
        0.04,
        0,
        0.12,
        0.025,
        0.78,
      );
      cross.rotation.y = (turn * Math.PI) / 4;
    }
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * TAU;
      const radius = meteor.radius + 0.14;
      const mark = a.box(
        warning,
        a.material(0xffa886, { glow: 0.35 }),
        Math.sin(angle) * radius,
        0.04,
        Math.cos(angle) * radius,
        0.09,
        0.03,
        0.22,
      );
      mark.rotation.y = angle;
    }
    const stone = a.material(0x9e84a7, { roughness: 0.9 });
    a.ball(rock, stone, 0, 0, 0, 0.62, 0.57, 0.61, true);
    a.ball(rock, a.material(0xc0a0b5), 0.31, 0.14, 0.12, 0.31, 0.26, 0.29, true);
    a.ball(rock, a.material(0x786988), -0.27, -0.12, 0.23, 0.28, 0.25, 0.24, true);
    const flames: Mesh3D[] = [];
    flames.push(
      a.mesh(
        rock,
        a.cone,
        a.material(0xffab76, { alpha: 0.77, glow: 0.6 }),
        0,
        0.95,
        0,
        0.58,
        1.9,
        0.58,
      ),
    );
    flames.push(
      a.mesh(
        rock,
        a.cone,
        a.material(0xffe3a3, { alpha: 0.85, glow: 0.7 }),
        0,
        0.74,
        0,
        0.35,
        1.45,
        0.35,
      ),
    );
    const shockwave = a.mesh(root, a.ring, a.material(0xffd88a, { glow: 1.1 }), 0, 0.23, 0);
    const echo = a.mesh(
      root,
      a.ring,
      a.material(0xff9f84, { alpha: 0.67, glow: 0.55 }),
      0,
      0.12,
      0,
    );
    const waveGeometry = new DynamicRingGeometry();
    const waveBand = a.mesh(
      root,
      waveGeometry,
      a.material(0xffcd89, { alpha: 0.32, glow: 0.35 }),
      0,
      0.18,
      0,
    );
    shockwave.visible = echo.visible = waveBand.visible = false;
    const debris: Mesh3D[] = [];
    for (let i = 0; i < 6; i++) {
      const shard = a.mesh(root, a.cube, a.material(i % 2 ? 0xb39bb8 : 0xffd69a), 0, 0.3, 0, 0.13);
      shard.visible = false;
      debris.push(shard);
    }
    const countdown = new Text({
      text: "",
      style: {
        fontFamily: 'Arial, "Noto Sans JP", sans-serif',
        fontWeight: "900",
        fontSize: 20,
        fill: 0xfff4d0,
        stroke: { color: 0x793f59, width: 5, join: "round" },
        align: "center",
      },
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });
    countdown.anchor.set(0.5);
    this.overlay.addChild(countdown);
    return {
      root,
      warning,
      ring,
      countdown,
      rock,
      flames,
      shockwave,
      echo,
      waveBand,
      waveGeometry,
      debris,
    };
  }

  private updateMeteors(state: GameState): void {
    const ids = new Set(state.meteors.map((meteor) => meteor.id));
    for (const [id, entry] of this.meteors)
      if (!ids.has(id)) {
        entry.root.destroy({ children: true });
        entry.countdown.destroy();
        entry.waveGeometry.destroy(true);
        this.meteors.delete(id);
      }
    for (const meteor of state.meteors) {
      let entry = this.meteors.get(meteor.id);
      if (!entry) {
        entry = this.makeMeteor(meteor);
        this.meteors.set(meteor.id, entry);
      }
      entry.root.position.set(meteor.x, 0, meteor.z);
      const warning = meteor.phase === "warning";
      const age = Math.max(0, meteor.impactAge);
      entry.warning.visible = warning;
      entry.ring.material = this.assets.material(
        Math.sin(this.time * 12) > 0 ? 0xff8872 : 0xffbc81,
        { glow: 0.65 },
      );
      // The danger outline stays fixed; only its color pulses, keeping the impact area legible.
      entry.ring.scale.set(meteor.radius, 1, meteor.radius);
      const visibleFallTime = 0.65;
      entry.rock.visible = warning && meteor.timeToImpact <= visibleFallTime;
      const fallProgress = 1 - Math.max(0, Math.min(1, meteor.timeToImpact / visibleFallTime));
      entry.rock.y = 0.62 + 10 * (1 - fallProgress * fallProgress);
      entry.rock.rotation.y = this.time * 3 + meteor.id;
      for (let i = 0; i < entry.flames.length; i++) {
        entry.flames[i]!.scale.y =
          (i === 0 ? 1.9 : 1.45) * (1 + Math.sin(this.time * 25 + i) * 0.08);
      }
      // Exact simulation band: starts at blast radius, expands 3.2 units in 0.65 s.
      const waveRadius = meteor.radius + Math.min(1, age / 0.65) * 3.2;
      entry.shockwave.visible =
        entry.echo.visible =
        entry.waveBand.visible =
          !warning && age <= 0.9;
      entry.waveGeometry.setRadius(waveRadius, 0.4);
      entry.shockwave.scale.set(waveRadius + 0.4, 2.2, waveRadius + 0.4);
      entry.echo.scale.set(Math.max(0.01, waveRadius - 0.4), 1.3, Math.max(0.01, waveRadius - 0.4));
      for (let i = 0; i < entry.debris.length; i++) {
        const shard = entry.debris[i]!;
        shard.visible = !warning && age < 1;
        const angle = (i / entry.debris.length) * TAU + meteor.id * 0.7;
        const distance = age * (1.5 + (i % 2) * 0.5);
        shard.position.set(
          Math.sin(angle) * distance,
          Math.max(0.08, 0.25 + age * 3.5 - age * age * 5),
          Math.cos(angle) * distance,
        );
        shard.rotation.set(age * 5 + i, age * 4, age * 3);
        shard.scale.set(Math.max(0.015, 0.16 * (1 - age)));
      }
      const point = this.view.worldToScreen({ x: meteor.x, y: warning ? 0.45 : 0.85, z: meteor.z });
      entry.countdown.visible = point !== null && (warning || age < 0.45);
      entry.countdown.text = warning ? `${Math.max(0, meteor.timeToImpact).toFixed(1)} s` : "JUMP!";
      entry.countdown.style.fill = warning ? 0xfff4d0 : 0xffffff;
      entry.countdown.scale.set(Math.max(0.78, Math.min(1, this.width / 900)));
      if (point) entry.countdown.position.set(point.x, point.y);
    }
  }

  private makeSafeZone(): SafeZoneView {
    const a = this.assets;
    const root = new Container3D();
    const next = new Container3D();
    const arrow = new Container3D();
    root.addChild(next, arrow);
    this.scene.addChild(root);
    const geometry = new DynamicRingGeometry(96);
    const current = a.mesh(root, geometry, a.material(0x56d7bb, { glow: 0.45 }), 0, 0.055, 0);
    const dashes: Mesh3D[] = [];
    for (let i = 0; i < 40; i++) {
      dashes.push(a.box(next, a.material(0xfff6d0, { glow: 0.5 }), 0, 0.07, 0, 0.1, 0.045, 1));
    }
    for (let i = 0; i < 3; i++)
      for (const side of [-1, 1]) {
        const mark = a.box(
          arrow,
          a.material(0xfff6d0, { glow: 0.3 }),
          side * 0.14,
          0.07,
          i * 0.65,
          0.075,
          0.025,
          0.38,
        );
        mark.rotation.y = (-side * Math.PI) / 4;
      }
    const label = new Text({
      text: "",
      style: {
        fontFamily: 'Arial, "Noto Sans JP", sans-serif',
        fontWeight: "800",
        fontSize: 17,
        fill: 0xfff5cc,
        stroke: { color: 0x526c78, width: 4, join: "round" },
        align: "center",
      },
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });
    label.anchor.set(0.5);
    this.labels.addChild(label);
    return { root, current, geometry, next, dashes, arrow, label };
  }

  private updateSafeZone(state: GameState): void {
    const zone = state.safeZone;
    if (!zone) {
      if (this.safeZoneView) {
        this.safeZoneView.root.visible = false;
        this.safeZoneView.label.visible = false;
      }
      return;
    }
    this.safeZoneView ??= this.makeSafeZone();
    const entry = this.safeZoneView;
    entry.root.visible = true;
    entry.geometry.setRadius(zone.radius, 0.075);
    entry.current.position.set(zone.x, 0.055, zone.z);
    // During the opening grace period the circle covers every floor tile.
    entry.current.visible = zone.wave > 0;
    const showNext = zone.phase === "warning" || zone.phase === "moving";
    entry.next.visible = showNext;
    entry.next.position.set(zone.targetX, 0, zone.targetZ);
    for (let i = 0; i < entry.dashes.length; i++) {
      const angle = (i / entry.dashes.length) * TAU;
      const dash = entry.dashes[i]!;
      dash.position.set(
        Math.sin(angle) * zone.targetRadius,
        0.07,
        Math.cos(angle) * zone.targetRadius,
      );
      dash.rotation.y = angle + Math.PI / 2;
      dash.scale.z = ((zone.targetRadius * TAU) / entry.dashes.length) * 0.6;
    }
    const dx = zone.targetX - zone.x;
    const dz = zone.targetZ - zone.z;
    const distance = Math.hypot(dx, dz);
    entry.arrow.visible = showNext && distance > 0.8;
    entry.arrow.position.set(zone.x, 0, zone.z);
    entry.arrow.rotation.y = Math.atan2(dx, dz);
    entry.arrow.scale.z = Math.min(1.5, distance / 2);
    entry.label.text = showNext
      ? `NEXT · ${zone.timer.toFixed(1)}s`
      : zone.wave > 0
        ? "SAFE"
        : "ALL SAFE";
    const point = this.view.worldToScreen({
      x: showNext ? zone.targetX : zone.x,
      y: 0.18,
      z:
        (showNext ? zone.targetZ : zone.z) -
        (showNext ? zone.targetRadius : Math.min(6, zone.radius)) * 0.7,
    });
    entry.label.visible = point !== null;
    entry.label.style.fill = showNext ? 0xfff5cc : 0x97ffe0;
    entry.label.scale.set(Math.max(0.8, Math.min(1, this.width / 900)));
    if (point) entry.label.position.set(point.x, point.y);
  }

  private updateFighter(fighter: Fighter, state: GameState, dt: number): void {
    let entry = this.fighters.get(fighter.id);
    const cosmeticsKey = appearanceKey(fighter.appearance);
    if (entry && (entry.color !== fighter.color || entry.appearance !== cosmeticsKey)) {
      entry.creature.destroy();
      entry.label.destroy();
      this.fighters.delete(fighter.id);
      entry = undefined;
    }
    if (!entry) {
      const creature = new CreatureMesh(
        fighter.color,
        fighter.isPlayer,
        this.assets,
        this.scene,
        fighter.appearance,
      );
      const label = new Text({
        text: "",
        style: {
          fontFamily: 'Arial, "Noto Sans JP", sans-serif',
          fontWeight: "800",
          fontSize: fighter.isPlayer ? 18 : 13,
          fill: 0xffffff,
          stroke: { color: 0x35334d, width: fighter.isPlayer ? 4 : 3, join: "round" },
          align: "center",
        },
        resolution: Math.min(window.devicePixelRatio || 1, 2),
      });
      label.anchor.set(0.5, 1);
      this.labels.addChild(label);
      entry = { creature, label, color: fighter.color, appearance: cosmeticsKey };
      this.fighters.set(fighter.id, entry);
    }
    const col = Math.round(fighter.x / TILE_SIZE);
    const row = Math.round(fighter.z / TILE_SIZE);
    entry.creature.update(fighter, this.time, dt, this.floorLookup.get(`${col}/${row}`) === true);
    const point = this.view.worldToScreen({
      x: fighter.x,
      y: fighter.y + (fighter.isPlayer ? 2.3 : 1.65),
      z: fighter.z,
    });
    entry.label.visible =
      fighter.alive && point !== null && (state.phase !== "lobby" || fighter.isPlayer);
    if (point) {
      const player = state.fighters[0];
      const close = player && Math.hypot(player.x - fighter.x, player.z - fighter.z) < 3.5;
      const name = fighter.isPlayer
        ? "YOU  "
        : close && state.options.playerCount <= 12
          ? `${fighter.name}  `
          : "";
      const zoneCountdown =
        fighter.isPlayer && fighter.outsideZoneTime > 0 && state.safeZone
          ? ` · ${Math.max(0, state.safeZone.outsideLimit - fighter.outsideZoneTime).toFixed(1)}s`
          : "";
      entry.label.text = `${name}${Math.floor(fighter.damage)}%${zoneCountdown}`;
      entry.label.style.fill =
        fighter.outsideZoneTime > 0 || fighter.damage >= 120
          ? 0xff9d90
          : fighter.damage >= 70
            ? 0xffdc98
            : 0xffffff;
      entry.label.position.set(point.x, point.y);
      const scale = Math.min(1, Math.max(0.72, this.width / 850));
      entry.label.scale.set(scale);
    }
  }

  private updateBumper(bumper: Bumper): void {
    const a = this.assets;
    let entry = this.bumpers.get(bumper.id);
    if (!entry) {
      const root = new Container3D();
      this.scene.addChild(root);
      const material = a.material(0x8783b7);
      a.mesh(root, a.cylinder, material, 0, 0.13, 0, bumper.radius, 0.26, bumper.radius);
      const cap = a.ball(
        root,
        a.material(0xefabc8, { roughness: 0.4 }),
        0,
        0.31,
        0,
        bumper.radius * 0.83,
        0.27,
        bumper.radius * 0.83,
      );
      const halo = a.mesh(
        root,
        a.ring,
        a.material(0xffdea4, { glow: 0.45 }),
        0,
        0.31,
        0,
        bumper.radius * 0.85,
      );
      a.mesh(root, a.disc, a.material(0x4e4182, { alpha: 0.18 }), 0, 0.02, 0, bumper.radius * 1.2);
      entry = { root, cap, halo };
      this.bumpers.set(bumper.id, entry);
    }
    entry.root.position.set(bumper.x, 0, bumper.z);
    const pulse = Math.max(0, Math.min(1, bumper.pulse));
    entry.root.scale.set(1 + pulse * 0.18, 1 - pulse * 0.2, 1 + pulse * 0.18);
    entry.halo.rotation.y = this.time;
    entry.cap.y = 0.31 + Math.sin(this.time * 2 + bumper.id) * 0.015;
    entry.root.visible =
      this.floorLookup.get(
        `${Math.round(bumper.x / TILE_SIZE)}/${Math.round(bumper.z / TILE_SIZE)}`,
      ) === true;
  }

  private makeItem(color: number): ItemView {
    const a = this.assets;
    const root = new Container3D();
    this.scene.addChild(root);
    const gold = a.material(color, { roughness: 0.4, glow: 0.22 });
    a.ball(root, gold, 0, 0, 0, 0.26, 0.26, 0.26, true);
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * TAU;
      const spike = a.mesh(
        root,
        a.cone,
        gold,
        Math.sin(angle) * 0.24,
        Math.cos(angle) * 0.24,
        0,
        0.12,
        0.25,
        0.12,
      );
      spike.rotation.z = -angle;
    }
    const halo = a.mesh(root, a.ring, a.material(0xfff6d6, { glow: 0.35 }), 0, 0, 0, 0.47);
    halo.rotation.x = Math.PI / 2;
    return { root, halo, color };
  }

  private updatePickup(pickup: Pickup): void {
    let entry = this.pickups.get(pickup.id);
    if (!entry) {
      entry = this.makeItem(0xffc96d);
      this.pickups.set(pickup.id, entry);
    }
    entry.root.visible = pickup.active && this.supported(pickup.x, pickup.z);
    entry.root.position.set(
      pickup.x,
      pickup.y + 0.25 + Math.sin(this.time * 3 + pickup.id) * 0.12,
      pickup.z,
    );
    entry.root.rotation.y = this.time * 1.2;
    entry.halo.rotation.z = this.time * 0.6;
  }

  private updateProjectile(projectile: Projectile): void {
    let entry = this.projectiles.get(projectile.id);
    if (entry && entry.color !== projectile.color) {
      entry.root.destroy({ children: true });
      this.projectiles.delete(projectile.id);
      entry = undefined;
    }
    if (!entry) {
      entry = this.makeItem(projectile.color);
      this.projectiles.set(projectile.id, entry);
    }
    entry.root.position.set(projectile.x, projectile.y, projectile.z);
    entry.root.rotation.set(this.time * 5, this.time * 7, this.time * 3);
    const size = projectile.reflections > 0 ? 1.25 : 1;
    entry.root.scale.set(size);
    entry.halo.visible = projectile.reflections > 0;
  }

  private updateEvent(event: GameEvent): void {
    const lifetime = event.kind === "eliminate" ? 1.1 : 0.65;
    if (event.age > lifetime || ["start", "finish", "collapse", "throw"].includes(event.kind))
      return;
    let entry = this.effects.get(event.id);
    if (!entry) {
      const root = new Container3D();
      const particles: Mesh3D[] = [];
      this.scene.addChild(root);
      const count =
        event.kind === "eliminate" ? 10 : event.kind === "hit" || event.kind === "reflect" ? 6 : 4;
      const color =
        event.kind === "reflect"
          ? 0xffef9d
          : event.kind === "roll" || event.kind === "jump"
            ? 0xffffff
            : event.color;
      for (let i = 0; i < count; i++) {
        const shard = this.assets.mesh(
          root,
          this.assets.smallSphere,
          this.assets.material(i % 3 === 0 ? 0xffffff : color, { glow: 0.6 }),
          0,
          0,
          0,
          0.08,
          0.16,
          0.08,
        );
        particles.push(shard);
      }
      const message =
        event.kind === "reflect"
          ? "REFLECT!"
          : event.kind === "hit" && event.amount
            ? `+${Math.round(event.amount)}%`
            : "";
      const text = message
        ? new Text({
            text: message,
            style: {
              fontFamily: "Arial, sans-serif",
              fontSize: event.kind === "reflect" ? 19 : 16,
              fontWeight: "900",
              fill: event.kind === "reflect" ? 0xffec9c : 0xffffff,
              stroke: { color: 0x514365, width: 3, join: "round" },
            },
          })
        : null;
      if (text) {
        text.anchor.set(0.5);
        this.overlay.addChild(text);
      }
      entry = { root, particles, text };
      this.effects.set(event.id, entry);
    }
    const t = event.age;
    entry.root.position.set(event.x, event.y + 0.3, event.z);
    for (let i = 0; i < entry.particles.length; i++) {
      const particle = entry.particles[i]!;
      const angle = (i / entry.particles.length) * TAU + event.id;
      const distance = t * (event.kind === "eliminate" ? 4 : 2.6);
      const y =
        event.kind === "jump" || event.kind === "roll"
          ? Math.sin((t * Math.PI) / lifetime) * 0.1
          : t * 3 - t * t * 4;
      particle.position.set(Math.cos(angle) * distance, y, Math.sin(angle) * distance);
      particle.rotation.set(angle + t * 6, t * 4, angle);
      const size = Math.max(0.005, 0.1 * (1 - t / lifetime));
      particle.scale.set(size, size * 2.5, size);
    }
    if (entry.text) {
      const position = this.view.worldToScreen({
        x: event.x,
        y: event.y + 1.5 + t * 1.8,
        z: event.z,
      });
      entry.text.visible = position !== null;
      if (position) entry.text.position.set(position.x, position.y);
      entry.text.alpha = Math.max(0, 1 - t / lifetime);
    }
  }

  render(state: GameState, dt: number): void {
    if (this.destroyed) return;
    this.syncArena(state);
    this.time += state.phase === "paused" ? 0 : Math.min(dt, 0.05);
    const shake = Math.min(0.16, Math.max(0, state.shake) * 0.12);
    this.view.camera.position.set(
      CAMERA_X * this.cameraScale + Math.sin(this.time * 73) * shake,
      CAMERA_Y * this.cameraScale + Math.cos(this.time * 91) * shake,
      CAMERA_Z * this.cameraScale,
    );
    this.view.camera.lookAt({ x: 0, y: -1.2, z: 0 });
    for (const cloud of this.clouds) {
      cloud.root.position.set(
        cloud.x + Math.sin(this.time * 0.055 + cloud.phase) * 1.8,
        cloud.y + Math.sin(this.time * 0.17 + cloud.phase) * 0.15,
        cloud.z,
      );
    }
    this.updateTiles(state);
    this.updateSafeZone(state);
    this.updateSpinners(state);
    this.updateHammers(state);
    this.updateMeteors(state);
    const fighterIds = new Set(state.fighters.map((f) => f.id));
    for (const [id, entry] of this.fighters) {
      if (!fighterIds.has(id)) {
        entry.creature.destroy();
        entry.label.destroy();
        this.fighters.delete(id);
      }
    }
    for (const fighter of state.fighters) this.updateFighter(fighter, state, dt);
    const bumperIds = new Set(state.bumpers.map((bumper) => bumper.id));
    for (const [id, entry] of this.bumpers)
      if (!bumperIds.has(id)) {
        entry.root.destroy({ children: true });
        this.bumpers.delete(id);
      }
    const pickupIds = new Set(state.pickups.map((pickup) => pickup.id));
    for (const [id, entry] of this.pickups)
      if (!pickupIds.has(id)) {
        entry.root.destroy({ children: true });
        this.pickups.delete(id);
      }
    for (const bumper of state.bumpers) this.updateBumper(bumper);
    for (const pickup of state.pickups) this.updatePickup(pickup);
    const projectileIds = new Set(state.projectiles.map((p) => p.id));
    for (const [id, entry] of this.projectiles) {
      if (!projectileIds.has(id)) {
        entry.root.destroy({ children: true });
        this.projectiles.delete(id);
      }
    }
    for (const projectile of state.projectiles) this.updateProjectile(projectile);
    const activeEvents = state.events
      .filter((e) => e.age < (e.kind === "eliminate" ? 1.1 : 0.65))
      .slice(-28);
    const eventIds = new Set(activeEvents.map((e) => e.id));
    for (const [id, entry] of this.effects) {
      if (!eventIds.has(id)) {
        entry.root.destroy({ children: true });
        entry.text?.destroy();
        this.effects.delete(id);
      }
    }
    for (const event of activeEvents) this.updateEvent(event);
    this.app.render();
  }

  resize(): void {
    if (this.destroyed) return;
    this.width = Math.max(1, this.host.clientWidth || 1280);
    this.height = Math.max(1, this.host.clientHeight || 720);
    this.app.renderer.resize(this.width, this.height);
    this.background.width = this.width;
    this.background.height = this.height;
    this.view.width = this.width;
    this.view.height = this.height;
    const aspect = this.width / this.height;
    // Keep all four edges visible; portrait devices widen the shot without changing control yaw.
    this.cameraScale = (this.arenaSize / 19.8) * Math.max(1.12, 1.35 / aspect);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.resizeObserver.disconnect();
    this.view.destroy({ children: true });
    for (const entry of this.meteors.values()) entry.waveGeometry.destroy(true);
    this.safeZoneView?.geometry.destroy(true);
    this.assets.destroy();
    this.skyTexture.destroy(true);
    this.app.destroy(true, { children: true });
  }
}
