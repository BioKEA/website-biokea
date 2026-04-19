import Navbar from '../components/Navbar'
import Footer from '../components/Footer'

export default function Blog() {
  return (
    <div className="bg-gray-900 min-h-screen text-white">
      <Navbar />
      <main className="container mx-auto px-4 py-20">
        <h1 className="text-5xl font-bold mb-8 text-center">Blog</h1>
        <p className="text-xl text-gray-300 text-center">Coming soon...</p>
      </main>
      <Footer />
    </div>
  )
}
