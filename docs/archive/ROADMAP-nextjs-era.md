# BioKEA Website Roadmap

This document outlines future improvements and enhancements for the BioKEA website.

## Completed ✅

- [x] Add comprehensive README.md documentation
- [x] Add LICENSE file
- [x] Remove unused files (~18 MB cleanup)
- [x] Add code quality tooling (ESLint, Prettier, Husky)
- [x] Add professional web features (favicon, robots.txt, sitemap, 404 page)
- [x] Code cleanup and refactoring
- [x] Conservative dependency updates (TypeScript 5.9, Next.js 13.5, etc.)

## Short-term (Next Sprint)

### TypeScript Strict Mode

- [ ] Enable `strict: true` in tsconfig.json
- [ ] Fix type errors incrementally
- [ ] Add proper type annotations for all components
- [ ] Fix event handler types
- [ ] Add null checks where needed

**Benefit**: Catch more bugs at compile time, improve code quality

### Image Optimization

- [ ] Optimize large images (reduce ~8 MB to ~2 MB)
  - team2.png (2.0 MB → ~400 KB)
  - videoV2.png (2.5 MB → ~500 KB)
  - Pillar\*.png (1.2-1.7 MB → 200-300 KB each)
  - BioKEA-Large-Data-Collider.png (1.6 MB → ~300 KB)
- [ ] Consider using Next.js `<Image>` component for automatic optimization
- [ ] Add image lazy loading

**Benefit**: Faster page loads, better performance scores, reduced bandwidth

### Accessibility Improvements

- [ ] Add ARIA labels to interactive elements
- [ ] Ensure proper heading hierarchy
- [ ] Add keyboard navigation support
- [ ] Add focus indicators
- [ ] Test with screen readers

**Benefit**: Better accessibility, SEO improvement, inclusive design

## Medium-term (1-2 Months)

### Performance Optimization

- [ ] Implement code splitting
- [ ] Add performance monitoring (Web Vitals)
- [ ] Optimize bundle size
- [ ] Add service worker for offline support
- [ ] Implement caching strategies

**Benefit**: Better user experience, improved SEO rankings

### SEO Enhancements

- [ ] Add dynamic meta tags per page
- [ ] Implement structured data for all pages
- [ ] Add Open Graph images for social sharing
- [ ] Create blog post schema markup
- [ ] Add breadcrumb navigation

**Benefit**: Better search engine visibility, improved social sharing

### Content Management

- [ ] Add CMS integration (Contentful, Sanity, or similar)
- [ ] Make content editable without code changes
- [ ] Add blog post creation workflow
- [ ] Implement content versioning

**Benefit**: Easier content updates, faster iteration

## Long-term (3-6 Months)

### Major Framework Upgrades

**⚠️ Breaking Changes Required - Dedicated Sprint Needed**

#### Next.js 13 → 16 (App Router)

- [ ] Plan migration strategy
- [ ] Set up parallel testing environment
- [ ] Migrate pages to App Router structure
- [ ] Update routing patterns
- [ ] Test all functionality
- [ ] Update deployment configuration

**Benefit**: Latest features, better performance, improved developer experience

#### React 18 → 19

- [ ] Review breaking changes
- [ ] Update component patterns
- [ ] Test all interactive features
- [ ] Update animation libraries compatibility

**Benefit**: Latest React features, performance improvements

#### Tailwind 3 → 4

- [ ] Review configuration changes
- [ ] Update utility classes
- [ ] Test responsive design
- [ ] Update build pipeline

**Benefit**: New utility classes, better performance

### Testing Infrastructure

- [ ] Add unit tests (Jest, React Testing Library)
- [ ] Add integration tests
- [ ] Add end-to-end tests (Playwright or Cypress)
- [ ] Set up test coverage reporting
- [ ] Add visual regression testing

**Benefit**: Catch bugs early, confident refactoring

### Analytics & Monitoring

- [ ] Add privacy-focused analytics (Plausible or Fathom)
- [ ] Set up error tracking (Sentry)
- [ ] Add user behavior analytics
- [ ] Implement A/B testing framework

**Benefit**: Data-driven decisions, better user understanding

## Security Improvements

### Current Vulnerabilities

- [ ] Address Next.js security vulnerabilities (requires upgrade to 16.x)
- [ ] Update nodemailer (requires breaking change review)
- [ ] Update eslint-config-next (requires ESLint 9 upgrade)

**Note**: These require breaking changes and should be addressed in dedicated sprints.

### Security Enhancements

- [ ] Add Content Security Policy (CSP) headers
- [ ] Implement rate limiting for contact form
- [ ] Add CAPTCHA to contact form
- [ ] Enable HTTPS-only cookies
- [ ] Add security headers middleware

**Benefit**: Better protection against attacks, compliance

## Nice-to-Have Features

### User Experience

- [ ] Add dark/light mode toggle (currently always dark)
- [ ] Add search functionality
- [ ] Add newsletter signup
- [ ] Add blog comments
- [ ] Add social media feed integration

### Interactive Features

- [ ] Add interactive data visualization demos
- [ ] Add product demo videos
- [ ] Add customer testimonials carousel
- [ ] Add case studies section

### Developer Experience

- [ ] Add Storybook for component development
- [ ] Add component documentation
- [ ] Create design system documentation
- [ ] Add development guidelines

## Deferred (Not Prioritized)

- [ ] Internationalization (i18n) - if needed for global expansion
- [ ] Progressive Web App (PWA) features - if mobile app-like experience needed
- [ ] Server-side authentication - currently static site
- [ ] Real-time features (WebSockets) - no current use case

---

## Contributing to the Roadmap

To propose a new item:

1. Open an issue describing the feature or improvement
2. Tag it with `roadmap` label
3. Provide justification and expected benefit
4. Team will review and prioritize in planning sessions

## Review Schedule

This roadmap is reviewed and updated:

- Weekly: During sprint planning
- Monthly: Strategic prioritization
- Quarterly: Major initiative planning

Last updated: 2026-02-04
