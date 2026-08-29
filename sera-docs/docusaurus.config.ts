import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'SERA OS',
  tagline: 'The universal AI agent engine. Secure, autonomous, and verifiable.',
  favicon: 'img/logo.png',


  // Set the production url of your site here
  url: 'https://docs.seraos.xyz',
  baseUrl: '/',
  organizationName: 'seraos-agent',
  projectName: 'sera-core',

  onBrokenLinks: 'throw',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
        },
        blog: {
          showReadingTime: true,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
          // Useful options to enforce blogging best practices
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'warn',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'SERA OS',
      logo: {
        alt: 'SERA OS Logo',
        src: 'img/logo.png',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          href: 'https://github.com/seraos-agent/sera-core',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'SERA OS',
          items: [
            {
              label: 'Introduction',
              to: '/docs/intro',
            },
            {
              label: 'Agent Engine',
              to: '/docs/engine',
            },
            {
              label: 'Verifiable Compute',
              to: '/docs/compute',
            },
          ],
        },
        {
          title: 'Products',
          items: [
            {
              label: 'MPC Wallet',
              to: '/docs/mpc',
            },
            {
              label: 'Action Workflows',
              to: '/docs/workflows',
            },
            {
              label: 'Claude Desktop (MCP)',
              to: '/docs/mcp-claude',
            },
            {
              label: 'Google Drive',
              to: '/docs/google-drive',
            },
          ],
        },
        {
          title: 'Developers',
          items: [
            {
              label: 'Documentation',
              to: '/docs/intro',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/seraos-agent/sera-core',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'X (Twitter)',
              href: 'https://x.com/sera_os',
            },
            {
              label: 'Telegram',
              href: 'https://t.me/sera_os',
            },
          ],
        },
      ],
      copyright: `Copyright \u00a9 ${new Date().getFullYear()} SERA OS. All rights reserved.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
