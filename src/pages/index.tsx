import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';

interface ProjectCard {
  title: string;
  badge: string;
  badgeClass: string;
  description: string;
  link: string;
  tech: string[];
  stats: string;
}

const projects: ProjectCard[] = [
  {
    title: '.NET Backend',
    badge: 'Legacy',
    badgeClass: 'badge--legacy',
    description:
      'The core monolith — ASP.NET WebForms, 27 projects, 70+ schedulers, 16 business modules. 17 years of business logic.',
    link: '/docs/dotnet-backend/overview',
    tech: ['.NET 4.6.1', 'WebForms', 'SQL Server', 'IIS'],
    stats: '897+ PRs',
  },
  {
    title: 'Node.js Backend',
    badge: 'Modern',
    badgeClass: 'badge--modern',
    description:
      'The replacement backend — NestJS 10, MikroORM, BullMQ workers. Progressively replacing .NET functionality.',
    link: '/docs/nodejs-backend/overview',
    tech: ['NestJS 10', 'MikroORM', 'PostgreSQL', 'BullMQ'],
    stats: '2581+ PRs',
  },
  {
    title: 'React Frontend',
    badge: 'Migrating',
    badgeClass: 'badge--migrating',
    description:
      'Next.js + Plasmic visual builder. HTML partials served via Azure CDN, embedded in .NET shell.',
    link: '/docs/react-frontend/overview',
    tech: ['Next.js 13.5', 'Plasmic', 'esbuild', 'Azure CDN'],
    stats: '~21 pages migrated',
  },
  {
    title: 'MAUI Mobile App',
    badge: 'Modern',
    badgeClass: 'badge--modern',
    description:
      '.NET MAUI 9 cross-platform mobile app for iOS and Android. Offline-first with Realm sync.',
    link: '/docs/maui-app/overview',
    tech: ['.NET MAUI 9', 'Realm', 'Firebase', 'Refit'],
    stats: 'v5.5.7',
  },
];

function ProjectCardComponent({ project }: { project: ProjectCard }) {
  return (
    <div className={clsx('col col--6')} style={{ marginBottom: '1.5rem' }}>
      <div
        className="card"
        style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      >
        <div className="card__header">
          <h3>
            {project.title}{' '}
            <span className={clsx('badge', project.badgeClass)}>
              {project.badge}
            </span>
          </h3>
        </div>
        <div className="card__body" style={{ flex: 1 }}>
          <p>{project.description}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {project.tech.map((t) => (
              <code key={t} style={{ fontSize: '0.8em' }}>
                {t}
              </code>
            ))}
          </div>
        </div>
        <div className="card__footer">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <small style={{ color: 'var(--ifm-color-emphasis-600)' }}>
              {project.stats}
            </small>
            <Link className="button button--primary button--sm" to={project.link}>
              View Docs
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickLinks() {
  const links = [
    { label: 'Architecture Overview', to: '/docs/architecture/overview' },
    { label: 'Database Schema', to: '/docs/database/overview' },
    { label: 'Migration Status', to: '/docs/cross-cutting/migration-status' },
    { label: 'Onboarding Guide', to: '/docs/cross-cutting/onboarding' },
    { label: 'Debugging Guide', to: '/docs/guides/debugging' },
    { label: '.NET Project Map', to: '/docs/dotnet-backend/project-map' },
    { label: 'Scheduler Catalog', to: '/docs/dotnet-backend/schedulers/' },
    { label: 'SP Documentation', to: '/docs/database/modules/sprocs/' },
  ];

  return (
    <div style={{ marginTop: '2rem' }}>
      <h2>Quick Links</h2>
      <div className="row">
        {links.map((link) => (
          <div key={link.to} className="col col--4" style={{ marginBottom: '0.75rem' }}>
            <Link
              className="button button--outline button--secondary button--block"
              to={link.to}
            >
              {link.label}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Home(): React.JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title="Home" description={siteConfig.tagline}>
      <header
        style={{
          padding: '3rem 0',
          textAlign: 'center',
          background: 'var(--ifm-color-emphasis-100)',
        }}
      >
        <div className="container">
          <h1 style={{ fontSize: '2.5rem' }}>{siteConfig.title}</h1>
          <p style={{ fontSize: '1.25rem', maxWidth: '600px', margin: '0 auto' }}>
            {siteConfig.tagline}
          </p>
          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <Link className="button button--primary button--lg" to="/docs">
              Get Started
            </Link>
            <Link
              className="button button--secondary button--lg"
              to="/docs/dotnet-backend/overview"
            >
              .NET Backend Docs
            </Link>
          </div>
        </div>
      </header>
      <main>
        <div className="container" style={{ padding: '2rem 0' }}>
          <div className="row">
            <div className="col col--8 col--offset-2">
              <div
                style={{
                  background: 'var(--ifm-color-warning-contrast-background)',
                  border: '1px solid var(--ifm-color-warning-dark)',
                  borderRadius: '8px',
                  padding: '1rem 1.5rem',
                  marginBottom: '2rem',
                }}
              >
                <strong>Primary Focus: .NET Backend</strong> — The legacy monolith
                (17 years, 27 projects, 70+ schedulers) is the biggest knowledge gap.
                Start there for the most comprehensive documentation.
              </div>
            </div>
          </div>
          <h2 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            Platform Systems
          </h2>
          <div className="row">
            {projects.map((project) => (
              <ProjectCardComponent key={project.title} project={project} />
            ))}
          </div>
          <div className="row">
            <div className="col col--8 col--offset-2">
              <QuickLinks />
            </div>
          </div>
        </div>
      </main>
    </Layout>
  );
}
