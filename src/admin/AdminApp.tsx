import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AdminLayout } from './AdminLayout'
import { AuthProvider, useAuth } from './AuthContext'
import { LoadingBlock, PageHeader } from './components'
import { LoginPage } from './LoginPage'
import { AccountPage } from './pages/AccountPage'
import { EnquiriesPage } from './pages/EnquiriesPage'
import { OverviewPage } from './pages/OverviewPage'
import { ProductsPage } from './pages/ProductsPage'
import { UpcomingPage } from './pages/UpcomingPage'

/**
 * Redirects to the login page unless signed in. This only decides what to SHOW —
 * every admin API call is checked again on the server.
 */
function RequireAuth({ children }: { children: ReactNode }) {
  const { status, signedOutByChoice } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="grid min-h-svh place-items-center">
        <LoadingBlock />
      </div>
    )
  }
  if (status === 'signedOut') {
    return (
      <Navigate
        to="/admin/login"
        replace
        // After an expiry, return to the same page; after a deliberate sign-out, start afresh.
        state={signedOutByChoice ? null : { from: location.pathname + location.search }}
      />
    )
  }
  return children
}

function AdminNotFound() {
  return (
    <>
      <PageHeader title="Page not found" description="There is nothing at this address." />
      <Link to="/admin" className="font-medium text-maroon hover:underline">
        Back to the overview
      </Link>
    </>
  )
}

export default function AdminApp() {
  // Keep the admin area out of search results and give it its own tab title.
  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Admin — Parijatak'
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex, nofollow'
    document.head.appendChild(robots)
    return () => {
      document.title = previousTitle
      robots.remove()
    }
  }, [])

  return (
    <div className="min-h-svh bg-stone-100 font-sans text-stone-800">
      <AuthProvider>
        <Routes>
          <Route path="login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <AdminLayout />
              </RequireAuth>
            }
          >
            <Route index element={<OverviewPage />} />
            <Route path="enquiries" element={<EnquiriesPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route
              path="carousel"
              element={
                <UpcomingPage
                  title="Homepage carousel"
                  features={[
                    'Add, replace and remove carousel images and videos',
                    'Edit each slide’s heading, description and button',
                    'Change the order of the slides',
                  ]}
                />
              }
            />
            <Route
              path="offers"
              element={
                <UpcomingPage
                  title="Offers & banners"
                  features={[
                    'Create an offer or announcement banner',
                    'Set the dates it starts and ends, so it disappears on its own',
                    'Switch a banner on or off at any time',
                  ]}
                />
              }
            />
            <Route
              path="content"
              element={
                <UpcomingPage
                  title="Homepage & About"
                  features={[
                    'Edit the headings and paragraphs on the homepage',
                    'Edit the About page, including the founder’s note',
                    'Replace the images used in those sections',
                  ]}
                />
              }
            />
            <Route
              path="contact-details"
              element={
                <UpcomingPage
                  title="Contact & social"
                  features={[
                    'Update the studio address and WhatsApp number',
                    'Update the Instagram, YouTube and Facebook links',
                  ]}
                />
              }
            />
            <Route path="account" element={<AccountPage />} />
            <Route path="*" element={<AdminNotFound />} />
          </Route>
        </Routes>
      </AuthProvider>
    </div>
  )
}
