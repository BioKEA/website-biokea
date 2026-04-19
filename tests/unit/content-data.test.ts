import { describe, it, expect } from 'vitest';
import { team } from '@/data/team';
import { partners } from '@/data/partners';
import { pipelineStages } from '@/data/pipeline';
import { milestones } from '@/data/milestones';
import { homepageStats, labStats } from '@/data/stats';

describe('team data', () => {
  it('has all three team members', () => {
    expect(team).toHaveLength(3);
  });
  it('every entry has name, role, image, alt', () => {
    for (const p of team) {
      expect(p.name).toBeTruthy();
      expect(p.role).toBeTruthy();
      expect(p.image).toMatch(/\.(png|svg|jpg|webp)$/);
      expect(p.alt).toBeTruthy();
    }
  });
  it('includes the three named members', () => {
    const names = team.map((m) => m.name);
    expect(names).toContain('Sean Jungbluth');
    expect(names).toContain('Michelle Jungbluth');
    expect(names).toContain('Austin Baker');
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
