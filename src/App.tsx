import { useCallback, useEffect, useRef, useState } from "react";
import { GameEngine } from "./game/engine";
import { ArenaRenderer } from "./game/renderer";
import { GameInput, type InputAction } from "./game/input";
import { GameAudio } from "./game/audio";
import { type GameOptions, type GameState } from "./game/types";
import { GameUI } from "./ui/GameUI";

const FIXED_STEP = 1 / 60;
function snapshot(state: GameState): GameState {
  return {
    ...state,
    options: { ...state.options },
    fighters: state.fighters.map((f) => ({ ...f })),
    events: [...state.events],
  };
}

export function App() {
  const host = useRef<HTMLDivElement>(null);
  const [engineInstance] = useState(() => new GameEngine());
  const engine = useRef(engineInstance);
  const input = useRef<GameInput | null>(null);
  const sound = useRef<GameAudio | null>(null);
  const [state, setState] = useState(() => snapshot(engine.current.state));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem("tailspin-muted") === "true";
    } catch {
      return false;
    }
  });
  const [fps, setFps] = useState(0);
  const lastEvent = useRef(0);
  const publish = useCallback(() => setState(snapshot(engine.current.state)), []);

  const togglePause = useCallback(() => {
    const phase = engine.current.state.phase;
    if (phase === "playing" || phase === "countdown" || phase === "paused") {
      engine.current.setPaused(phase !== "paused");
      input.current?.clear();
      publish();
    }
  }, [publish]);

  const start = useCallback(
    (options: Partial<GameOptions> = {}) => {
      sound.current?.unlock();
      input.current?.clear();
      lastEvent.current = 0;
      engine.current.start({ ...options, seed: Math.floor(Math.random() * 0x7fffffff) });
      publish();
    },
    [publish],
  );

  const retry = useCallback(() => start(engine.current.state.options), [start]);
  const home = useCallback(() => {
    engine.current.reset(engine.current.state.options);
    input.current?.clear();
    lastEvent.current = 0;
    publish();
  }, [publish]);

  useEffect(() => {
    const element = host.current!;
    let cancelled = false;
    let frame = 0;
    let renderer: ArenaRenderer | null = null;
    const audio = new GameAudio();
    sound.current = audio;
    try {
      audio.setMuted(localStorage.getItem("tailspin-muted") === "true");
    } catch {
      /* Storage is optional. */
    }
    const controls = new GameInput(
      togglePause,
      () => {
        if (engine.current.state.phase !== "lobby" && engine.current.state.phase !== "countdown")
          retry();
      },
      () => audio.unlock(),
    );
    input.current = controls;
    const pauseOnHidden = () => {
      if (document.hidden || !document.hasFocus()) {
        if (
          engine.current.state.phase === "playing" ||
          engine.current.state.phase === "countdown"
        ) {
          engine.current.setPaused(true);
          controls.clear();
          publish();
        }
      }
    };
    document.addEventListener("visibilitychange", pauseOnHidden);
    window.addEventListener("blur", pauseOnHidden);
    const observer = new ResizeObserver(() => renderer?.resize());
    observer.observe(element);

    void ArenaRenderer.create(element)
      .then((instance) => {
        if (cancelled) {
          instance.destroy();
          return;
        }
        renderer = instance;
        setReady(true);
        let previous = performance.now();
        let accumulator = 0;
        let lastUI = previous;
        let fpsStart = previous;
        let frameCount = 0;
        const tick = (now: number) => {
          if (cancelled) return;
          const dt = Math.min(0.1, Math.max(0, (now - previous) / 1000));
          previous = now;
          accumulator += dt;
          while (accumulator >= FIXED_STEP) {
            engine.current.step(controls.sample(), FIXED_STEP);
            accumulator -= FIXED_STEP;
          }
          for (const event of engine.current.state.events) {
            if (event.id > lastEvent.current) {
              audio.play(event);
              lastEvent.current = event.id;
            }
          }
          try {
            instance.render(engine.current.state, dt);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "描画に失敗しました");
            return;
          }
          if (now - lastUI > 90) {
            publish();
            lastUI = now;
          }
          frameCount++;
          if (now - fpsStart > 1000) {
            setFps(Math.round((frameCount * 1000) / (now - fpsStart)));
            frameCount = 0;
            fpsStart = now;
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "3D画面を起動できませんでした");
      });

    // Available only in dev/test, absent from the production game.
    if (import.meta.env.DEV) {
      (window as Window & { __TAILSPIN__?: unknown }).__TAILSPIN__ = {
        engine: engine.current,
        input: controls,
      };
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", pauseOnHidden);
      window.removeEventListener("blur", pauseOnHidden);
      controls.destroy();
      audio.destroy();
      renderer?.destroy();
      if (input.current === controls) input.current = null;
      if (sound.current === audio) sound.current = null;
      delete (window as Window & { __TAILSPIN__?: unknown }).__TAILSPIN__;
    };
  }, [publish, retry, togglePause]);

  const toggleMute = useCallback(() => {
    setMuted((old) => {
      const next = !old;
      sound.current?.unlock();
      sound.current?.setMuted(next);
      try {
        localStorage.setItem("tailspin-muted", String(next));
      } catch {
        /* Storage is optional. */
      }
      return next;
    });
  }, []);
  const fullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);
  const action = useCallback((a: InputAction) => input.current?.action(a), []);
  const move = useCallback((x: number, y: number) => input.current?.move(x, y), []);

  return (
    <main className="game-app">
      <div ref={host} className="game-canvas-shell" aria-label="24体の3Dサバイバルアリーナ" />
      <GameUI
        state={state}
        ready={ready}
        error={error}
        muted={muted}
        fps={fps}
        onStart={start}
        onTogglePause={togglePause}
        onHome={home}
        onRetry={retry}
        onToggleMute={toggleMute}
        onFullscreen={fullscreen}
        onAction={action}
        onMove={move}
      />
    </main>
  );
}
