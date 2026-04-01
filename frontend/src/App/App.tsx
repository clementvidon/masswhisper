import { useEffect } from 'react';

import { Chart } from '../components/Chart/Chart';
import { Report } from '../components/Report/Report';
import { Ticker } from '../components/Ticker/Ticker';
import { runtimeConfig } from '../config/runtime';
import { setupAppHeightListener } from '../utils/setAppHeight';
import styles from './App.module.css';

function App() {
  useEffect(() => {
    setupAppHeightListener();
  }, []);

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
        <Report />
        <Ticker />
        <Chart />
      </main>

      <footer className={styles.footer}>
        Made with ❤️ by
        <a
          href="https://github.com/clementvidon/"
          aria-label="Author's GitHub"
          target="_blank"
          rel="noopener noreferrer"
        >
          {' Clément Vidon '}
        </a>
      </footer>
    </>
  );
}

export default App;
