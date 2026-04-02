import { type SentimentHistoryDto } from '@masswhisper/shared/dtos';
import { useState } from 'react';

import styles from './Chart.module.css';
import { ChartControls } from './ChartControls';
import { ChartEmotions } from './ChartEmotions';
import { ChartLegend } from './ChartLegend';
import { ChartTonalities } from './ChartTonalities';
import { useChartSeries } from './useChartSeries';

type View = 'emotions' | 'tonalities';

export function Chart({
  sentimentHistory,
}: {
  sentimentHistory: SentimentHistoryDto;
}) {
  const { emotionData, tonalityData } = useChartSeries(sentimentHistory);

  const [view, setView] = useState<View>('emotions');
  const [hudVisible, setHudVisible] = useState(false);
  const [tooltipActive, setTooltipActive] = useState(false);

  if (!emotionData.length || !tonalityData.length) {
    return <p role="status">Aucune donnée historique disponible.</p>;
  }

  const diffDays = emotionData.length;

  const toggle = () => {
    setView((v) => (v === 'emotions' ? 'tonalities' : 'emotions'));
  };

  return (
    <div className={styles.chartContainer}>
      <p className={styles.heading}>
        {view === 'emotions'
          ? `Intensité des émotions – ${String(diffDays)}\u00A0jours`
          : `Polarité des tonalités – ${String(diffDays)}\u00A0jours`}
      </p>

      {view === 'emotions' ? (
        <ChartEmotions
          data={emotionData}
          hudVisible={hudVisible}
          tooltipActive={tooltipActive}
          setTooltipActive={setTooltipActive}
        />
      ) : (
        <ChartTonalities
          data={tonalityData}
          hudVisible={hudVisible}
          tooltipActive={tooltipActive}
          setTooltipActive={setTooltipActive}
        />
      )}

      <div className={styles.chartFooter}>
        <div>
          <ChartLegend mode={view} />
        </div>

        <ChartControls
          view={view}
          onToggleView={toggle}
          hudVisible={hudVisible}
          onToggleHud={() => {
            setHudVisible((v) => !v);
          }}
        />
      </div>
    </div>
  );
}
