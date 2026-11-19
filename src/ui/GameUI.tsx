import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent, ReactNode } from "react";
import { COLORS, DEFAULT_APPEARANCE, DEFAULT_OPTIONS, MAX_STAMINA } from "../game/types";
import type {
  Accessory,
  Difficulty,
  Fighter,
  FighterAppearance,
  GameOptions,
  GameState,
  StageSelection,
} from "../game/types";
import { getRoundPreview, getStageDefinition, STAGES } from "../game/stages";
import type { StageShape } from "../game/stages";
import { ACCESSORIES, ACCENT_COLORS } from "../game/appearance";

type GameAction = "jump" | "weak" | "strong" | "roll" | "throw";
type IconName =
  | "tail"
  | "play"
  | "pause"
  | "sound"
  | "mute"
  | "expand"
  | "help"
  | "close"
  | "clock"
  | "users"
  | "star"
  | "jump"
  | "roll"
  | "hit"
  | "arrow"
  | "home"
  | "retry"
  | "trophy";

export interface GameUIProps {
  state: GameState;
  ready: boolean;
  error: string | null;
  muted: boolean;
  fps: number;
  onStart: (options: Partial<GameOptions>) => void;
  onNextRound: () => void;
  onPreview: (options: Partial<GameOptions>) => void;
  onTogglePause: () => void;
  onHome: () => void;
  onRetry: () => void;
  onToggleMute: () => void;
  onFullscreen: () => void;
  onAction: (action: GameAction) => void;
  onMove: (x: number, y: number) => void;
}

const hex = (color: number) => `#${color.toString(16).padStart(6, "0")}`;
const timeLabel = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    tail: (
      <>
        <path d="M4 16c0-5 5-9 10-8 5 1 5 7 1 8-3 1-5-1-4-3" />
        <path d="m3 13 1 4 4-1" />
        <path d="m19 3 .8 2.2L22 6l-2.2.8L19 9l-.8-2.2L16 6l2.2-.8Z" />
      </>
    ),
    play: <path d="m8 5 11 7-11 7Z" />,
    pause: (
      <>
        <path d="M8 5v14M16 5v14" />
      </>
    ),
    sound: (
      <>
        <path d="m11 4-5 4H3v8h3l5 4Z" />
        <path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" />
      </>
    ),
    mute: (
      <>
        <path d="m11 4-5 4H3v8h3l5 4Z" />
        <path d="m16 9 6 6m0-6-6 6" />
      </>
    ),
    expand: (
      <>
        <path d="M9 3H3v6m12-6h6v6M3 15v6h6m6 0h6v-6" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-1.7.9-1.7 1.2-1.7 2.2" />
        <path d="M12 16.5h.01" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    clock: (
      <>
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l3 2M9 2h6M12 2v3" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5" />
      </>
    ),
    star: <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.4l6.1-.9Z" />,
    jump: (
      <>
        <path d="M12 19V5m-5 5 5-5 5 5M5 20h14" />
      </>
    ),
    roll: (
      <>
        <path d="M5 8a8 8 0 1 1-1 8M4 3v6h6" />
        <path d="M9 15a4 4 0 1 0 3-7" />
      </>
    ),
    hit: (
      <>
        <path d="m8 14-4 7 7-4M13 3l2 5 6-1-4 5 3 5-6-1-3 5-1-7-6-2 6-3Z" />
      </>
    ),
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    home: (
      <>
        <path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7" />
      </>
    ),
    retry: (
      <>
        <path d="M3 10a9 9 0 1 1 2 9M3 4v6h6" />
      </>
    ),
    trophy: (
      <>
        <path d="M8 3h8v8a4 4 0 0 1-8 0ZM8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4M12 15v5m-4 1h8" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function Mascot({
  color,
  className = "",
  appearance = DEFAULT_APPEARANCE,
}: {
  color: number;
  className?: string;
  appearance?: FighterAppearance;
}) {
  return (
    <svg className={`mascot ${className}`} viewBox="0 0 116 95" aria-hidden="true">
      <path
        d="M76 53c20-6 30-21 21-30-8-7-19 1-11 8"
        fill="none"
        stroke="#223842"
        strokeWidth="15"
        strokeLinecap="round"
      />
      <path
        d="M76 53c20-6 30-21 21-30-8-7-19 1-11 8"
        fill="none"
        stroke={hex(color)}
        strokeWidth="10"
        strokeLinecap="round"
      />
      <circle
        cx="86"
        cy="31"
        r="6"
        fill={hex(appearance.tailTipColor)}
        stroke="#223842"
        strokeWidth="2"
      />
      <ellipse
        cx="35"
        cy="81"
        rx="15"
        ry="8"
        fill={hex(appearance.shoeColor)}
        stroke="#223842"
        strokeWidth="2"
        transform="rotate(-12 35 81)"
      />
      <ellipse
        cx="69"
        cy="81"
        rx="15"
        ry="8"
        fill={hex(appearance.shoeColor)}
        stroke="#223842"
        strokeWidth="2"
        transform="rotate(12 69 81)"
      />
      <ellipse cx="52" cy="49" rx="36" ry="34" fill={hex(color)} stroke="#223842" strokeWidth="3" />
      <ellipse cx="40" cy="45" rx="4" ry="8" fill="#223842" />
      <ellipse cx="62" cy="45" rx="4" ry="8" fill="#223842" />
      <circle cx="41" cy="42" r="1.6" fill="white" />
      <circle cx="63" cy="42" r="1.6" fill="white" />
      <ellipse cx="29" cy="59" rx="6" ry="3" fill="#f37e94" opacity=".65" />
      <ellipse cx="73" cy="59" rx="6" ry="3" fill="#f37e94" opacity=".65" />
      <path
        d="M46 61q6 7 12 0"
        fill="none"
        stroke="#223842"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M28 33c4-6 9-9 15-10"
        fill="none"
        stroke="white"
        strokeWidth="5"
        opacity=".45"
        strokeLinecap="round"
      />
      {appearance.accessory === "glasses" && (
        <g fill="none" stroke={hex(appearance.accessoryColor)} strokeWidth="3">
          <circle cx="40" cy="46" r="10" />
          <circle cx="63" cy="46" r="10" />
          <path d="M50 45h3M30 44l-5-2M73 44l5-2" />
        </g>
      )}
      {appearance.accessory === "visor" && (
        <path
          d="M22 33Q52 18 82 34L81 42Q51 29 21 42Z"
          fill={hex(appearance.accessoryColor)}
          stroke="#223842"
          strokeWidth="1.5"
        />
      )}
      {appearance.accessory === "headband" && (
        <g
          fill="none"
          stroke={hex(appearance.accessoryColor)}
          strokeWidth="7"
          strokeLinecap="round"
        >
          <path d="M24 33Q51 18 79 34M23 33l-9 7M23 33l-6-10" />
        </g>
      )}
      {appearance.accessory === "headphones" && (
        <g fill={hex(appearance.accessoryColor)} stroke="#223842" strokeWidth="1.5">
          <path
            d="M18 48V36a34 28 0 0 1 68 0v12"
            fill="none"
            stroke={hex(appearance.accessoryColor)}
            strokeWidth="6"
          />
          <rect x="12" y="42" width="12" height="22" rx="5" />
          <rect x="80" y="42" width="12" height="22" rx="5" />
        </g>
      )}
      {appearance.accessory === "bow" && (
        <g fill={hex(appearance.accessoryColor)} stroke="#223842" strokeWidth="1.5">
          <path d="m70 19-15-8-2 19 17-4 16 10 5-19Z" />
          <circle cx="70" cy="23" r="5" />
        </g>
      )}
    </svg>
  );
}

function IconButton({
  icon,
  label,
  onClick,
  active,
  className = "",
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? "is-active" : ""} ${className}`}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <Icon name={icon} />
    </button>
  );
}

function Dialog({
  title,
  children,
  onDismiss,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    const getButtons = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input, select, summary, [tabindex="0"]',
        ) ?? [],
      );
    getButtons()[0]?.focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => {
      if (event.code === "Escape" && dismissRef.current) {
        event.preventDefault();
        event.stopPropagation();
        dismissRef.current();
      }
      if (event.code !== "Tab") return;
      const elements = getButtons();
      if (!elements.length) {
        event.preventDefault();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || !dialog?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !dialog?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      previous?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div className="modal-overlay">
      <div
        ref={ref}
        className={`dialog panel ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {children}
      </div>
    </div>
  );
}

function ControlsHelp({ onClose }: { onClose: () => void }) {
  const rows: [ReactNode, string, string][] = [
    [
      <>
        <kbd>W A S D</kbd>
        <span className="key-or">/</span>
        <kbd>↑ ← ↓ →</kbd>
      </>,
      "移動",
      "向いている方向に攻撃",
    ],
    [<kbd>SPACE</kbd>, "ジャンプ", "回転棒を飛び越えよう。空中ジャンプなし"],
    [<kbd>J</kbd>, "弱攻撃 / 空中攻撃", "軽い一撃で吹っ飛び％をためる"],
    [<kbd>K</kbd>, "しっぽスピン", "周囲を弾く強攻撃。スターも打ち返せる"],
    [<kbd>SHIFT</kbd>, "ローリング回避", "出だしに短い無敵時間。終わり際に隙"],
    [<kbd>E</kbd>, "スターを投げる", "拾ったスターを向いている方向へ"],
    [<kbd>ESC</kbd>, "一時停止", "いつでもひと休み"],
    [<kbd>R</kbd>, "最初からやり直す", "3勝先取ではシリーズの勝利数もリセット"],
  ];
  return (
    <Dialog title="遊び方と操作" onDismiss={onClose} className="help-dialog">
      <div className="dialog-heading">
        <div>
          <span className="eyebrow">HOW TO PLAY</span>
          <h2>最後まで、落ちるな。</h2>
        </div>
        <IconButton icon="close" label="遊び方を閉じる" onClick={onClose} />
      </div>
      <p className="help-intro">
        ％がたまるほど遠くに吹っ飛びます。しっぽ・回避・ジャンプを使い分けて、24体の中で最後のひとりを目指そう。
      </p>
      <div className="help-stage-note">
        <strong>3勝先取では、先に3ラウンド勝ったキャラが優勝。</strong>
        <span>
          ラウンドが進むと仕掛けが増えて加速します。隕石の赤い予告円から離れ、着弾後の衝撃波はジャンプで避けよう。
        </span>
        <span>
          安全地帯のステージでは床が残り、円が移動します。円の外に4秒いると脱落。次の円へ先回りしよう。
        </span>
      </div>
      <div className="control-list">
        {rows.map(([keys, label, description]) => (
          <div className="control-row" key={label}>
            <div className="control-keys">{keys}</div>
            <div>
              <strong>{label}</strong>
              <span>{description}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="help-note">
        <Icon name="tail" />
        <p>
          <strong>しっぽスピンはスタミナ25、回避は28。</strong>
          <br />
          使い切る前に距離を取って回復。崩落ステージでは、光り始めた外周に注意。
        </p>
      </div>
      <p className="help-touch">
        タッチ操作にも対応。左のスティックで移動、右のボタンでアクション。
      </p>
      <button type="button" className="button button-primary w-full" onClick={onClose}>
        わかった <Icon name="arrow" />
      </button>
    </Dialog>
  );
}

function TouchControls({
  onMove,
  onAction,
  hasItem,
  stamina,
}: Pick<GameUIProps, "onMove" | "onAction"> & { hasItem: boolean; stamina: number }) {
  const [stick, setStick] = useState({ x: 0, y: 0, active: false });
  const pointer = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  const reset = (event?: PointerEvent<HTMLDivElement>) => {
    if (event && event.pointerId !== pointer.current) return;
    pointer.current = null;
    setStick({ x: 0, y: 0, active: false });
    onMove(0, 0);
  };
  const update = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== pointer.current) return;
    const dx = event.clientX - origin.current.x;
    const dy = event.clientY - origin.current.y;
    const radius = 42;
    const length = Math.max(radius, Math.hypot(dx, dy));
    const x = dx / length;
    const y = dy / length;
    setStick({ x, y, active: true });
    onMove(x, y);
  };
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (pointer.current !== null) return;
    event.preventDefault();
    pointer.current = event.pointerId;
    const box = event.currentTarget.getBoundingClientRect();
    origin.current = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    event.currentTarget.setPointerCapture(event.pointerId);
    update(event);
  };
  useEffect(() => () => moveRef.current(0, 0), []);
  const touchAction = (action: GameAction) => (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    onAction(action);
  };
  return (
    <div className="touch-controls">
      <div
        className={`joystick ${stick.active ? "active" : ""}`}
        role="group"
        aria-label="移動スティック"
        onPointerDown={down}
        onPointerMove={update}
        onPointerUp={reset}
        onPointerCancel={reset}
        onLostPointerCapture={reset}
      >
        <span className="joystick-direction north">↑</span>
        <span className="joystick-direction south">↓</span>
        <span className="joystick-direction west">←</span>
        <span className="joystick-direction east">→</span>
        <div
          className="joystick-thumb"
          style={{ transform: `translate(${stick.x * 38}px, ${stick.y * 38}px)` }}
        />
        <span className="joystick-label">MOVE</span>
      </div>
      <div className="touch-actions">
        <button
          type="button"
          className="touch-action touch-throw"
          disabled={!hasItem}
          aria-label="スターを投げる"
          onPointerDown={touchAction("throw")}
          onClick={(event) => {
            if (event.detail === 0) onAction("throw");
          }}
        >
          <Icon name="star" />
          <span>投げる</span>
        </button>
        <button
          type="button"
          className="touch-action touch-roll"
          disabled={stamina < 28}
          aria-label="ローリング回避"
          onPointerDown={touchAction("roll")}
          onClick={(event) => {
            if (event.detail === 0) onAction("roll");
          }}
        >
          <Icon name="roll" />
          <span>回避</span>
        </button>
        <button
          type="button"
          className="touch-action touch-weak"
          aria-label="弱攻撃・空中攻撃"
          onPointerDown={touchAction("weak")}
          onClick={(event) => {
            if (event.detail === 0) onAction("weak");
          }}
        >
          <Icon name="hit" />
          <span>攻撃</span>
        </button>
        <button
          type="button"
          className="touch-action touch-strong"
          disabled={stamina < 25}
          aria-label="しっぽスピン"
          onPointerDown={touchAction("strong")}
          onClick={(event) => {
            if (event.detail === 0) onAction("strong");
          }}
        >
          <Icon name="tail" size={26} />
          <span>しっぽ</span>
        </button>
        <button
          type="button"
          className="touch-action touch-jump"
          aria-label="ジャンプ"
          onPointerDown={touchAction("jump")}
          onClick={(event) => {
            if (event.detail === 0) onAction("jump");
          }}
        >
          <Icon name="jump" size={25} />
          <span>ジャンプ</span>
        </button>
      </div>
    </div>
  );
}

const BODY_COLOR_NAMES = [
  "ミント",
  "アプリコット",
  "ラベンダー",
  "ピンク",
  "スカイ",
  "クリーム",
  "ピーチ",
  "リーフ",
  "ローズ",
  "コーンフラワー",
  "キャラメル",
  "ジェード",
  "ライラック",
  "アイスブルー",
  "マスタード",
  "オーキッド",
  "ライム",
  "コーラル",
  "スチールブルー",
  "ピスタチオ",
  "ベビーピンク",
  "すみれ",
  "サンド",
  "アクア",
];
const ACCENT_COLOR_NAMES = [
  "ゴールド",
  "アイボリー",
  "ネイビー",
  "ローズ",
  "ターコイズ",
  "すみれ",
  "オレンジ",
  "ブルー",
];

function ColorSwatches({
  colors,
  names,
  label,
  value,
  onChange,
  className = "",
}: {
  colors: readonly number[];
  names: readonly string[];
  label: string;
  value: number;
  onChange: (color: number) => void;
  className?: string;
}) {
  return (
    <div className={`color-options ${className}`} role="group" aria-label={label}>
      {colors.map((color, index) => (
        <button
          key={color}
          type="button"
          className={`color-option ${value === color ? "selected" : ""}`}
          style={{ "--swatch": hex(color) } as CSSProperties}
          title={names[index] ?? `カラー${index + 1}`}
          aria-label={`${label}：${names[index] ?? `カラー${index + 1}`}`}
          aria-pressed={value === color}
          onClick={() => onChange(color)}
        >
          {value === color ? "✓" : ""}
        </button>
      ))}
    </div>
  );
}

function AccentPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (color: number) => void;
}) {
  return (
    <div className="accent-picker">
      <label className="appearance-label">
        <span>{label}</span>
        <input
          type="color"
          value={hex(value)}
          onChange={(event) => onChange(Number.parseInt(event.target.value.slice(1), 16))}
          aria-label={`${label}を自由に選ぶ`}
        />
      </label>
      <ColorSwatches
        colors={ACCENT_COLORS}
        names={ACCENT_COLOR_NAMES}
        label={label}
        value={value}
        onChange={onChange}
        className="accent-swatches"
      />
    </div>
  );
}

function WinPips({ wins, target = 3 }: { wins: number; target?: number }) {
  return (
    <span className="win-pips" role="img" aria-label={`${target}勝中${wins}勝`}>
      {Array.from({ length: target }, (_, index) => (
        <i key={index} className={index < wins ? "filled" : ""} />
      ))}
    </span>
  );
}

function StageGlyph({ shape }: { shape: StageShape }) {
  const paths: Record<StageShape, string> = {
    square: "M10 10H54V54H10Z",
    octagon: "M21 8H43L56 21V43L43 56H21L8 43V21Z",
    cross: "M23 7H41V23H57V41H41V57H23V41H7V23H23Z",
    rectangle: "M5 18H59V46H5Z",
    ring: "M32 6a26 26 0 1 0 0 52 26 26 0 0 0 0-52Zm0 16a10 10 0 1 1 0 20 10 10 0 0 1 0-20Z",
    diamond: "M32 5 59 32 32 59 5 32Z",
  };
  return (
    <svg className="stage-glyph" viewBox="0 0 64 64" aria-hidden="true">
      <path
        d={paths[shape]}
        fill="currentColor"
        fillRule="evenodd"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function sortedStandings(state: GameState): Fighter[] {
  return [...state.fighters].sort(
    (a, b) => (state.series.wins[b.id] ?? 0) - (state.series.wins[a.id] ?? 0) || a.id - b.id,
  );
}

function SeriesStandings({ state }: { state: GameState }) {
  const ordered = sortedStandings(state);
  const featured = ordered.slice(0, 3);
  const player = ordered.find((fighter) => fighter.isPlayer);
  if (player && !featured.includes(player)) featured.push(player);
  const scoreRow = (fighter: Fighter, rank: number) => (
    <div className={`standing-row ${fighter.isPlayer ? "is-you" : ""}`} key={fighter.id}>
      <span className="standing-rank">{rank}</span>
      <span className="standing-color" style={{ background: hex(fighter.color) }} />
      <strong>{fighter.name}</strong>
      <WinPips wins={state.series.wins[fighter.id] ?? 0} target={state.series.targetWins} />
      <b>
        {state.series.wins[fighter.id] ?? 0}
        <small>勝</small>
      </b>
    </div>
  );
  return (
    <div className="series-standings">
      <div className="standings-heading">
        <span className="eyebrow">SERIES SCORE</span>
        <span>先に3勝で優勝</span>
      </div>
      <div>{featured.map((fighter) => scoreRow(fighter, ordered.indexOf(fighter) + 1))}</div>
      <details className="all-standings">
        <summary>
          全員のスコアを見る <span>{ordered.length}体</span>
        </summary>
        <div className="all-standings-list">
          {ordered.map((fighter, index) => scoreRow(fighter, index + 1))}
        </div>
      </details>
    </div>
  );
}

function SeriesResult({
  state,
  onNextRound,
  onRetry,
  onHome,
}: Pick<GameUIProps, "state" | "onNextRound" | "onRetry" | "onHome">) {
  const champion = state.fighters.find((fighter) => fighter.id === state.series.championId);
  const winner = state.fighters.find((fighter) => fighter.id === state.winnerId);
  const player = state.fighters.find((fighter) => fighter.isPlayer);
  const featured = champion ?? winner;
  const next = getRoundPreview(state.options, state.series.round + 1);
  const nextCue =
    next.level > state.stage.level
      ? next.modifier
      : next.speedMultiplier > state.stage.speedMultiplier
        ? "仕掛けが少し加速。予告を見て動こう"
        : next.definition.subtitle;
  return (
    <Dialog
      title={champion ? "シリーズ結果" : "ラウンド結果"}
      className={`series-result ${champion?.isPlayer ? "you-win" : ""}`}
    >
      <div className="series-result-heading">
        <span className="eyebrow">
          {champion ? "SERIES CHAMPION" : `ROUND ${state.series.round} RESULT`}
        </span>
        {champion && (
          <span className="series-trophy">
            <Icon name="trophy" size={25} />
          </span>
        )}
      </div>
      <div className="series-winner">
        <Mascot
          color={featured?.color ?? player?.color ?? DEFAULT_OPTIONS.playerColor}
          appearance={featured?.appearance ?? player?.appearance}
        />
        <div>
          <h2>
            {champion
              ? champion.isPlayer
                ? "シリーズ優勝！"
                : `${champion.name} が優勝！`
              : winner
                ? winner.isPlayer
                  ? "ラウンド勝利！"
                  : `${winner.name} が1勝！`
                : "この勝負は引き分け"}
          </h2>
          <p>
            {champion
              ? "先に3勝。そのしっぽがチャンピオン！"
              : winner
                ? `ROUND ${state.series.round} · ${getStageDefinition(state.stage.id).name}`
                : "勝利数はそのまま、次のラウンドへ。"}
          </p>
          {featured && (
            <div className="winner-score">
              <strong>{featured.name}</strong>
              <WinPips wins={state.series.wins[featured.id] ?? 0} />
            </div>
          )}
        </div>
      </div>
      <div className="round-personal-stats" aria-label="このラウンドのあなたの成績">
        <div>
          <span>YOU の順位</span>
          <strong>
            {player?.placement || "—"}
            <small> / {state.options.playerCount}</small>
          </strong>
        </div>
        <div>
          <span>撃墜</span>
          <strong>{player?.kills ?? 0}</strong>
        </div>
        <div>
          <span>ダメージ</span>
          <strong>
            {Math.round(player?.damageDealt ?? 0)}
            <small>%</small>
          </strong>
        </div>
        <div>
          <span>打ち返し</span>
          <strong>{player?.reflections ?? 0}</strong>
        </div>
      </div>
      <SeriesStandings state={state} />
      {!champion && (
        <div
          className="next-round-preview"
          style={{ "--stage-color": hex(next.definition.color) } as CSSProperties}
        >
          <StageGlyph shape={next.definition.shape} />
          <div>
            <span className="eyebrow">
              NEXT · ROUND {state.series.round + 1} · LEVEL {next.level}
            </span>
            <strong>{next.definition.name}</strong>
            <p>{nextCue}</p>
          </div>
        </div>
      )}
      <button
        type="button"
        className="button button-primary w-full"
        onClick={champion ? onRetry : onNextRound}
      >
        {champion ? "新しいシリーズ" : "次のラウンドへ"}
        <Icon name={champion ? "retry" : "arrow"} />
      </button>
      <div className="series-result-actions">
        {!champion && (
          <button type="button" className="text-button" onClick={onRetry}>
            シリーズをやり直す
          </button>
        )}
        <button type="button" className="text-button" onClick={onHome}>
          ロビーに戻る
        </button>
      </div>
    </Dialog>
  );
}

const stageHints: Record<GameState["stage"]["id"], string> = {
  sky: "回転棒をジャンプで避けよう",
  twin: "逆向きに回る2本の棒。タイミングを見よう",
  hammers: "ハンマーが通り過ぎた隙に移動しよう",
  conveyor: "黄色く光ると、コンベアが逆向きに",
  holes: "中央の穴と、光り始めた開閉床に注意",
  meteors: "赤い円から離れ、衝撃波をジャンプ",
  safezone: "次の円へ先回り。円の外に4秒いると脱落",
  chaos: "足元と空に注意。予告を見て動こう",
};

export function GameUI(props: GameUIProps) {
  const {
    state,
    ready,
    error,
    muted,
    onStart,
    onNextRound,
    onPreview,
    onTogglePause,
    onHome,
    onRetry,
    onToggleMute,
    onFullscreen,
    onAction,
    onMove,
  } = props;
  const [options, setOptions] = useState<GameOptions>({ ...DEFAULT_OPTIONS });
  const [help, setHelp] = useState(false);
  const resumeAfterHelp = useRef(false);
  const player = state.fighters.find((fighter) => fighter.isPlayer) ?? state.fighters[0];
  const alive = state.fighters.filter((fighter) => fighter.alive).length;
  const winner = state.fighters.find((fighter) => fighter.id === state.winnerId);
  const lobby = state.phase === "lobby";
  const active = state.phase === "playing" || state.phase === "countdown";
  const isSeries = state.options.mode === "first-to-three";
  const definition = getStageDefinition(state.stage.id);
  const preview = getRoundPreview(options, 1);
  const leader = sortedStandings(state)[0];
  const updateOptions = (changes: Partial<GameOptions>) => {
    const next = { ...options, ...changes };
    setOptions(next);
    onPreview(next);
  };
  const updateAppearance = (changes: Partial<FighterAppearance>) =>
    updateOptions({ playerAppearance: { ...options.playerAppearance, ...changes } });
  const zone = state.safeZone;
  const outsideZone = Boolean(zone && player?.alive && player.outsideZoneTime > 0);
  const outsideRemaining = zone
    ? Math.max(0, zone.outsideLimit - (player?.outsideZoneTime ?? 0))
    : 0;
  const arenaWarning = zone ? zone.phase !== "holding" : state.warning;
  const arenaStatus = zone
    ? `${zone.phase === "holding" ? "次の安全地帯まで" : zone.phase === "warning" ? "安全地帯の移動予告" : "安全地帯が移動中"} · ${Math.max(0, Math.ceil(zone.timer))}秒`
    : state.warning
      ? `外周が崩れる！ あと ${Math.max(0, Math.ceil(state.nextCollapse))} 秒`
      : `次の崩落まで ${Math.max(0, Math.ceil(state.nextCollapse))} 秒`;
  const meteorWarnings = state.meteors.filter((meteor) => meteor.phase === "warning");
  const hazardCue = meteorWarnings.length
    ? "隕石接近！ 赤い円から離れ、衝撃波はジャンプ"
    : state.tiles.some((tile) => tile.conveyor?.reversing)
      ? "黄色いベルトが、まもなく逆向きに"
      : state.tiles.some((tile) => tile.trap?.phase === "warning")
        ? "光る床がまもなく開く！ 足元を確認"
        : null;
  const openHelp = () => {
    resumeAfterHelp.current = state.phase === "playing" || state.phase === "countdown";
    if (resumeAfterHelp.current) onTogglePause();
    setHelp(true);
  };
  const closeHelp = () => {
    setHelp(false);
    if (resumeAfterHelp.current && state.phase === "paused") onTogglePause();
    resumeAfterHelp.current = false;
  };
  const damage = Math.round(player?.damage ?? 0);
  const stamina = Math.max(0, Math.min(MAX_STAMINA, player?.stamina ?? MAX_STAMINA));
  const damageColor = damage >= 100 ? "#f35c75" : damage >= 60 ? "#e99438" : "#253e48";

  return (
    <div
      className={`game-ui ${lobby ? "is-lobby" : "is-match"} ${isSeries ? "is-series" : "is-single"}`}
    >
      <header className="game-header">
        <div className="brand-lockup">
          <span className="brand-symbol">
            <Icon name="tail" size={25} />
          </span>
          <div>
            <strong>
              TAILSPIN<span>!</span>
            </strong>
            <span className="brand-subline">PLATFORM SURVIVAL</span>
          </div>
        </div>
        {!lobby && (
          <div
            className="match-status"
            aria-label={`経過時間 ${timeLabel(state.elapsed)}、残り ${alive} 体`}
          >
            <span className="timer">
              <Icon name="clock" size={19} />
              <b>{timeLabel(state.elapsed)}</b>
            </span>
            <span className="status-divider" />
            <span className="remaining">
              <Icon name="users" size={19} />
              <b>{alive}</b>
              <span>/{state.options.playerCount}</span>
            </span>
          </div>
        )}
        <nav className="utility-bar" aria-label="ゲームメニュー">
          <IconButton
            icon={muted ? "mute" : "sound"}
            label={muted ? "音をオンにする" : "音をオフにする"}
            active={!muted}
            onClick={onToggleMute}
          />
          <IconButton
            icon="expand"
            label="全画面表示を切り替え"
            className="fullscreen-button"
            onClick={onFullscreen}
          />
          <IconButton icon="help" label="遊び方と操作" onClick={openHelp} />
          {!lobby && state.phase !== "finished" && (
            <IconButton
              icon={state.phase === "paused" ? "play" : "pause"}
              label={state.phase === "paused" ? "ゲームを再開" : "一時停止"}
              onClick={onTogglePause}
            />
          )}
        </nav>
      </header>

      {lobby && !error && (
        <>
          <section className="lobby-card panel" aria-label="対戦の設定">
            <div className="lobby-kicker">
              <span className="status-dot" />
              {options.playerCount}-WAY TAIL BATTLE<span className="prototype-tag">ALPHA</span>
            </div>
            <div className="lobby-title-row">
              <h1>
                TAIL
                <br />
                <span>SPIN!</span>
              </h1>
              <Mascot
                color={options.playerColor}
                appearance={options.playerAppearance}
                className="lobby-mascot"
              />
            </div>
            <h2>しっぽで、最後のひとりに。</h2>
            <p className="lobby-description">
              跳んで、転がって、吹っ飛ばせ。
              <br />
              空のアリーナで、しっぽだらけの大乱闘。
            </p>
            <div className="lobby-mode" role="group" aria-label="対戦モード">
              <button
                type="button"
                aria-pressed={options.mode === "first-to-three"}
                className={options.mode === "first-to-three" ? "selected" : ""}
                onClick={() => updateOptions({ mode: "first-to-three" })}
              >
                <Icon name="trophy" size={17} />
                <strong>3勝先取</strong>
                <span>ラウンドを重ねて優勝へ</span>
              </button>
              <button
                type="button"
                aria-pressed={options.mode === "single"}
                className={options.mode === "single" ? "selected" : ""}
                onClick={() => updateOptions({ mode: "single" })}
              >
                <Icon name="hit" size={17} />
                <strong>1戦勝負</strong>
                <span>気軽にワンバトル</span>
              </button>
            </div>
            <div className="stage-selection">
              <label className="option-label" htmlFor="stage-select">
                ステージ
              </label>
              <select
                id="stage-select"
                value={options.stage}
                onChange={(event) => updateOptions({ stage: event.target.value as StageSelection })}
              >
                <option value="shuffle">
                  {options.mode === "first-to-three"
                    ? `ステージツアー · ${STAGES.length}種類`
                    : `ランダム · ${STAGES.length}種類`}
                </option>
                {STAGES.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>
            </div>
            <div
              className="lobby-stage-preview"
              style={{ "--stage-color": hex(preview.definition.color) } as CSSProperties}
            >
              <StageGlyph shape={preview.definition.shape} />
              <div>
                <span>
                  {preview.definition.shapeLabel} · {preview.definition.hazards.join(" / ")}
                </span>
                <p>
                  {options.stage === "shuffle"
                    ? options.mode === "first-to-three"
                      ? `${STAGES.length}つのステージを巡り、後半は仕掛けが追加。先に3勝で優勝！`
                      : `${STAGES.length}種類のアリーナからランダムに選ばれます。`
                    : preview.definition.description}
                </p>
              </div>
            </div>
            <details className="lobby-advanced">
              <summary>
                <span>見た目・人数・CPU設定</span>
                <span className="settings-summary">
                  <i style={{ background: hex(options.playerColor) }} />
                  {options.playerCount}体 ·{" "}
                  {options.difficulty === "easy"
                    ? "やさしい"
                    : options.difficulty === "hard"
                      ? "つよい"
                      : "ふつう"}
                  <b>＋</b>
                </span>
              </summary>
              <div className="lobby-options">
                <div className="appearance-editor">
                  <div className="body-picker">
                    <span className="appearance-label">
                      ボディの色 <small>{COLORS.length} COLORS</small>
                    </span>
                    <ColorSwatches
                      colors={COLORS}
                      names={BODY_COLOR_NAMES}
                      label="ボディの色"
                      value={options.playerColor}
                      onChange={(color) => updateOptions({ playerColor: color })}
                      className="body-swatches"
                    />
                  </div>
                  <div className="appearance-parts">
                    <AccentPicker
                      label="しっぽの先"
                      value={options.playerAppearance.tailTipColor}
                      onChange={(color) => updateAppearance({ tailTipColor: color })}
                    />
                    <AccentPicker
                      label="足の色"
                      value={options.playerAppearance.shoeColor}
                      onChange={(color) => updateAppearance({ shoeColor: color })}
                    />
                  </div>
                  <div className="option-row accessory-row">
                    <label className="option-label" htmlFor="accessory-select">
                      アクセサリー
                    </label>
                    <select
                      id="accessory-select"
                      value={options.playerAppearance.accessory}
                      onChange={(event) =>
                        updateAppearance({ accessory: event.target.value as Accessory })
                      }
                    >
                      {ACCESSORIES.map((accessory) => (
                        <option key={accessory.id} value={accessory.id}>
                          {accessory.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {options.playerAppearance.accessory !== "none" && (
                    <AccentPicker
                      label="アクセサリーの色"
                      value={options.playerAppearance.accessoryColor}
                      onChange={(color) => updateAppearance({ accessoryColor: color })}
                    />
                  )}
                  <p className="appearance-note">
                    見た目はシリーズを通して同じ。自分のしっぽを見つけよう。
                  </p>
                </div>
                <div className="option-row">
                  <span className="option-label">
                    対戦人数<span>あなた＋CPU</span>
                  </span>
                  <div className="segmented-control" role="group" aria-label="対戦人数">
                    {([8, 16, 24] as const).map((count) => (
                      <button
                        key={count}
                        type="button"
                        aria-pressed={options.playerCount === count}
                        className={options.playerCount === count ? "selected" : ""}
                        onClick={() => updateOptions({ playerCount: count })}
                      >
                        {count}
                        <span>体</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="option-row">
                  <span className="option-label">CPUの強さ</span>
                  <div
                    className="segmented-control difficulty-control"
                    role="group"
                    aria-label="CPUの強さ"
                  >
                    {(
                      [
                        ["easy", "やさしい"],
                        ["normal", "ふつう"],
                        ["hard", "つよい"],
                      ] as [Difficulty, string][]
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={options.difficulty === value}
                        className={options.difficulty === value ? "selected" : ""}
                        onClick={() => updateOptions({ difficulty: value })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </details>
            <button
              type="button"
              className="button button-primary start-button"
              disabled={!ready}
              onClick={() => onStart(options)}
            >
              <span>{ready ? "バトルスタート" : "アリーナを準備中…"}</span>
              {ready ? <Icon name="arrow" size={23} /> : <span className="loading-spinner" />}
            </button>
            <p className="lobby-footnote">
              1 PLAYER + {options.playerCount - 1} CPU
              <span>
                {options.mode === "first-to-three"
                  ? "先に3ラウンド勝てば優勝"
                  : "最後に残った1体が勝ち"}
              </span>
            </p>
          </section>
          <div className="arena-caption">
            <span className="arena-number">
              {String(STAGES.findIndex((stage) => stage.id === preview.id) + 1).padStart(2, "0")}
            </span>
            <div>
              <span className="eyebrow">
                {options.stage === "shuffle"
                  ? `STAGE TOUR · ${STAGES.length} ARENAS`
                  : preview.definition.shapeLabel}
              </span>
              <strong>{preview.definition.name}</strong>
              <span>{preview.definition.subtitle}</span>
            </div>
          </div>
          <div className="lobby-bottom">
            <span>
              <kbd>WASD</kbd> 移動 <kbd>SPACE</kbd> ジャンプ <kbd>K</kbd> しっぽ
            </span>
            <button type="button" onClick={openHelp}>
              すべての操作を見る <Icon name="arrow" size={15} />
            </button>
          </div>
        </>
      )}

      {!lobby && !error && (
        <>
          {state.phase !== "finished" && (
            <div
              className={`collapse-status ${arenaWarning ? "is-warning" : ""} ${zone ? "zone-status" : ""}`}
              aria-live={arenaWarning ? "polite" : "off"}
            >
              <span className="status-dot" />
              {arenaStatus}
              {arenaWarning && <Icon name="jump" size={16} />}
            </div>
          )}
          {state.phase !== "finished" && (
            <div className="round-stage-status">
              <div className="round-stage-heading">
                <b>{isSeries ? `ROUND ${state.series.round}` : "SINGLE BATTLE"}</b>
                <span>{definition.name}</span>
                <small className={`stage-level level-${state.stage.level}`}>
                  LV.{state.stage.level}
                </small>
              </div>
              {isSeries && (
                <div className="series-score-strip">
                  <span className="your-series-score">
                    <b>YOU</b>
                    <WinPips wins={state.series.wins[player?.id ?? 0] ?? 0} />
                  </span>
                  {leader && !leader.isPlayer ? (
                    <span>
                      <b>{leader.name}</b>
                      <WinPips wins={state.series.wins[leader.id] ?? 0} />
                    </span>
                  ) : (
                    <small>先に3勝で優勝</small>
                  )}
                </div>
              )}
            </div>
          )}
          {state.phase === "playing" && outsideZone && (
            <div
              className="hazard-notice zone-danger"
              role="alert"
              aria-label="安全地帯の外です。急いで円の中に戻ってください。"
            >
              <Icon name="arrow" size={17} />
              <span aria-hidden="true">
                安全地帯へ！ <strong>残り {outsideRemaining.toFixed(1)}秒</strong>
              </span>
            </div>
          )}
          {state.phase === "playing" && hazardCue && !outsideZone && (
            <div className="hazard-notice" role="status">
              <Icon name={meteorWarnings.length ? "star" : "jump"} size={15} />
              {hazardCue}
            </div>
          )}
          <div className={`player-card panel ${!player?.alive ? "player-out" : ""}`}>
            <div className="player-identity">
              <Mascot
                color={player?.color ?? DEFAULT_OPTIONS.playerColor}
                appearance={player?.appearance}
              />
              <span>YOU</span>
            </div>
            <div className="player-readout">
              <div className="damage-row">
                <span className="damage-value" style={{ color: damageColor }}>
                  {damage}
                  <small>%</small>
                </span>
                <span className="damage-label">吹っ飛び率</span>
              </div>
              <div className="stamina-caption">
                <span>STAMINA</span>
                <b>{Math.round(stamina)}</b>
              </div>
              <div
                className={`stamina-track ${stamina < 28 ? "stamina-low" : ""}`}
                role="progressbar"
                aria-label="スタミナ"
                aria-valuenow={Math.round(stamina)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: `${stamina}%` }} />
              </div>
            </div>
            <div
              className={`item-slot ${player?.item ? "has-item" : ""}`}
              title={player?.item ? "Eでスターを投げる" : "アリーナのスターを拾おう"}
            >
              <Icon name="star" size={22} />
              <kbd>E</kbd>
            </div>
          </div>
          <div className="contestants panel" aria-label={`残っている選手 ${alive} 体`}>
            <span className="eyebrow">STILL IN THE GAME</span>
            <div className="contestant-dots">
              {state.fighters.map((fighter) => (
                <span
                  key={fighter.id}
                  className={`contestant-dot ${fighter.alive ? "" : "out"} ${fighter.isPlayer ? "you" : ""}`}
                  style={{ "--fighter-color": hex(fighter.color) } as CSSProperties}
                  title={`${fighter.name} ${fighter.alive ? `${Math.round(fighter.damage)}%` : "脱落"}`}
                >
                  <i />
                  <i />
                </span>
              ))}
            </div>
          </div>
          {active && (
            <div className="keyboard-hints">
              <span>
                <kbd>WASD</kbd> 移動
              </span>
              <span>
                <kbd>SPACE</kbd> ジャンプ
              </span>
              <span>
                <kbd>J</kbd> 攻撃
              </span>
              <span>
                <kbd>K</kbd> しっぽ
              </span>
              <span>
                <kbd>SHIFT</kbd> 回避
              </span>
              <span>
                <kbd>E</kbd> 投げる
              </span>
            </div>
          )}
          {state.phase === "countdown" && (
            <div className="countdown-overlay" role="status">
              <span className="eyebrow">
                {isSeries ? `ROUND ${state.series.round}` : "READY TO RUMBLE?"} · LEVEL{" "}
                {state.stage.level}
              </span>
              <h2 className="countdown-stage-name">{definition.name}</h2>
              <strong key={Math.ceil(state.countdown)}>
                {Math.max(1, Math.ceil(state.countdown))}
              </strong>
              <p>{stageHints[state.stage.id]}</p>
              {state.stage.level > 1 && (
                <span className="countdown-modifier">{state.stage.modifier}</span>
              )}
            </div>
          )}
          {state.phase === "playing" && state.elapsed < 0.8 && (
            <div className="go-flash" aria-live="polite">
              GO!
            </div>
          )}
          {state.phase === "playing" && player?.alive && !help && (
            <TouchControls
              onMove={onMove}
              onAction={onAction}
              hasItem={player.item}
              stamina={stamina}
            />
          )}
          {state.phase === "playing" && player && !player.alive && (
            <div className="spectator-card panel" role="status">
              <span className="eyebrow">SPECTATING</span>
              <strong>{player.placement || "—"}位でフィニッシュ</strong>
              <p>
                {isSeries ? "ラウンド終了まで、残った仲間を観戦中" : "残った仲間のバトルを観戦中"}
              </p>
              <button type="button" className="button button-small" onClick={onRetry}>
                <Icon name="retry" size={16} />
                {isSeries ? "シリーズをやり直す" : "もう一度"}
              </button>
            </div>
          )}
        </>
      )}

      {state.phase === "paused" && !help && !error && (
        <Dialog title="一時停止" onDismiss={onTogglePause} className="pause-dialog">
          <div className="round-icon">
            <Icon name="pause" size={29} />
          </div>
          <span className="eyebrow">TAKE A BREATHER</span>
          <h2>ちょっと、ひと休み。</h2>
          <p>アリーナも、しっぽも待機中。</p>
          <button type="button" className="button button-primary w-full" onClick={onTogglePause}>
            バトルに戻る <Icon name="play" />
          </button>
          <div className="dialog-actions">
            <button type="button" className="button button-secondary" onClick={onRetry}>
              <Icon name="retry" size={18} />
              {isSeries ? "シリーズ最初から" : "やり直す"}
            </button>
            <button type="button" className="button button-secondary" onClick={onHome}>
              <Icon name="home" size={18} />
              ロビー
            </button>
          </div>
        </Dialog>
      )}

      {state.phase === "finished" && isSeries && !help && !error && (
        <SeriesResult state={state} onNextRound={onNextRound} onRetry={onRetry} onHome={onHome} />
      )}

      {state.phase === "finished" && !isSeries && !help && !error && (
        <Dialog title="バトル結果" className={`result-dialog ${winner?.isPlayer ? "you-win" : ""}`}>
          <div className="result-medallion">
            <Icon name="trophy" size={40} />
          </div>
          <span className="eyebrow">{winner ? "LAST ONE STANDING" : "WHAT A FINISH"}</span>
          <h2>
            {winner?.isPlayer
              ? "あなたの勝ち！"
              : winner
                ? `${winner.name} の勝ち！`
                : "引き分け！"}
          </h2>
          <p>
            {winner?.isPlayer ? "そのしっぽ、ただものじゃない。" : "もうひと勝負、しっぽを振ろう。"}
          </p>
          <div className="result-character">
            <Mascot
              color={winner?.color ?? player?.color ?? DEFAULT_OPTIONS.playerColor}
              appearance={winner?.appearance ?? player?.appearance}
            />
            <span>{winner?.isPlayer ? "YOU" : (winner?.name ?? "DRAW")}</span>
          </div>
          <div className="result-placement">
            <span>あなたの順位</span>
            <strong>
              {player?.placement || (winner?.isPlayer ? 1 : "—")}
              <small> / {state.options.playerCount}</small>
            </strong>
          </div>
          <div className="result-stats">
            <div>
              <strong>{player?.kills ?? 0}</strong>
              <span>撃墜</span>
            </div>
            <div>
              <strong>
                {Math.round(player?.damageDealt ?? 0)}
                <small>%</small>
              </strong>
              <span>与えたダメージ</span>
            </div>
            <div>
              <strong>{player?.reflections ?? 0}</strong>
              <span>打ち返し</span>
            </div>
          </div>
          <button type="button" className="button button-primary w-full" onClick={onRetry}>
            もう一度あそぶ <Icon name="retry" />
          </button>
          <button type="button" className="text-button" onClick={onHome}>
            ロビーに戻る
          </button>
        </Dialog>
      )}

      {help && !error && <ControlsHelp onClose={closeHelp} />}
      {error && (
        <Dialog title="ゲームを開始できませんでした" className="error-dialog">
          <span className="eyebrow">ARENA UNAVAILABLE</span>
          <h2>アリーナを開けませんでした</h2>
          <p>
            WebGL
            2に対応したブラウザーで、ハードウェアアクセラレーションを有効にしてお試しください。
          </p>
          <details>
            <summary>エラーの詳細</summary>
            <pre>{error}</pre>
          </details>
          <button
            type="button"
            className="button button-primary w-full"
            onClick={() => window.location.reload()}
          >
            再読み込み <Icon name="retry" />
          </button>
        </Dialog>
      )}
    </div>
  );
}
