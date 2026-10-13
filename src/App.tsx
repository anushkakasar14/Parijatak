import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { Footer } from './components/Footer'
import { Navbar } from './components/Navbar'
import { ProductModalProvider } from './components/ProductModal'
import Home from './pages/Home'

// Secondary pages are code-split so the homepage ships the least JavaScript.
const Collection = lazy(() => import('./pages/Collection'))
const About = lazy(() => import('./pages/About'))
const Contact = lazy(() => import('./pages/Contact'))
const NotFound = lazy(() => import('./pages/NotFound'))
// The admin panel is a separate bundle: public visitors never download it.
const AdminApp = lazy(() => import('./admin/AdminApp'))

function Layout() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-ivory focus:px-4 focus:py-2"
      >
        Skip to content
      </a>
      <Navbar />
      <main id="main" className="min-h-[60svh]">
        <Suspense fallback={null}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ProductModalProvider>
        <Routes>
          <Route
            path="admin/*"
            element={
              <Suspense fallback={null}>
                <AdminApp />
              </Suspense>
            }
          />
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="collection" element={<Collection />} />
            <Route path="about" element={<About />} />
            <Route path="contact" element={<Contact />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </ProductModalProvider>
    </BrowserRouter>
  )
}
