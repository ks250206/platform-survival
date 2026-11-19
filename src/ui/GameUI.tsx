import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent, ReactNode } from "react";
import { COLORS, DEFAULT_OPTIONS, MAX_STAMINA } from "../game/types";
import type { Difficulty, GameOptions, GameState } from "../game/types";

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

function Mascot({ color, className = "" }: { color: number; className?: string }) {
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
      <ellipse cx="35" cy="81" rx="15" ry="8" fill="#243642" transform="rotate(-12 35 81)" />
      <ellipse cx="69" cy="81" rx="15" ry="8" fill="#243642" transform="rotate(12 69 81)" />
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
          'button:not(:disabled), [href], input, select, [tabindex="0"]',
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
          使い切る前に距離を取って回復。光る外周の床は、まもなく崩れます。
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

export function GameUI(props: GameUIProps) {
  const {
    state,
    ready,
    error,
    muted,
    onStart,
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
  const collapseIn = Math.max(0, Math.ceil(state.nextCollapse));
  const damageColor = damage >= 100 ? "#f35c75" : damage >= 60 ? "#e99438" : "#253e48";

  return (
    <div className={`game-ui ${lobby ? "is-lobby" : "is-match"}`}>
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
              <Mascot color={options.playerColor} className="lobby-mascot" />
            </div>
            <h2>しっぽで、最後のひとりに。</h2>
            <p className="lobby-description">
              跳んで、転がって、吹っ飛ばせ。
              <br />
              空のアリーナで、しっぽだらけの大乱闘。
            </p>
            <div className="lobby-rule">
              <Icon name="tail" size={25} />
              <span>
                <strong>しっぽでスターを打ち返そう。</strong>
                <br />
                ％がたまるほど、遠くに吹っ飛ぶ！
              </span>
            </div>
            <div className="lobby-options">
              <div className="option-row">
                <span className="option-label">あなたのカラー</span>
                <div className="color-options" role="group" aria-label="キャラクターの色">
                  {COLORS.slice(0, 6).map((color, index) => (
                    <button
                      key={color}
                      type="button"
                      className={`color-option ${options.playerColor === color ? "selected" : ""}`}
                      style={{ "--swatch": hex(color) } as CSSProperties}
                      aria-label={`カラー ${index + 1}`}
                      aria-pressed={options.playerColor === color}
                      onClick={() => setOptions((old) => ({ ...old, playerColor: color }))}
                    >
                      {options.playerColor === color ? "✓" : ""}
                    </button>
                  ))}
                </div>
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
                      onClick={() => setOptions((old) => ({ ...old, playerCount: count }))}
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
                      onClick={() => setOptions((old) => ({ ...old, difficulty: value }))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
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
              1 PLAYER + {options.playerCount - 1} CPU<span>最後に残った1体が勝ち</span>
            </p>
          </section>
          <div className="arena-caption">
            <span className="arena-number">01</span>
            <div>
              <span className="eyebrow">FLOATING PLAYGROUND</span>
              <strong>スカイ・スピナー</strong>
              <span>回る棒、崩れる床。逃げ場はだんだん狭くなる。</span>
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
              className={`collapse-status ${state.warning ? "is-warning" : ""}`}
              aria-live={state.warning ? "polite" : "off"}
            >
              <span className="status-dot" />
              {state.warning
                ? `外周が崩れる！ あと ${collapseIn} 秒`
                : `次の崩落まで ${collapseIn} 秒`}
              {state.warning && <Icon name="jump" size={16} />}
            </div>
          )}
          <div className={`player-card panel ${!player?.alive ? "player-out" : ""}`}>
            <div className="player-identity">
              <Mascot color={player?.color ?? DEFAULT_OPTIONS.playerColor} />
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
              <span className="eyebrow">READY TO RUMBLE?</span>
              <strong key={Math.ceil(state.countdown)}>
                {Math.max(1, Math.ceil(state.countdown))}
              </strong>
              <p>回転棒をジャンプで避けよう</p>
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
              <p>残った仲間のバトルを観戦中</p>
              <button type="button" className="button button-small" onClick={onRetry}>
                <Icon name="retry" size={16} />
                もう一度
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
              やり直す
            </button>
            <button type="button" className="button button-secondary" onClick={onHome}>
              <Icon name="home" size={18} />
              ロビー
            </button>
          </div>
        </Dialog>
      )}

      {state.phase === "finished" && !help && !error && (
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
            <Mascot color={winner?.color ?? player?.color ?? DEFAULT_OPTIONS.playerColor} />
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
