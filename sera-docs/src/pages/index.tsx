import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';

import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)} style={{ backgroundColor: 'var(--ifm-color-primary)', color: '#fff', minHeight: '60vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div className="container">
        <h1 className="hero__title" style={{ fontSize: '4rem', fontWeight: 800, margin: 0 }}>
          {siteConfig.title} Docs
        </h1>
        <p className="hero__subtitle" style={{ fontSize: '1.5rem', opacity: 0.9 }}>{siteConfig.tagline}</p>
        <div className={styles.buttons} style={{ marginTop: '2rem' }}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/intro"
            style={{ fontWeight: 600, padding: '0.8rem 2rem' }}>
            Get Started with SERA
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  const LayoutComponent = Layout as any;
  return (
    <LayoutComponent
      title={`Documentation | ${siteConfig.title}`}
      description="Official documentation for SERA OS: The universal AI agent engine.">
      <HomepageHeader />
      <main style={{ padding: '4rem 0', textAlign: 'center' }}>
        <div className="container">
          <h2 style={{ marginBottom: '2rem', fontSize: '2.5rem' }}>Welcome to the SERA Ecosystem</h2>
          <p style={{ maxWidth: '600px', margin: '0 auto', fontSize: '1.2rem', color: 'var(--ifm-color-emphasis-700)' }}>
            Dive into the technical architecture, API references, and integration guides to start building autonomous agents with verifiable execution.
          </p>
        </div>
      </main>
    </LayoutComponent>
  );
}
