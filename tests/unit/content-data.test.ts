import { describe, it, expect } from 'vitest';
import { team } from '@/data/team';
import { partners } from '@/data/partners';
import { pipelineStages } from '@/data/pipeline';
import { milestones } from '@/data/milestones';
import { homepageStats, labStats } from '@/data/stats';
import { programs, personalCredentials, credentialsFor } from '@/data/credentials';
import { projects } from '@/data/projects';

describe('team data', () => {
  it('has three core team members and two advisors', () => {
    expect(team.filter((p) => p.tier !== 'advisor')).toHaveLength(3);
    expect(team.filter((p) => p.tier === 'advisor')).toHaveLength(2);
  });
  it('every entry has name, role, image, alt', () => {
    for (const p of team) {
      expect(p.name).toBeTruthy();
      expect(p.role).toBeTruthy();
      expect(p.image).toMatch(/\.(png|svg|jpg|webp)$/);
      expect(p.alt).toBeTruthy();
    }
  });
  it('includes the named team + advisor members', () => {
    const names = team.map((m) => m.name);
    expect(names).toContain('Sean Jungbluth');
    expect(names).toContain('Michelle Jungbluth');
    expect(names).toContain('Austin Baker');
    expect(names).toContain('Sunit Jain');
    expect(names).toContain('Greg Fedewa');
  });
  it('every entry has a non-empty bio', () => {
    for (const p of team) {
      expect(p.bio).toBeTruthy();
      expect(p.bio!.length).toBeGreaterThan(20);
    }
  });
});

describe('partners data', () => {
  it('has all three partners', () => {
    expect(partners).toHaveLength(3);
  });
  it('includes CIB, SFEI, and Coastal Quest', () => {
    const names = partners.map((p) => p.name);
    expect(names.some((n) => /California Institute of Biodiversity/i.test(n))).toBe(true);
    expect(names.some((n) => /San Francisco Estuary Institute/i.test(n))).toBe(true);
    expect(names.some((n) => /Coastal Quest/i.test(n))).toBe(true);
  });
});

describe('pipeline data', () => {
  it('has exactly 6 stages', () => {
    expect(pipelineStages).toHaveLength(6);
  });
  it('stages are numbered 01 through 06 in order', () => {
    expect(pipelineStages.map((s) => s.number)).toEqual(['01', '02', '03', '04', '05', '06']);
  });
});

describe('milestones data', () => {
  it('has at least 5 milestones', () => {
    expect(milestones.length).toBeGreaterThanOrEqual(5);
  });
  it('every milestone has a date and title', () => {
    for (const m of milestones) {
      expect(m.date).toMatch(/^\d{4}-\d{2}/);
      expect(m.title).toBeTruthy();
    }
  });
  it('first milestone is founding in 2025-03', () => {
    expect(milestones[0].date).toBe('2025-03');
    expect(milestones[0].title).toMatch(/found/i);
  });
});

describe('milestones data — Anthropic events', () => {
  it('includes the 2025-10 Challenge winner milestone', () => {
    const m = milestones.find((m) => m.date === '2025-10');
    expect(m).toBeDefined();
    expect(m!.title).toMatch(/Built with Claude Sonnet 4\.5 Challenge/i);
  });

  it('includes the 2026-02 Ambassador milestone', () => {
    const m = milestones.find((m) => m.date === '2026-02');
    expect(m).toBeDefined();
    expect(m!.title).toMatch(/Ambassador/i);
  });

  it('milestones remain in chronological order', () => {
    const dates = milestones.map((m) => m.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });
});

describe('stats data', () => {
  it('homepageStats exposes 3 pills', () => {
    expect(homepageStats).toHaveLength(3);
  });
  it('homepage first stat is 5,000+ sq ft (confirmed)', () => {
    expect(homepageStats[0].value).toBe('5,000+');
    expect(homepageStats[0].label.toLowerCase()).toContain('sq ft');
  });
  it('labStats has entries', () => {
    expect(labStats.length).toBeGreaterThanOrEqual(1);
  });
});

describe('credentials data', () => {
  it('has at least three programs', () => {
    expect(programs.length).toBeGreaterThanOrEqual(3);
  });

  it('every program has a non-empty name and an https URL', () => {
    for (const p of programs) {
      expect(p.name).toBeTruthy();
      expect(p.url).toMatch(/^https:\/\//);
    }
  });

  it('includes AWS, Google Cloud, and NVIDIA programs', () => {
    const names = programs.map((p) => p.name);
    expect(names.some((n) => /AWS for Startups/i.test(n))).toBe(true);
    expect(names.some((n) => /Google Cloud for Startups/i.test(n))).toBe(true);
    expect(names.some((n) => /NVIDIA Inception/i.test(n))).toBe(true);
  });

  it('every personalCredential.memberName matches a real team member', () => {
    const teamNames = team.map((m) => m.name);
    for (const c of personalCredentials) {
      expect(teamNames).toContain(c.memberName);
    }
  });

  it('Sean has the Anthropic Claude Community Ambassador credential', () => {
    const sean = personalCredentials.find((c) => c.memberName === 'Sean Jungbluth');
    expect(sean).toBeDefined();
    expect(sean!.label).toBe('Anthropic Claude Community Ambassador');
    expect(sean!.issuer).toBe('Anthropic');
    expect(sean!.issuerUrl).toMatch(/^https:\/\//);
  });
});

describe('projects data — DaKineDiving', () => {
  it('includes a dakinediving slug', () => {
    const slugs = projects.map((p) => p.slug);
    expect(slugs).toContain('dakinediving');
  });

  it('DaKineDiving entry has an award with https url', () => {
    const dk = projects.find((p) => p.slug === 'dakinediving');
    expect(dk).toBeDefined();
    expect(dk!.award).toBeDefined();
    expect(dk!.award!.label).toMatch(/Built with Claude Sonnet 4\.5/);
    expect(dk!.award!.url).toMatch(/^https:\/\//);
  });

  it('DaKineDiving entry has two videos with https urls', () => {
    const dk = projects.find((p) => p.slug === 'dakinediving');
    expect(dk!.videos).toBeDefined();
    expect(dk!.videos!).toHaveLength(2);
    for (const v of dk!.videos!) {
      expect(v.label).toBeTruthy();
      expect(v.url).toMatch(/^https:\/\//);
    }
  });

  it('DaKineDiving is originIndependent and live', () => {
    const dk = projects.find((p) => p.slug === 'dakinediving');
    expect(dk!.originIndependent).toBe(true);
    expect(dk!.status).toBe('live');
  });
});

describe('credentials data — Sean has two credentials', () => {
  it('credentialsFor returns 2 entries for Sean Jungbluth', () => {
    const found = credentialsFor('Sean Jungbluth');
    expect(found).toHaveLength(2);
  });

  it('Sean credential labels include Ambassador and Challenge Winner', () => {
    const labels = credentialsFor('Sean Jungbluth').map((c) => c.label);
    expect(labels).toContain('Anthropic Claude Community Ambassador');
    expect(labels).toContain('Built with Claude Sonnet 4.5 Challenge — Winner');
  });

  it('Challenge credential has a public url', () => {
    const challenge = credentialsFor('Sean Jungbluth').find((c) => c.label.includes('Challenge'));
    expect(challenge?.url).toMatch(/^https:\/\/x\.com\//);
  });
});
