import {
  Container3D,
  CubeGeometry,
  CylinderGeometry,
  Geometry3D,
  Material3D,
  Mesh3D,
  SphereGeometry,
  TorusGeometry,
} from "@pixi/3d";
import type { Fighter, FighterAppearance } from "./types";

const TAU = Math.PI * 2;

/** Shared geometry and materials keep the 24 creatures inexpensive to draw. */
export class ArenaMeshes {
  readonly cube = new CubeGeometry();
  readonly sphere = new SphereGeometry({ radius: 1, widthSegments: 16, heightSegments: 10 });
  readonly smallSphere = new SphereGeometry({ radius: 1, widthSegments: 10, heightSegments: 6 });
  readonly cylinder = new CylinderGeometry({
    radiusTop: 1,
    radiusBottom: 1,
    height: 1,
    radialSegments: 16,
  });
  readonly cone = new CylinderGeometry({
    radiusTop: 0,
    radiusBottom: 1,
    height: 1,
    radialSegments: 5,
  });
  readonly ring = new TorusGeometry({
    radius: 1,
    tube: 0.035,
    radialSegments: 4,
    tubularSegments: 32,
  });
  readonly accessoryRing = new TorusGeometry({
    radius: 1,
    tube: 0.11,
    radialSegments: 5,
    tubularSegments: 24,
  });
  readonly arc = makeArc();
  readonly disc = makeDisc();
  private readonly materials = new Map<string, Material3D>();

  material(
    color: number,
    options: { alpha?: number; glow?: number; roughness?: number } = {},
  ): Material3D {
    const { alpha = 1, glow = 0, roughness = 0.65 } = options;
    const key = `${color}/${alpha}/${glow}/${roughness}`;
    let material = this.materials.get(key);
    if (!material) {
      material = new Material3D({
        baseColor: color,
        roughness,
        metallic: 0,
        ...(alpha < 1 ? { alphaMode: "blend" as const, alpha, doubleSided: true } : {}),
        ...(glow > 0 ? { emissive: { color, strength: glow }, doubleSided: true } : {}),
      });
      this.materials.set(key, material);
    }
    return material;
  }

  mesh(
    parent: Container3D,
    geometry: Geometry3D,
    material: Material3D,
    x = 0,
    y = 0,
    z = 0,
    sx = 1,
    sy = sx,
    sz = sx,
  ): Mesh3D {
    const mesh = new Mesh3D({ geometry, material, castShadow: false, receiveShadow: false });
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    parent.addChild(mesh);
    return mesh;
  }

  ball(
    parent: Container3D,
    material: Material3D,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy = sx,
    sz = sx,
    small = false,
  ): Mesh3D {
    return this.mesh(parent, small ? this.smallSphere : this.sphere, material, x, y, z, sx, sy, sz);
  }

  box(
    parent: Container3D,
    material: Material3D,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ): Mesh3D {
    return this.mesh(parent, this.cube, material, x, y, z, sx, sy, sz);
  }

  destroy(): void {
    for (const material of this.materials.values()) material.destroy();
    for (const geometry of [
      this.cube,
      this.sphere,
      this.smallSphere,
      this.cylinder,
      this.cone,
      this.ring,
      this.accessoryRing,
      this.arc,
      this.disc,
    ]) {
      geometry.destroy(true);
    }
    this.materials.clear();
  }
}

/** One small reusable dynamic annulus per meteor, with an exact world-space danger band. */
export class DynamicRingGeometry extends Geometry3D {
  private readonly vertices: Float32Array;
  private readonly segmentCount: number;

  constructor(segments = 64) {
    const vertices = new Float32Array((segments + 1) * 6);
    const normals = new Float32Array(vertices.length);
    const indices: number[] = [];
    for (let i = 0; i <= segments; i++) {
      normals[i * 6 + 1] = normals[i * 6 + 4] = 1;
      if (i < segments) {
        const v = i * 2;
        indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
    super({ positions: vertices, normals, indices: new Uint16Array(indices), dynamic: true });
    this.vertices = vertices;
    this.segmentCount = segments;
    this.setRadius(1, 0.1);
  }

  setRadius(radius: number, halfWidth: number): void {
    for (let i = 0; i <= this.segmentCount; i++) {
      const angle = (i / this.segmentCount) * TAU;
      for (let side = 0; side < 2; side++) {
        const distance = Math.max(0, radius + (side ? halfWidth : -halfWidth));
        const index = i * 6 + side * 3;
        this.vertices[index] = Math.sin(angle) * distance;
        this.vertices[index + 2] = Math.cos(angle) * distance;
      }
    }
    this.attributes.aPosition!.buffer.update();
  }
}

function makeArc(): Geometry3D {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const segments = 30;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = t * Math.PI * 1.55;
    const thickness = Math.sin(t * Math.PI) * 0.25 + 0.01;
    for (const radius of [1 - thickness, 1]) {
      positions.push(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
      normals.push(0, 1, 0);
    }
    if (i < segments) {
      const v = i * 2;
      indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  }
  return new Geometry3D({
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  });
}

function makeDisc(): Geometry3D {
  const positions = [0, 0, 0];
  const normals = [0, 1, 0];
  const indices: number[] = [];
  for (let i = 0; i <= 24; i++) {
    positions.push(Math.sin((i / 24) * TAU), 0, Math.cos((i / 24) * TAU));
    normals.push(0, 1, 0);
    if (i < 24) indices.push(0, i + 1, i + 2);
  }
  return new Geometry3D({
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  });
}

/** Original head-and-feet creature; the long curved tail is its weapon. */
export class CreatureMesh {
  readonly root = new Container3D();
  readonly shadow: Mesh3D;
  readonly marker: Mesh3D;
  readonly arrow: Mesh3D;
  private readonly model = new Container3D();
  private readonly tail = new Container3D();
  private readonly leftFoot: Mesh3D;
  private readonly rightFoot: Mesh3D;
  private readonly eyes: Mesh3D[] = [];
  private readonly skinParts: Mesh3D[] = [];
  private readonly swish: Mesh3D;
  private readonly swishEdge: Mesh3D;
  private readonly heldItem = new Container3D();
  private readonly skin: Material3D;
  private readonly flash: Material3D;
  private walkPhase = 0;

  constructor(
    readonly color: number,
    isPlayer: boolean,
    private readonly assets: ArenaMeshes,
    scene: Container3D,
    appearance: FighterAppearance,
  ) {
    const skin = (this.skin = assets.material(color, { roughness: 0.42 }));
    const footColor = appearance.shoeColor;
    const feet = assets.material(footColor, { roughness: 0.5 });
    const white = assets.material(0xfffdf5);
    const ink = assets.material(0x202447, { roughness: 0.8 });
    const cheek = assets.material(0xff9db2);
    const gold = assets.material(0xffcc6b, { roughness: 0.4 });
    this.flash = assets.material(0xfff7ec, { glow: 0.7 });

    scene.addChild(this.root);
    this.root.addChild(this.model);
    this.model.y = 0.72;
    this.skinParts.push(assets.ball(this.model, skin, 0, 0, 0, 0.62, 0.61, 0.57));
    // An inset ivory belly and oversized feet make the silhouette readable at arena scale.
    assets.ball(
      this.model,
      assets.material(mix(color, 0xffffff, 0.65)),
      0,
      -0.22,
      0.455,
      0.35,
      0.25,
      0.095,
    );
    this.leftFoot = assets.ball(this.model, feet, -0.32, -0.57, 0.18, 0.27, 0.16, 0.36, true);
    this.rightFoot = assets.ball(this.model, feet, 0.32, -0.57, 0.18, 0.27, 0.16, 0.36, true);
    for (const sign of [-1, 1]) {
      const eye = assets.ball(
        this.model,
        white,
        sign * 0.205,
        0.13,
        0.511,
        0.15,
        0.205,
        0.105,
        true,
      );
      this.eyes.push(eye);
      const pupil = assets.ball(
        this.model,
        ink,
        sign * 0.205,
        0.12,
        0.595,
        0.068,
        0.105,
        0.045,
        true,
      );
      this.eyes.push(pupil);
      assets.ball(this.model, white, sign * 0.205 - 0.019, 0.161, 0.631, 0.023, 0.033, 0.018, true);
      assets.ball(this.model, cheek, sign * 0.38, -0.065, 0.457, 0.105, 0.055, 0.028, true);
    }
    assets.ball(this.model, ink, 0, -0.095, 0.579, 0.057, 0.037, 0.026, true);
    // Small forehead tuft gives these creatures their own identity.
    this.skinParts.push(assets.ball(this.model, skin, -0.07, 0.55, -0.02, 0.14, 0.15, 0.13, true));
    this.skinParts.push(assets.ball(this.model, skin, 0.11, 0.55, -0.03, 0.11, 0.12, 0.1, true));
    this.model.addChild(this.tail);
    this.tail.position.set(0, -0.07, -0.42);
    const segments = [
      [0, 0, -0.14, 0.22],
      [0.1, 0.005, -0.4, 0.21],
      [0.28, 0.07, -0.64, 0.18],
      [0.48, 0.17, -0.83, 0.15],
      [0.63, 0.29, -0.97, 0.12],
    ];
    for (const [x, y, z, radius] of segments) {
      this.skinParts.push(
        assets.ball(this.tail, skin, x!, y!, z!, radius!, radius!, radius! * 1.4, true),
      );
    }
    assets.ball(
      this.tail,
      assets.material(appearance.tailTipColor, { roughness: 0.4 }),
      0.7,
      0.4,
      -1.05,
      0.19,
      0.24,
      0.21,
      true,
    );
    this.buildAccessory(appearance);

    this.shadow = assets.mesh(
      scene,
      assets.disc,
      assets.material(0x4e4182, { alpha: 0.22 }),
      0,
      0.023,
      0,
      0.7,
      1,
      0.58,
    );
    this.marker = assets.mesh(
      scene,
      assets.ring,
      assets.material(0xffffff, { glow: 0.45 }),
      0,
      0.04,
      0,
      0.81,
    );
    this.marker.visible = isPlayer;
    this.arrow = assets.mesh(
      scene,
      assets.cone,
      assets.material(0xffe17c, { glow: 0.5 }),
      0,
      2.1,
      0,
      0.13,
      0.24,
      0.13,
    );
    this.arrow.rotation.z = Math.PI;
    this.arrow.visible = isPlayer;

    this.swish = assets.mesh(
      this.root,
      assets.arc,
      assets.material(color, { alpha: 0.55, glow: 0.9 }),
      0,
      0.55,
      0,
      1.9,
    );
    this.swishEdge = assets.mesh(
      this.root,
      assets.arc,
      assets.material(0xfff6cf, { alpha: 0.9, glow: 0.6 }),
      0,
      0.57,
      0,
      1.75,
    );
    this.swish.visible = this.swishEdge.visible = false;
    this.model.addChild(this.heldItem);
    this.heldItem.position.set(0, 0.93, 0);
    assets.ball(this.heldItem, gold, 0, 0, 0, 0.24, 0.24, 0.24, true);
    const itemRing = assets.mesh(this.heldItem, assets.ring, white, 0, 0, 0, 0.31);
    itemRing.rotation.x = Math.PI / 2;
    this.heldItem.visible = false;
  }

  private buildAccessory(appearance: FighterAppearance): void {
    const a = this.assets;
    const color = a.material(appearance.accessoryColor, { roughness: 0.45 });
    const dark = a.material(0x29354f, { roughness: 0.6 });
    switch (appearance.accessory) {
      case "glasses": {
        const lens = a.material(0xb4e8ef, { alpha: 0.22, roughness: 0.22 });
        for (const side of [-1, 1]) {
          const frame = a.mesh(
            this.model,
            a.accessoryRing,
            color,
            side * 0.205,
            0.13,
            0.635,
            0.18,
            0.9,
            0.21,
          );
          frame.rotation.x = Math.PI / 2;
          const glass = a.mesh(this.model, a.disc, lens, side * 0.205, 0.13, 0.639, 0.15, 1, 0.18);
          glass.rotation.x = Math.PI / 2;
          a.box(this.model, color, side * 0.375, 0.13, 0.47, 0.045, 0.045, 0.34);
        }
        a.box(this.model, color, 0, 0.17, 0.645, 0.095, 0.045, 0.045);
        break;
      }
      case "visor": {
        // A rounded sun visor shades the eyes without hiding their expressions.
        a.mesh(this.model, a.cylinder, color, 0, 0.39, 0, 0.52, 0.085, 0.5);
        a.ball(this.model, color, 0, 0.34, 0.44, 0.51, 0.07, 0.33, true);
        a.ball(this.model, a.material(0xfff8ec), 0.19, 0.405, 0.54, 0.07, 0.018, 0.055, true);
        break;
      }
      case "headband": {
        a.mesh(this.model, a.cylinder, color, 0, 0.34, 0, 0.55, 0.105, 0.52);
        a.ball(this.model, color, 0.48, 0.35, -0.19, 0.13, 0.12, 0.12, true);
        const ribbon = a.box(this.model, color, 0.52, 0.2, -0.25, 0.1, 0.32, 0.035);
        ribbon.rotation.z = -0.35;
        break;
      }
      case "headphones": {
        const hoop = a.mesh(this.model, a.accessoryRing, color, 0, 0.035, -0.025, 0.66, 1.1, 0.65);
        hoop.rotation.x = Math.PI / 2;
        for (const side of [-1, 1]) {
          a.ball(this.model, dark, side * 0.59, 0.08, 0.02, 0.13, 0.23, 0.2, true);
          a.ball(this.model, color, side * 0.68, 0.08, 0.02, 0.12, 0.21, 0.18, true);
          a.ball(
            this.model,
            a.material(0xfff5e4),
            side * 0.77,
            0.08,
            0.02,
            0.025,
            0.08,
            0.08,
            true,
          );
        }
        break;
      }
      case "bow": {
        for (const side of [-1, 1]) {
          const loop = a.ball(this.model, color, side * 0.16, 0.65, 0.19, 0.23, 0.14, 0.095, true);
          loop.rotation.z = side * 0.35;
        }
        a.ball(this.model, color, 0, 0.64, 0.21, 0.09, 0.11, 0.1, true);
        break;
      }
      case "none":
        break;
    }
  }

  update(f: Fighter, time: number, dt: number, onFloor: boolean): void {
    const p = f.actionDuration > 0 ? Math.min(1, f.actionTime / f.actionDuration) : 0;
    const speed = Math.hypot(f.vx, f.vz);
    const moving = speed > 0.25 && f.grounded;
    this.walkPhase += dt * (moving ? Math.min(21, speed * 3.4) : 2.5);
    const step = moving ? Math.sin(this.walkPhase) : 0;
    const idle = Math.sin(time * 2.5 + f.id * 0.8);
    const strong = f.action === "strong";
    const rolling = f.action === "roll";
    const attacking = strong || f.action === "weak" || f.action === "air";
    const swing = Math.sin(Math.min(1, p / 0.85) * Math.PI);
    this.root.visible = f.alive;
    this.root.position.set(f.x, f.y, f.z);
    this.root.rotation.y = f.facing;
    this.model.rotation.set(
      rolling ? p * TAU * 1.4 : !f.grounded ? -0.12 : -Math.abs(step) * 0.07,
      strong ? p * TAU * 1.45 : 0,
      moving ? step * 0.075 : idle * 0.025,
    );
    this.model.position.set(
      0,
      0.72 + (f.grounded ? Math.abs(step) * 0.05 + idle * 0.015 : 0),
      f.action === "weak" ? swing * 0.28 : 0,
    );
    const stretch = rolling
      ? -0.08
      : f.grounded
        ? -Math.abs(step) * 0.04
        : Math.min(0.16, Math.abs(f.vy) * 0.014);
    this.model.scale.set(1 - stretch * 0.5, 1 + stretch, 1 - stretch * 0.5);
    this.leftFoot.position.y = -0.57 + Math.max(0, step) * 0.2;
    this.rightFoot.position.y = -0.57 + Math.max(0, -step) * 0.2;
    this.leftFoot.position.z = 0.18 + step * 0.12;
    this.rightFoot.position.z = 0.18 - step * 0.12;
    this.leftFoot.rotation.x = step * 0.35;
    this.rightFoot.rotation.x = -step * 0.35;
    this.tail.rotation.y = strong ? -Math.PI * 0.4 : Math.sin(time * 4 + f.id) * 0.24 + step * 0.13;
    this.tail.rotation.x = rolling ? 0.15 : Math.sin(time * 2.3 + f.id) * 0.08;
    this.tail.scale.set(strong ? 1.15 : 1);
    const blink = Math.sin(time * 1.1 + f.id * 2.9) > 0.996 ? 0.14 : 1;
    this.eyes[0]!.scale.y = this.eyes[2]!.scale.y = 0.205 * blink;
    this.eyes[1]!.scale.y = this.eyes[3]!.scale.y = 0.105 * blink;
    const flash = f.action === "hurt" && Math.floor(time * 24) % 2 === 0;
    for (const part of this.skinParts) part.material = flash ? this.flash : this.skin;

    this.shadow.visible = onFloor && f.y >= -0.05 && f.alive;
    this.shadow.position.set(f.x, 0.024, f.z);
    const shadowSize = Math.max(0.35, 1 - Math.max(0, f.y) * 0.09);
    this.shadow.scale.set(0.7 * shadowSize, 1, 0.58 * shadowSize);
    this.marker.visible = f.isPlayer && f.alive && onFloor;
    this.marker.position.set(f.x, 0.045, f.z);
    this.marker.material = this.assets.material(f.outsideZoneTime > 0 ? 0xff9c80 : 0xffffff, {
      glow: 0.45,
    });
    this.marker.scale.set(0.8 + Math.sin(time * 4) * 0.025);
    this.arrow.visible = f.isPlayer && f.alive;
    this.arrow.position.set(f.x, f.y + 1.95 + Math.sin(time * 4) * 0.06, f.z);
    this.swish.visible = this.swishEdge.visible = attacking && p > 0.18 && p < 0.8;
    const arcScale = strong ? 1.95 : f.action === "air" ? 1.5 : 1.08;
    this.swish.scale.set(arcScale);
    this.swishEdge.scale.set(arcScale * 0.95, 1, arcScale * 0.95);
    this.swish.rotation.y = this.swishEdge.rotation.y = p * TAU * (strong ? 1.45 : 0.6) - 1.5;
    this.heldItem.visible = f.item;
    this.heldItem.rotation.y = time * 1.7;
    this.heldItem.y = 0.95 + Math.sin(time * 4) * 0.06;
  }

  destroy(): void {
    this.root.destroy({ children: true });
    this.shadow.destroy();
    this.marker.destroy();
    this.arrow.destroy();
  }
}

export function shade(color: number, factor: number): number {
  return (
    (Math.round(((color >> 16) & 255) * factor) << 16) |
    (Math.round(((color >> 8) & 255) * factor) << 8) |
    Math.round((color & 255) * factor)
  );
}

export function mix(a: number, b: number, amount: number): number {
  const channel = (shift: number) =>
    Math.round(((a >> shift) & 255) * (1 - amount) + ((b >> shift) & 255) * amount);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}
