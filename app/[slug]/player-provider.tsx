"use client";

// Vincolo di piano §D: un solo elemento `audio` in tutta l'applicazione.
// Vive qui, dentro il provider montato dal layout di `/[slug]`, e sopravvive alla
// navigazione fra le superfici perché il layout non viene rimontato.
// Gli embed non passano di qui: hanno un iframe isolato e la barra non tenta di controllarli.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type PlayerTrack = {
  readonly id: string;
  readonly title: string;
  readonly src: string;
};

type PlayerApi = {
  readonly current: PlayerTrack | null;
  readonly playing: boolean;
  readonly select: (track: PlayerTrack) => void;
  readonly toggle: () => void;
};

const PlayerContext = createContext<PlayerApi | null>(null);

export function usePlayer(): PlayerApi {
  const api = useContext(PlayerContext);
  if (api === null) {
    throw new Error("usePlayer richiede PlayerProvider: il player è unico e vive nel layout.");
  }
  return api;
}

export function PlayerProvider({ children }: { readonly children: ReactNode }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [current, setCurrent] = useState<PlayerTrack | null>(null);
  const [playing, setPlaying] = useState(false);

  const select = useCallback((track: PlayerTrack) => {
    setCurrent((previous) => {
      if (previous?.id === track.id) return previous;
      return track;
    });
    const element = audio.current;
    if (element === null) return;
    if (current?.id === track.id && !element.paused) {
      element.pause();
      return;
    }
    // La sorgente cambia al render successivo: `play()` viene richiamato da `onLoadedData`.
    void element.play().catch(() => setPlaying(false));
  }, [current]);

  const toggle = useCallback(() => {
    const element = audio.current;
    if (element === null || current === null) return;
    if (element.paused) {
      void element.play().catch(() => setPlaying(false));
    } else {
      element.pause();
    }
  }, [current]);

  const api = useMemo<PlayerApi>(
    () => ({ current, playing, select, toggle }),
    [current, playing, select, toggle],
  );

  return (
    <PlayerContext.Provider value={api}>
      {children}
      <audio
        ref={audio}
        preload="none"
        src={current?.src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      >
        <track kind="captions" />
      </audio>
    </PlayerContext.Provider>
  );
}

export function PlayerBar() {
  const { current, playing, toggle } = usePlayer();
  if (current === null) return null;

  return (
    <aside className="player-shell" aria-label="Player persistente">
      <span>{current.title}</span>
      <button type="button" onClick={toggle} aria-pressed={playing}>
        {playing ? "Pausa" : "Riproduci"}
      </button>
    </aside>
  );
}

export function TrackPlayButton({ track }: { readonly track: PlayerTrack }) {
  const { current, playing, select, toggle } = usePlayer();
  const isCurrent = current?.id === track.id;

  return (
    <button
      type="button"
      aria-pressed={isCurrent && playing}
      onClick={() => (isCurrent ? toggle() : select(track))}
    >
      {isCurrent && playing ? "Pausa" : "Riproduci"} {track.title}
    </button>
  );
}
