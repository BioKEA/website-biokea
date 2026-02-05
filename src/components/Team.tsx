import { motion } from 'framer-motion'

export default function Team() {
  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <h2 className="text-4xl font-bold text-center mb-16">Our Team</h2>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="flex justify-center"
        >
          <div className="flex flex-col items-center">
            <img
              src="/assets/images/team2.jpg"
              alt="BioKEA Team"
              className="w-full max-w-[75%] h-auto rounded-lg shadow-xl mb-8 mx-auto"
            />
          </div>
        </motion.div>
      </div>
    </section>
  )
}
