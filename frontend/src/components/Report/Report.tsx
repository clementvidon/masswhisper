import { type Report as ReportModel } from '@masswhisper/shared/domain';

import styles from './Report.module.css';

export function Report({ report }: { report: ReportModel }) {
  return (
    <div className={styles.report}>
      <div className={styles.emoji}>{report.emoji}</div>
      <p className={styles.text}>{report.text}</p>
    </div>
  );
}
