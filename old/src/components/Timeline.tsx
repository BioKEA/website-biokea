import { motion } from 'framer-motion'
import { Milestone } from '../types'

const milestones: Milestone[] = [
  {
    date: '2024 Q1',
    description: 'Launch of BioKEA.ai platform beta',
  },
  {
    date: '2024 Q2',
    description: 'Integration of advanced AI models for biological research',
  },
  {
    date: '2024 Q3',
    description: 'Release of open-source research tools',
  },
  {
    date: '2025 Q1-Q2',
    description: 'Placeholder: Expansion of BioinfoOS features & Large Data Collider v2',
  },
  {
    date: '2025 Q3-Q4',
    description:
      'Placeholder: Launch Labhus Automation Hub services & Agentis Journal public release',
  },
  {
    date: '2026',
    description: 'Placeholder: Establish key strategic partnerships & expand platform capabilities',
  },
]

export default function Timeline() {
  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <h2 className="text-4xl font-bold text-center mb-16">Roadmap</h2>

        <div className="max-w-3xl mx-auto">
          {milestones.map((milestone, index) => (
            <motion.div
              key={index}
              className="flex gap-8 mb-12"
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.2 }}
            >
              <div className="w-32 text-blue-400 font-mono">{milestone.date}</div>
              <div className="flex-1 p-6 rounded-xl bg-blue-900/20 backdrop-blur-sm">
                {milestone.description}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
