import Head from 'next/head'
import Team from '../components/Team'
import Footer from '../components/Footer'

export default function TeamPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Head>
        <title>Our Team - BioKEA</title>
        <meta name="description" content="Meet the BioKEA team" />
      </Head>
      
      <main className="container mx-auto px-4 py-16">
        <div className="flex items-center gap-4 mb-8">
          <h1 className="text-4xl font-bold">Our Team</h1>
        </div>
        
        <div className="p-8 bg-gray-800 rounded-lg mb-8">
          <Team />
        </div>
      </main>

      <Footer />
    </div>
  )
} 