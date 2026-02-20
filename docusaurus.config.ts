import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'MyEvaluations Docs',
  tagline: 'Interactive Code Documentation for the MyEvaluations Platform',
  favicon: 'img/favicon.ico',
  url: 'https://myevalsdocs.i95dev.com',
  baseUrl: '/',
  organizationName: 'myevaluations',
  projectName: 'myevals-docs',

  onBrokenLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  themes: ['@docusaurus/theme-mermaid'],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/myevaluations/myevals-docs/tree/main/',
          showLastUpdateTime: true,
          showLastUpdateAuthor: true,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      {
        hashed: true,
        indexDocs: true,
        indexBlog: false,
        docsRouteBasePath: '/docs',
        searchBarShortcutHint: true,
        highlightSearchTermsOnTargetPage: true,
      },
    ],
  ],

  themeConfig: {
    navbar: {
      title: 'MyEvaluations Docs',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'mainSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          href: '/docs/dotnet-backend/overview',
          label: '.NET Backend',
          position: 'left',
        },
        {
          href: '/docs/nodejs-backend/overview',
          label: 'Node.js Backend',
          position: 'left',
        },
        {
          href: '/docs/react-frontend/overview',
          label: 'React Frontend',
          position: 'left',
        },
        {
          href: '/docs/maui-app/overview',
          label: 'MAUI App',
          position: 'left',
        },
        {
          href: 'https://github.com/myevaluations/myevals-docs',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Core Systems',
          items: [
            { label: '.NET Backend', to: '/docs/dotnet-backend/overview' },
            { label: 'Node.js Backend', to: '/docs/nodejs-backend/overview' },
            { label: 'React Frontend', to: '/docs/react-frontend/overview' },
            { label: 'MAUI App', to: '/docs/maui-app/overview' },
          ],
        },
        {
          title: '.NET Deep Dive',
          items: [
            { label: 'Project Map', to: '/docs/dotnet-backend/project-map' },
            { label: 'Business Modules', to: '/docs/dotnet-backend/business/security' },
            { label: 'Schedulers', to: '/docs/dotnet-backend/schedulers/' },
            { label: 'Data Access', to: '/docs/dotnet-backend/data-access/overview' },
          ],
        },
        {
          title: 'Cross-Cutting',
          items: [
            { label: 'Architecture', to: '/docs/architecture/overview' },
            { label: 'Migration Status', to: '/docs/cross-cutting/migration-status' },
            { label: 'Onboarding', to: '/docs/cross-cutting/onboarding' },
            { label: 'Guides', to: '/docs/guides/debugging' },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} MyEvaluations. Internal documentation.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['csharp', 'sql', 'json', 'bash', 'markup'],
    },
    mermaid: {
      theme: { light: 'default', dark: 'dark' },
    },
    colorMode: {
      defaultMode: 'light',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
