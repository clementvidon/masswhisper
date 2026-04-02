import { useEffect } from 'react';

import { Chart } from '../components/Chart/Chart';
import { Report } from '../components/Report/Report';
import { Ticker } from '../components/Ticker/Ticker';
import { runtimeConfig } from '../config/runtime';
import { setupAppHeightListener } from '../utils/setAppHeight';
import styles from './App.module.css';
import { useDailyData } from './useDailyData';

function App() {
  useEffect(() => {
    setupAppHeightListener();
  }, []);
  const { data, error, isLoading, isSnapshotCurrentDay } = useDailyData();

  const freshnessMessage =
    data && !isSnapshotCurrentDay
      ? `Pas de donnees disponibles pour aujourd'hui. Affichage des dernieres donnees publiees le ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(data.snapshotCreatedAt))}.`
      : null;

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.heading}>{runtimeConfig.topicName}</h1>
        <a
          className={styles.navButton}
          href="https://github.com/clementvidon/masswhisper"
          aria-label="Infos page"
          target="_blank"
          rel="noopener noreferrer"
        >
          à propos
        </a>
      </header>

      <main className={styles.mainContent}>
        {isLoading ? (
          <p role="status" aria-live="polite">
            Chargement des donnees…
          </p>
        ) : null}
        {error && !data ? (
          <p role="alert" aria-live="assertive">
            Erreur de chargement.
          </p>
        ) : null}
        {freshnessMessage ? (
          <p role="status" aria-live="polite">
            {freshnessMessage}
          </p>
        ) : null}
        {data ? (
          <>
            <Report report={data.report} />
            <Ticker headlines={data.headlines} />
            <Chart sentimentHistory={data.sentimentHistory} />
          </>
        ) : null}
      </main>

      <footer className={styles.footer}>
        Made with by
        <a
          href="https://github.com/clementvidon/"
          aria-label="Author's GitHub"
          target="_blank"
          rel="noopener noreferrer"
        >
          {' Clément Vidon '}
        </a>
        <span>· MIT License</span>
      </footer>
    </>
  );
}

export default App;
