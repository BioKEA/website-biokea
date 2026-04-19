import Head from 'next/head'

const sections = [
  {
    title: "Getting Started",
    items: [
      { title: "Quick Start Guide", link: "/docs/quickstart" },
      { title: "Installation", link: "/docs/installation" },
      { title: "API Keys", link: "/docs/api-keys" }
    ]
  },
  {
    title: "Core Features",
    items: [
      { title: "Sequence Analysis", link: "/docs/sequence-analysis" },
      { title: "Structure Prediction", link: "/docs/structure-prediction" },
      { title: "Data Management", link: "/docs/data-management" }
    ]
  },
  {
    title: "API Reference",
    items: [
      { title: "REST API", link: "/docs/api/rest" },
      { title: "Python SDK", link: "/docs/api/python" },
      { title: "R Package", link: "/docs/api/r" }
    ]
  }
]

export default function Documentation() {
  return (
    <div className="min-h-screen pt-20">
      <Head>
        <title>Documentation | BioKEA.ai</title>
        <meta name="description" content="BioKEA.ai documentation and developer resources" />
      </Head>

      <main className="container mx-auto px-4 py-12">
        <h1 className="text-5xl font-bold text-center mb-16">Documentation</h1>

        <div className="max-w-6xl mx-auto grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {sections.map((section, index) => (
            <div key={index} className="p-6 rounded-xl bg-gradient-to-br from-blue-900/30 to-yellow-500/30">
              <h2 className="text-2xl font-bold mb-4">{section.title}</h2>
              <ul className="space-y-2">
                {section.items.map((item, idx) => (
                  <li key={idx}>
                    <a 
                      href={item.link}
                      className="text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      {item.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
} 