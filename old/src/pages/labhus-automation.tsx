import Head from 'next/head'
import Footer from '../components/Footer'

export default function Labhus() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Head>
        <title>Labhus - Integrated Bioscience & Engineering - BioKEA</title>
        <meta
          name="description"
          content="Labhus integrates wet-lab science, robotics, industrial microbiology, and defense applications, preparing for the future of automation."
        />
      </Head>

      <main className="container mx-auto px-4 py-16">
        <div className="flex items-center gap-4 mb-8">
          <img
            src="/assets/images/Pillar4-Labhus.webp"
            alt="Labhus Pillar Icon"
            className="h-20 w-auto"
          />
          <h1 className="text-4xl font-bold">Labhus: Integrated Bioscience & Engineering</h1>
        </div>

        <p className="text-lg text-gray-300 mb-4">
          Labhus bridges the gap between disciplines, combining advanced wet-lab science, robotics
          fundamentals, industrial microbiology insights, and defense-related applications. Our
          focus is on building robust, integrated systems today to pave the way for fully automated
          bioscience solutions tomorrow.
        </p>
        <div className="mt-12 p-8 bg-gray-800 rounded-lg">
          <h2 className="text-2xl font-bold mb-4">Wet-Lab & Robotics Integration</h2>
          <p className="text-gray-400">
            [Placeholder: Details on current integration efforts and foundational work.]
          </p>
        </div>
        <div className="mt-8 p-8 bg-gray-800 rounded-lg">
          <h2 className="text-2xl font-bold mb-4">
            Industrial Microbiology & Defense Applications
          </h2>
          <p className="text-gray-400">
            [Placeholder: Information on relevant applications and research areas.]
          </p>
        </div>
        <div className="mt-8 p-8 bg-gray-800 rounded-lg">
          <h2 className="text-2xl font-bold mb-4">Future Automation Roadmap</h2>
          <p className="text-gray-400">
            [Placeholder: Outline of the vision for future automation.]
          </p>
        </div>
        <div className="mt-8 p-8 bg-gray-800 rounded-lg">
          <h2 className="text-2xl font-bold mb-4">Partnership & Collaboration Inquiry</h2>
          <p className="text-gray-400">[Placeholder for partnership/collaboration form]</p>
        </div>
      </main>

      <Footer />
    </div>
  )
}
