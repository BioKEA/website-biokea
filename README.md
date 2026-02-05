# BioKEA Website

AI-driven Bioinformatics OS - Official website for BioKEA, a revolutionary AI-powered platform transforming bioinformatics research and data analysis.

## Tech Stack

- **Next.js 13.4** (static export)
- **React 18.3** + **TypeScript 4.9**
- **Tailwind CSS 3.4**
- **Framer Motion** for animations
- **Cloudflare Workers** deployment

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev      # http://localhost:3000

# Build for production
npm run build

# Deploy to Cloudflare
wrangler deploy
```

## Project Structure

```
website-biokea/
├── src/
│   ├── pages/          # Next.js pages (routing)
│   │   ├── index.tsx   # Homepage
│   │   ├── about.tsx   # About page
│   │   ├── bioinfoos.tsx
│   │   ├── contact.tsx
│   │   └── ...
│   ├── components/     # React components
│   │   ├── Header.tsx
│   │   ├── Hero.tsx
│   │   ├── Footer.tsx
│   │   └── ...
│   └── styles/         # Global styles
├── public/
│   └── assets/         # Images & videos
├── next.config.js      # Next.js configuration
├── tailwind.config.js  # Tailwind CSS configuration
└── tsconfig.json       # TypeScript configuration
```

## Key Features

- **Static Site Generation (SSG)** - Fast, SEO-optimized pages
- **Responsive Design** - Mobile-first approach with Tailwind CSS
- **Smooth Animations** - Powered by Framer Motion
- **Contact Form** - Integrated API endpoint
- **Modern UI/UX** - Clean, professional design

## Development

```bash
# Run linting
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format
```

## Deployment

The site is configured for deployment on Cloudflare Workers:

```bash
# Build static export
npm run build

# Deploy to Cloudflare
wrangler deploy
```

## Pages

- `/` - Homepage with hero section and key features
- `/about` - About BioKEA and the team
- `/bioinfoos` - BioInfO/S platform information
- `/agentis-journal` - AgentIS Journal details
- `/contact` - Contact form
- `/team` - Team members
- `/blog` - Blog (coming soon)
- `/pricing` - Pricing information

## Environment Variables

No environment variables required for static build.

## Contributing

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Test the build: `npm run build`
4. Commit with descriptive messages
5. Push and create a pull request

## License

Proprietary - BioKEA. All rights reserved.

## Support

For questions or issues, contact: [contact information]

---

Built with ❤️ by the BioKEA team
