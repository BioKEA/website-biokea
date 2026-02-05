import Head from 'next/head'
import Footer from '../components/Footer'
import Link from 'next/link'

export default function BioinfoOS() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Head>
        <title>BioinfoOS & Large Data Collider - Core Platform - BioKEA</title>
        <meta
          name="description"
          content="BioinfoOS, featuring the Large Data Collider, is the AI-powered core connecting all of BioKEA's capabilities."
        />
      </Head>

      <main className="container mx-auto px-4 py-16">
        <div className="flex items-center gap-4 mb-8">
          <img
            src="/assets/images/Pillar1-BioinfoOS.png"
            alt="BioinfoOS Pillar Icon"
            className="h-20 w-auto"
          />
          <h1 className="text-4xl font-bold">
            BioinfoOS & Large Data Collider: The Core of BioKEA
          </h1>
        </div>

        <p className="text-lg text-gray-300 mb-4">
          At the heart of BioKEA lies BioinfoOS, our AI-driven operating system powered by the Large
          Data Collider (LDC). This integrated platform connects disparate biological data sources,
          enabling unprecedented insights and accelerating discovery.
        </p>

        <div className="mt-12 md:grid md:grid-cols-2 md:gap-8 items-start">
          <div className="p-8 bg-gray-800 rounded-lg mb-8 md:mb-0">
            <h2 className="text-2xl font-bold mb-6">Key Capabilities:</h2>
            <ul className="space-y-4 text-gray-300 text-lg list-disc list-inside">
              <li>
                <strong className="text-white">Unified Knowledge Graph:</strong> A FAIR (Findable,
                Accessible, Interoperable, Reusable) knowledge graph connecting every genome,
                sample, and paper.
              </li>
              <li>
                <strong className="text-white">AI Collision Engine:</strong> Surfaces novel enzymes,
                drug leads, and pathogen signals in real-time through advanced AI analysis.
              </li>
              <li>
                <strong className="text-white">Equitable Data Governance:</strong> Built-in Access
                and Benefit-Sharing (ABS) mechanisms and blockchain integration ensure fair,
                revenue-sharing data usage.
              </li>
              <li>
                <strong className="text-white">Ultra-fast Agentified Workflows:</strong> Expert
                workflows with proven heuristics, all using fleets of AI agents.
              </li>
            </ul>
          </div>

          <div className="p-8 bg-gray-800 rounded-lg text-center">
            <h2 className="text-2xl font-bold mb-4">The Large Data Collider</h2>
            <img
              src="/assets/images/BioKEA-Large-Data-Collider.png"
              alt="BioKEA Large Data Collider Graphic"
              className="max-w-xl h-auto mx-auto rounded-md shadow-lg"
            />
          </div>
        </div>

        <div className="mt-8 p-8 bg-gray-800 rounded-lg">
          <h2 className="text-2xl font-bold mb-4">API Access & Pricing</h2>
          <p className="text-gray-300 text-lg mb-6">
            Access the power of BioinfoOS programmatically via our comprehensive APIs. Explore
            tailored solutions and detailed cost structures on our pricing page.
          </p>
          <Link
            href="/pricing"
            className="inline-block px-8 py-3 bg-gradient-to-r from-blue-500 to-yellow-500 hover:from-blue-600 hover:to-yellow-600 rounded-lg text-lg font-semibold transition-all"
          >
            View Pricing Details &raquo;
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  )
}
