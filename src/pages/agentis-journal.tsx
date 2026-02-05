import Head from 'next/head'
import Footer from '../components/Footer'

export default function AgentisJournal() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Head>
        <title>Agentis Journal - BioKEA</title>
        <meta
          name="description"
          content="Learn about Agentis, BioKEA's AI-enhanced open-access journal suite."
        />
      </Head>

      <main className="container mx-auto px-4 py-16">
        <div className="flex items-center gap-4 mb-8">
          <img
            src="/assets/images/Pillar2-Agentis.png"
            alt="Agentis Journal Pillar Icon"
            className="h-20 w-auto"
          />
          <h1 className="text-4xl font-bold">Agentis Journal</h1>
        </div>

        <p className="text-lg text-gray-300 mb-4 text-center">
          Information about the AI-co-review workflow, value proposition, and submission guidelines
          will be here.
        </p>

        <div className="max-w-4xl mx-auto text-center mb-12 mt-12">
          <p className="text-xl text-gray-300">
            Agentis, BioKEA's open-access journal suite, reimagines peer review with AI co-reviewers
            – accelerating scientific communication while preserving rigor.
          </p>
        </div>

        <div className="max-w-3xl mx-auto bg-gradient-to-br from-blue-900/30 to-yellow-500/30 rounded-2xl p-8 mb-12">
          <h2 className="text-2xl font-bold mb-6 text-center">Key Features</h2>
          <ul className="space-y-4 text-gray-300 text-lg">
            <li className="flex items-start">
              <span className="text-blue-400 mr-2">✓</span>
              <span>
                <strong className="text-white">Open Access</strong> – Research is free to read,
                download, and share.
              </span>
            </li>
            <li className="flex items-start">
              <span className="text-blue-400 mr-2">✓</span>
              <span>
                <strong className="text-white">AI-Enhanced Review</strong> – Intelligent agents
                assist expert reviewers for faster decisions.
              </span>
            </li>
            <li className="flex items-start">
              <span className="text-blue-400 mr-2">✓</span>
              <span>
                <strong className="text-white">Community-Driven</strong> – Transparent governance
                and grassroots spirit.
              </span>
            </li>
          </ul>
        </div>

        <div className="text-center mb-12">
          <button
            disabled
            className="inline-block px-8 py-3 bg-gray-600 rounded-lg text-lg font-semibold cursor-not-allowed opacity-60"
          >
            Coming Soon
          </button>
          <p className="text-gray-400 text-sm mt-3">
            The external Agentis site is currently under development
          </p>
        </div>
      </main>

      <Footer />
    </div>
  )
}
