import { type HeadlineDto } from '@masswhisper/shared/dtos';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { shuffleArray } from '../../utils/shuffle';
import styles from './Ticker.module.css';
import { useTickerScroll } from './useTickerScroll';

const COPIES = 3;

export function Ticker({ headlines }: { headlines: HeadlineDto[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const data = useMemo(() => shuffleArray(headlines), [headlines]);
  const looped = useMemo(
    () => Array.from({ length: COPIES }, () => data).flat(),
    [data],
  );

  const [paused, setPaused] = useState(false);
  const onPause = useCallback(() => {
    setPaused(true);
  }, []);
  const onResume = useCallback(() => {
    setPaused(false);
  }, []);

  const { onPointerDown, onPointerMove, onClickCapture, placeInitialScroll } =
    useTickerScroll(trackRef, rowRef, {
      copies: COPIES,
      onPause,
      onResume,
      pauseDelay: 120,
    });

  useEffect(() => {
    const track = trackRef.current;
    const row = rowRef.current;
    if (!track || !row) return;

    const expected = row.scrollWidth / COPIES;
    if (Math.abs(track.scrollLeft - expected) > 2) {
      track.scrollLeft = expected;
    }
  }, [looped.length]);

  useEffect(() => placeInitialScroll(), [looped.length, placeInitialScroll]);

  if (!looped.length) return <p role="status">Aucun titre disponible.</p>;

  return (
    <div
      className={styles.ticker}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onClickCapture={onClickCapture}
    >
      <div ref={trackRef} className={styles.track}>
        <div
          ref={rowRef}
          className={`${styles.row} ${paused ? styles.paused : ''}`}
        >
          {looped.map(({ title, itemRef }, i) => (
            <a
              key={i}
              href={itemRef}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.item}
              aria-label={`Ouvrir: ${title} (nouvelle fenêtre)`}
              title={title}
              draggable={false}
            >
              «{title}»
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
