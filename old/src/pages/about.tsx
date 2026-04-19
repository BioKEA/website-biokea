import Head from 'next/head'
import Footer from '../components/Footer'

export default function About() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Head>
        <title>About - BioKEA</title>
        <meta name="description" content="About BioKEA - AI-Powered Science at Scale" />
      </Head>

      <main className="container mx-auto px-4 py-16">
        <div className="flex items-center gap-4 mb-8">
          <h1 className="text-4xl font-bold">About BioKEA</h1>
        </div>

        <div className="p-8 bg-gray-800 rounded-lg mb-8">
          <p className="text-lg text-gray-300 mb-6">
            BioKEA is pioneering the future of biological research through AI-powered solutions.
            We're building the infrastructure for next-generation scientific discovery.
          </p>

          <div className="space-y-8">
            <section>
              <h2 className="text-2xl font-bold mb-4">Our Vision</h2>
              <p className="text-gray-300">
                To accelerate scientific discovery by combining cutting-edge AI with advanced
                laboratory automation, making breakthrough research more accessible and efficient
                than ever before.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4">Our Mission</h2>
              <p className="text-gray-300">
                We're dedicated to empowering scientists and researchers with intelligent tools and
                automation, revolutionizing how biological research is conducted and analyzed.
              </p>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
