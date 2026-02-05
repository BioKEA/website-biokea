import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/favicon.ico" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="BioKEA" />
        <meta property="og:image" content="https://biokea.ai/assets/images/logo2.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://biokea.ai/assets/images/logo2.png" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
