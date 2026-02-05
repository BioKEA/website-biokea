import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <nav className="fixed w-full z-50 bg-black">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center">
            <img
              src="/assets/images/logo2.png"
              alt="BioKEA.ai"
              className="h-8 w-auto invert"
            />
          </Link>

          <div className="hidden md:flex space-x-8">
            <Link href="/about" className="text-gray-300 hover:text-white transition-colors">
              About
            </Link>
            <Link href="/bioinfoos" className="text-gray-300 hover:text-white transition-colors">
              Platform
            </Link>
            <Link href="/agentis-journal" className="text-gray-300 hover:text-white transition-colors">
              Agentis
            </Link>
            <Link href="/contact" className="text-gray-300 hover:text-white transition-colors">
              Contact
            </Link>
          </div>

          <button
            className="md:hidden p-2"
            onClick={() => setIsOpen(!isOpen)}
          >
            <span className="sr-only">Open menu</span>
            <svg
              className="h-6 w-6 text-white"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              {isOpen ? (
                <path d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <motion.div
        className={`md:hidden ${isOpen ? 'block' : 'hidden'}`}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: isOpen ? 1 : 0, y: isOpen ? 0 : -20 }}
      >
        <div className="px-2 pt-2 pb-3 space-y-1 bg-black">
          <Link href="/about" className="block px-3 py-2 text-gray-300 hover:text-white transition-colors">
            About
          </Link>
          <Link href="/bioinfoos" className="block px-3 py-2 text-gray-300 hover:text-white transition-colors">
            Platform
          </Link>
          <Link href="/agentis-journal" className="block px-3 py-2 text-gray-300 hover:text-white transition-colors">
            Agentis
          </Link>
          <Link href="/contact" className="block px-3 py-2 text-gray-300 hover:text-white transition-colors">
            Contact
          </Link>
        </div>
      </motion.div>
    </nav>
  )
}
