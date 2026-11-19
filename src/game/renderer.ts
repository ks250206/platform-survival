import { Application, Container, Graphics, RendererType, Sprite, Text, Texture } from "pixi.js";
import type { WebGLRenderer } from "pixi.js";
import { AmbientLight, Container3D, DirectionalLight, Mesh3D, View3D } from "@pixi/3d";
import { ArenaMeshes, CreatureMesh, mix } from "./meshes";
import { GRID_RADIUS, TILE_SIZE } from "./types";
import type { Bumper, Fighter, GameEvent, GameState, Pickup, Projectile, Tile } from "./types";

const TAU = Math.PI * 2;
const CAMERA_X = 18;
const CAMERA_Y = 24;
const CAMERA_Z = 24;
const ARENA_SIZE = (GRID_RADIUS * 2 + 1) * TILE_SIZE;

export { screenToWorldMovement } from "./coordinates";

interface TileView {
  root: Container3D;
  top: Mesh3D;
  original: number;
  accent: Mesh3D | null;
}
interface FighterView {
  creature: CreatureMesh;
  label: Text;
  color: number;
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
  private readonly spinner = new Container3D();
  private readonly spinnerBar: Mesh3D;
  private readonly spinnerStripe: Mesh3D;
  private readonly spinnerCaps: Mesh3D[] = [];
  private readonly hub = new Container3D();
  private readonly hubRing: Mesh3D;
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
    const a = this.assets;
    this.scene.addChild(this.spinner, this.hub);
    const pink = a.material(0xf387b0, { roughness: 0.48 });
    this.spinnerBar = a.mesh(this.spinner, a.cylinder, pink, 0, 0.52, 0, 0.17, 13.6, 0.17);
    this.spinnerBar.rotation.z = Math.PI / 2;
    this.spinnerStripe = a.box(
      this.spinner,
      a.material(0xffd788, { glow: 0.3 }),
      0,
      0.53,
      0.16,
      13.4,
      0.065,
      0.03,
    );
    for (const side of [-1, 1]) {
      const cap = a.mesh(
        this.spinner,
        a.cylinder,
        a.material(0xffe3a0, { roughness: 0.45 }),
        side * 6.8,
        0.52,
        0,
        0.245,
        0.16,
        0.245,
      );
      cap.rotation.z = Math.PI / 2;
      this.spinnerCaps.push(cap);
    }
    a.mesh(this.hub, a.cylinder, a.material(0x67619b), 0, 0.2, 0, 0.7, 0.4, 0.7);
    a.mesh(this.hub, a.cylinder, a.material(0x8979bd), 0, 0.62, 0, 0.53, 0.55, 0.53);
    a.mesh(this.hub, a.cylinder, a.material(0xe5d7fb), 0, 0.92, 0, 0.58, 0.12, 0.58);
    this.hubRing = a.mesh(this.hub, a.ring, a.material(0xffda89, { glow: 0.5 }), 0, 0.9, 0, 0.4);
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * TAU;
      a.ball(
        this.hub,
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

  private tileView(tile: Tile): TileView {
    const a = this.assets;
    const root = new Container3D();
    root.position.set(tile.x, 0, tile.z);
    this.scene.addChild(root);
    const edge = tile.ring === GRID_RADIUS;
    const original = edge
      ? (tile.col + tile.row) % 2
        ? 0xa9d7d8
        : 0xc0e2dd
      : (tile.col + tile.row) % 2
        ? 0xdbd6e9
        : 0xc7c6df;
    a.box(
      root,
      a.material(edge ? 0x8970b7 : 0x9283b9),
      0,
      -0.33,
      0,
      TILE_SIZE - 0.035,
      0.43,
      TILE_SIZE - 0.035,
    );
    const top = a.box(
      root,
      a.material(original),
      0,
      -0.075,
      0,
      TILE_SIZE - 0.07,
      0.15,
      TILE_SIZE - 0.07,
    );
    let accent: Mesh3D | null = null;
    if (edge) {
      accent = a.box(
        root,
        a.material(0xf4c997),
        0,
        -0.43,
        0,
        TILE_SIZE - 0.025,
        0.055,
        TILE_SIZE - 0.025,
      );
    }
    if (tile.kind === "spring") {
      const purple = a.material(0xa289d6);
      a.mesh(root, a.cylinder, a.material(0x6c649d), 0, 0.06, 0, 0.49, 0.12, 0.49);
      a.mesh(root, a.ring, purple, 0, 0.17, 0, 0.39);
      a.mesh(root, a.cylinder, a.material(0xffdf91), 0, 0.24, 0, 0.43, 0.09, 0.43);
      const arrow = a.mesh(root, a.cone, a.material(0xfffaf1), 0, 0.315, 0, 0.13, 0.17, 0.13);
      arrow.rotation.z = 0;
    } else if ((Math.abs(tile.col) + Math.abs(tile.row)) % 4 === 0 && !edge) {
      a.mesh(root, a.disc, a.material(mix(original, 0xffffff, 0.38)), 0, 0.006, 0, 0.065);
    }
    return { root, top, original, accent };
  }

  private updateTiles(state: GameState): void {
    for (const tile of state.tiles) {
      let entry = this.tiles.get(tile.id);
      if (!entry) {
        entry = this.tileView(tile);
        this.tiles.set(tile.id, entry);
      }
      const falling = tile.state === "falling";
      const warning = tile.state === "warning";
      const gone = tile.state === "gone";
      entry.root.visible = !gone;
      this.floorLookup.set(`${tile.col}/${tile.row}`, !gone && !falling);
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
      const warnColor = Math.sin(this.time * 9) > 0 ? 0xffd184 : 0xf6a7a5;
      entry.top.material = this.assets.material(
        warning ? warnColor : falling ? 0xf5b1b6 : entry.original,
      );
      if (entry.accent) entry.accent.material = this.assets.material(warning ? 0xffa37e : 0xf4c997);
    }
  }

  private updateFighter(fighter: Fighter, state: GameState, dt: number): void {
    let entry = this.fighters.get(fighter.id);
    if (entry && entry.color !== fighter.color) {
      entry.creature.destroy();
      entry.label.destroy();
      this.fighters.delete(fighter.id);
      entry = undefined;
    }
    if (!entry) {
      const creature = new CreatureMesh(fighter.color, fighter.isPlayer, this.assets, this.scene);
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
      entry = { creature, label, color: fighter.color };
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
      entry.label.text = `${name}${Math.floor(fighter.damage)}%`;
      entry.label.style.fill =
        fighter.damage >= 120 ? 0xff9d90 : fighter.damage >= 70 ? 0xffdc98 : 0xffffff;
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
    entry.root.visible = pickup.active;
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
    // Engine and Euler Y both define the bar by (cos(angle), -sin(angle)) in XZ.
    this.spinner.rotation.y = state.spinnerAngle;
    this.spinnerBar.scale.y = state.spinnerRadius * 2;
    this.spinnerStripe.scale.x = Math.max(0.1, state.spinnerRadius * 2 - 0.1);
    this.spinnerCaps[0]!.x = -state.spinnerRadius;
    this.spinnerCaps[1]!.x = state.spinnerRadius;
    this.hubRing.rotation.y = state.spinnerAngle;
    this.hub.visible = this.spinner.visible = this.floorLookup.get("0/0") === true;
    const fighterIds = new Set(state.fighters.map((f) => f.id));
    for (const [id, entry] of this.fighters) {
      if (!fighterIds.has(id)) {
        entry.creature.destroy();
        entry.label.destroy();
        this.fighters.delete(id);
      }
    }
    for (const fighter of state.fighters) this.updateFighter(fighter, state, dt);
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
    this.cameraScale = (ARENA_SIZE / 19.8) * Math.max(1.12, 1.35 / aspect);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.resizeObserver.disconnect();
    this.view.destroy({ children: true });
    this.assets.destroy();
    this.skyTexture.destroy(true);
    this.app.destroy(true, { children: true });
  }
}
