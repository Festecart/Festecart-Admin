import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Layout } from '@/components/Layout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import Login from '@/pages/Login'
import Orders from '@/pages/Orders'
import OrderDetail from '@/pages/OrderDetail'
import Shipments from '@/pages/Shipments'
import DeliveryZones from '@/pages/DeliveryZones'
import AbandonedCart from '@/pages/AbandonedCart'
import AbandonedCartDetail from '@/pages/AbandonedCartDetail'
import ContactEnquiries from '@/pages/ContactEnquiries'
import Categories from '@/pages/Categories'
import SiteNavigation from '@/pages/SiteNavigation'
import SiteFooter from '@/pages/SiteFooter'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />

          {/* Protected — all under Layout */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/orders" replace />} />
            <Route path="orders" element={<Orders />} />
            <Route path="orders/:id" element={<OrderDetail />} />
            <Route path="shipments" element={<Shipments />} />
            <Route path="delivery-zones" element={<DeliveryZones />} />
            <Route path="abandoned-cart" element={<AbandonedCart />} />
            <Route path="abandoned-cart/:id" element={<AbandonedCartDetail />} />
            <Route path="contact-enquiries" element={<ContactEnquiries />} />
            <Route path="catalog/categories" element={<Categories />} />
            <Route path="site/navbar" element={<SiteNavigation />} />
            <Route path="site/footer" element={<SiteFooter />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
