// src/data/credentials.ts

export interface Program {
  name: string;
  url: string;
  shortLabel?: string;
}

export interface PersonalCredential {
  memberName: string; // must match a name in src/data/team.ts
  label: string;
  url?: string; // optional public directory URL for the holder's credential
  issuer: string; // for JSON-LD affiliation.name
  issuerUrl: string; // for JSON-LD affiliation.url
}

export const programs: Program[] = [
  { name: 'AWS for Startups', url: 'https://aws.amazon.com/startups/' },
  { name: 'Google Cloud for Startups', url: 'https://cloud.google.com/startup' },
  { name: 'NVIDIA Inception', url: 'https://www.nvidia.com/en-us/startups/' },
];

export const personalCredentials: PersonalCredential[] = [
  {
    memberName: 'Sean Jungbluth',
    label: 'Anthropic Claude Community Ambassador',
    issuer: 'Anthropic',
    issuerUrl: 'https://www.anthropic.com/',
  },
];
