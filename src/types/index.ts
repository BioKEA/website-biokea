export interface TeamMember {
  name: string;
  role: string;
  image?: string;
  bio?: string;
}

export interface Update {
  date: string;
  title: string;
  link: string;
  description?: string;
}

export interface Milestone {
  date: string;
  description: string;
}

export interface Project {
  title: string;
  description: string;
  image?: string;
}

export interface Feature {
  title: string;
  description: string;
  icon: string;
}

export interface PricingPlan {
  name: string;
  price: string;
  features: string[];
}

export interface JobPosition {
  title: string;
  department: string;
  location: string;
  type: string;
  description: string;
}

export interface NavLink {
  title: string;
  href: string;
  children?: NavLink[];
}

export interface DocumentationSection {
  title: string;
  items: {
    title: string;
    link: string;
  }[];
}
