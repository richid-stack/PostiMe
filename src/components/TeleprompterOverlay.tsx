import React, { useEffect, useRef } from 'react';
import { advanceScroll, maxScrollPosition, scrollSpeed } from '../utils/teleprompter';

interface TeleprompterOverlayProps {
  text: string;
  /** Text size in pixels. */
  size: number;
  wpm: number;
  /** Flip left to right, for a mirror-glass prompter rig. */
  mirror: boolean;
  /** Scrolling. When false the text holds where it is. */
  running: boolean;
  /** Changing this puts the text back at the top. */
  resetKey: number;
}

/** Share of the height, from the top, where the line being read sits. */
const READING_LINE = 0.3;

/**
 * Scrolling script drawn over a preview. It is only on screen (not part of the recording). The scroll position lives
 * in a ref and is written straight to the element each frame, so a speed change never restarts or jumps the text.
 */
const TeleprompterOverlay: React.FC<TeleprompterOverlayProps> = ({ text, size, wpm, mirror, running, resetKey }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef(0);
  const liveRef = useRef({ text, size, wpm, running });
  liveRef.current = { text, size, wpm, running };

  useEffect(() => { positionRef.current = 0; }, [resetKey]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      const box = boxRef.current;
      const content = textRef.current;
      if (box && content) {
        const live = liveRef.current;
        const travel = maxScrollPosition(content.offsetHeight, live.size * 1.4);
        if (live.running) positionRef.current = advanceScroll(positionRef.current, dt, scrollSpeed(travel, live.text, live.wpm), travel);
        else positionRef.current = Math.min(positionRef.current, travel);
        content.style.transform = `translateY(${box.clientHeight * READING_LINE - positionRef.current}px)`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div ref={boxRef} className="absolute inset-0 overflow-hidden pointer-events-none bg-black/50" data-testid="teleprompter" aria-hidden="true">
      <div className="absolute inset-0" style={{ transform: mirror ? 'scaleX(-1)' : undefined }}>
        <div
          ref={textRef}
          className="absolute left-0 right-0 px-[8%] text-center font-semibold text-white whitespace-pre-wrap"
          style={{ fontSize: size, lineHeight: 1.4, willChange: 'transform' }}
          data-testid="teleprompter-text"
        >
          {text}
        </div>
      </div>
      <div className="absolute left-0 right-0 border-t border-dashed" style={{ top: `${READING_LINE * 100}%`, borderColor: 'var(--app-accent)' }} />
    </div>
  );
};

export default TeleprompterOverlay;
