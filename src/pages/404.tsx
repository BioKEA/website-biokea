import Link from 'next/link'

export default function Custom404() {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-8xl font-bold mb-4 bg-gradient-to-r from-blue-500 to-yellow-500 text-transparent bg-clip-text">
          404
        </h1>
        <h2 className="text-3xl font-semibold mb-4">Page Not Found</h2>
        <p className="text-xl text-gray-300 mb-8 max-w-md mx-auto">
          The page you are looking for might have been removed, had its name changed, or is
          temporarily unavailable.
        </p>
        <Link
          href="/"
          className="inline-block px-8 py-4 bg-gradient-to-r from-blue-500 to-yellow-500 rounded-lg text-white font-semibold hover:opacity-90 transition-opacity"
        >
          Return Home
        </Link>
      </div>
    </div>
  )
}
