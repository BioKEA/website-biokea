import Head from 'next/head'
import { motion } from 'framer-motion'
import Hero from '../components/Hero'
import Updates from '../components/Updates'
import Footer from '../components/Footer'

const features = [
  {
    title: "Agent-Based Framework",
    description: "Our unique approach brings together a suite of intelligent agents to handle everything from data ingestion to complex analyses.",
    icon: "🤖"
  },
  {
    title: "Customizable & Scalable",
    description: "BioKEA's platform is designed to grow with your research needs, from small datasets to large-scale projects.",
    icon: "📈"
  },
  {
    title: "DeSci Data Access",
    description: "Access high-value, curated biological datasets that fuel decentralized science and collaboration.",
    icon: "🧬"
  },
  {
    title: "Smarter Discovery",
    description: "Our platform continuously learns from your data, optimizing performance and ensuring the highest accuracy.",
    icon: "🔍"
  }
]

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Head>
        <title>BioKEA – an AI-driven Bioinformatics OS</title>
        <meta name="description" content="BioKEA integrates agent-based bioinformatics and AI-enhanced publishing through Agentis." />
        <link rel="icon" href="/favicon.ico" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              "name": "BioKEA",
              "url": "https://biokea.ai",
              "logo": "https://biokea.ai/assets/images/logo2.png",
              "description": "BioKEA is an AI-driven Bioinformatics OS integrating agent-based bioinformatics and AI-enhanced publishing.",
              "sameAs": [
                "https://twitter.com/biokea",
                "https://github.com/biokea"
              ]
            })
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              "url": "https://biokea.ai",
              "name": "BioKEA – an AI-driven Bioinformatics OS",
              "description": "BioKEA integrates agent-based bioinformatics and AI-enhanced publishing through Agentis."
            })
          }}
        />
      </Head>

      <main>
        {/* Use the Hero component instead of defining the hero section inline */}
        <Hero />

        {/* Four Pillars Section */}
        <section id="pillars" className="py-20 bg-gray-900 text-white">
          <div className="container mx-auto px-4">
            <h2 className="text-4xl font-bold text-center mb-16">Our Two Pillars</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* Pillar 1: BioinfoOS */}
              <div className="p-6 rounded-xl bg-gradient-to-br from-blue-900/30 to-yellow-500/30 backdrop-blur-sm flex flex-col items-center text-center">
                <img src="/assets/images/Pillar1-BioinfoOS.png" alt="BioinfoOS Pillar" className="h-20 w-auto mb-4"/>
                <h3 className="text-xl font-bold mb-2">BioinfoOS & Large Data Collider</h3>
                <p className="text-gray-300 mb-4 flex-grow">Our core AI platform, BioinfoOS, leverages the Large Data Collider architecture to streamline complex bioinformatics workflows, manage vast datasets, and accelerate discovery through powerful analytics.</p>
                <a href="/bioinfoos" className="mt-auto inline-block px-6 py-2 bg-gradient-to-r from-blue-500 to-yellow-500 hover:from-blue-600 hover:to-yellow-600 rounded-lg text-sm font-semibold transition-all">
                  Learn More &raquo;
                </a>
              </div>
              {/* Pillar 2: Agentis Journal */}
              <div className="p-6 rounded-xl bg-gradient-to-br from-blue-900/30 to-yellow-500/30 backdrop-blur-sm flex flex-col items-center text-center">
                <img src="/assets/images/Pillar2-Agentis.png" alt="Agentis Journal Pillar" className="h-20 w-auto mb-4"/>
                <h3 className="text-xl font-bold mb-2">Agentis Journal</h3>
                <p className="text-gray-300 mb-4 flex-grow">Reimagining scientific publishing with our open-access journal featuring an innovative AI co-review process. Agentis accelerates knowledge sharing while ensuring rigorous peer evaluation.</p>
                <div className="mt-auto inline-block px-6 py-2 bg-gray-600 rounded-lg text-sm font-semibold cursor-not-allowed opacity-60">
                  Coming Soon
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* AI-Driven Bioinformatics Section */}
        <section className="py-20 bg-gradient-to-b from-black to-blue-900/20">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center mb-16">
              <h2 className="text-4xl font-bold mb-6">AI-Driven Bioinformatics</h2>
              <p className="text-xl text-gray-300">
                We use advanced agent-based AI to automate and enhance every step of the bioinformatics process.
                Our framework of intelligent agents works together seamlessly, processing raw data, running analysis,
                and validating results—all with the goal of bringing you clearer insights, faster discoveries,
                and more reliable outcomes.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              {features.map((feature, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.2 }}
                  className="p-6 rounded-xl bg-gradient-to-br from-blue-900/30 to-yellow-500/30 backdrop-blur-sm"
                >
                  <div className="text-4xl mb-4">{feature.icon}</div>
                  <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                  <p className="text-gray-300">{feature.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* AI-Enhanced Publishing Section - REMOVED */}
        {/* 
        <section id="agentis" className="py-20 bg-gradient-to-b from-blue-900/20 to-black">
          ...
        </section>
        */}

        {/* Call to Action */}
        <section className="py-20">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-4xl font-bold mb-6">Let's Build the Future of Bioinformatics Together</h2>
            <p className="text-xl text-gray-300 mb-8 max-w-3xl mx-auto">
              Whether you're a researcher, institution, or organization, we're here to support your journey
              with smart, scalable solutions that accelerate your work and lead to more meaningful discoveries.
            </p>
            <button className="px-8 py-3 bg-gradient-to-r from-blue-500 to-yellow-500 hover:from-blue-600 hover:to-yellow-600 rounded-lg text-lg font-semibold transition-all">
              Join Us Today
            </button>
          </div>
        </section>

        <Updates />
      </main>

      <Footer />
    </div>
  )
}