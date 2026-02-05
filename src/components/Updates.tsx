import { motion } from 'framer-motion'
import { Update } from '../types'

const updates: Update[] = [
  {
    date: 'March 2025',
    title: 'BioKEA is founded',
    link: '#',
  },
  {
    date: 'April 2025',
    title: 'Agentis Journal prototype launched',
    link: '#',
  },
  {
    date: 'May 2025',
    title: 'Sean talking @ Joint Berkeley Initiative for Microbiome Sciences Industry Mixer',
    link: '#',
  },
]

export default function Updates() {
  return (
    <section className="py-20 bg-black/30">
      <div className="container mx-auto px-4">
        <h2 className="text-4xl font-bold text-center mb-12">Latest Updates</h2>

        <div className="max-w-4xl mx-auto grid gap-6">
          {updates.map((update, index) => (
            <motion.a
              key={index}
              href={update.link}
              className="block p-6 rounded-xl bg-gradient-to-r from-blue-900/30 to-yellow-500/30 hover:from-blue-900/40 hover:to-yellow-500/40 transition-all"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <div className="text-sm text-blue-400 mb-2">{update.date}</div>
              <h3 className="text-xl font-semibold">{update.title}</h3>
            </motion.a>
          ))}
        </div>
      </div>
    </section>
  )
}
