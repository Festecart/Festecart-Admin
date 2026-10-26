
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Layout } from '@/components/Layout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import Login from '@/pages/Login'
import Orders from '@/pages/Orders'
import OrderDetail from '@/pages/OrderDetail'
import Shipments from '@/pages/Shipments'
import DeliveryZones from '@/pages/DeliveryZones'
import ShippingZones from '@/pages/ShippingZones'
import ShippingZoneForm from '@/pages/ShippingZoneForm'
import ShippingMethodForm from '@/pages/ShippingMethodForm'
import ShippingMethodsList from '@/pages/ShippingMethodsList'
import CourierVendors from '@/pages/CourierVendors'

import Customers from '@/pages/CustomersDetails'

import AbandonedCart from '@/pages/AbandonedCart'
import AbandonedCartDetail from '@/pages/AbandonedCartDetail'
import ContactEnquiries from '@/pages/ContactEnquiries'

import Categories from '@/pages/Categories'
import Products from '@/pages/Products'
import ProductForm from '@/pages/ProductForm'

import SiteNavigation from '@/pages/SiteNavigation'
import AddOrder from '@/pages/AddOrder'
import SiteFooter from '@/pages/SiteFooter'
import FeaturedProducts from '@/pages/FeaturedProducts'
import Testimonials from '@/pages/Testimonials'
import WhyPackages from '@/pages/WhyPackages'

import Coupons from '@/pages/Coupons'
import CouponForm from '@/pages/CouponForm'
import CouponAnalytics from '@/pages/CouponAnalytics'
import Analytics from '@/pages/Analytics'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 0,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>

          {/* Public Route */}
          <Route path="/login" element={<Login />} />

          {/* Protected Admin Routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >

            {/* Dashboard */}
            <Route
              index
              element={<Navigate to="/orders" replace />}
            />

            {/* Orders */}
            <Route path="orders" element={<Orders />} />
            <Route path="orders/:id" element={<OrderDetail />} />
            <Route path="orders/add" element={<AddOrder />} />

            {/* Shipments */}
            <Route path="shipments" element={<Shipments />} />

            {/* Delivery Zones */}
            <Route
              path="delivery-zones"
              element={<DeliveryZones />}
            />
            <Route
              path="delivery-zones/add"
              element={<DeliveryZones />}
            />
            <Route
              path="delivery-zones/:zoneId/edit"
              element={<DeliveryZones />}
            />

            {/* Shipping Zones */}
            <Route
              path="shipping-zones"
              element={<ShippingZones />}
            />
            <Route
              path="shipping-zones/vendors"
              element={<CourierVendors />}
            />
            <Route
              path="shipping-zones/add"
              element={<ShippingZoneForm />}
            />
            <Route
              path="shipping-zones/:zoneId/edit"
              element={<ShippingZoneForm />}
            />
            <Route
              path="shipping-zones/:zoneId/methods"
              element={<ShippingMethodsList />}
            />
            <Route
              path="shipping-zones/:zoneId/methods/add"
              element={<ShippingMethodForm />}
            />
            <Route
              path="shipping-zones/:zoneId/methods/:methodId/edit"
              element={<ShippingMethodForm />}
            />

            {/* Customers */}
            <Route
              path="customers"
              element={<Customers />}
            />

            {/* Abandoned Cart */}
            <Route
              path="abandoned-cart"
              element={<AbandonedCart />}
            />
            <Route
              path="abandoned-cart/:id"
              element={<AbandonedCartDetail />}
            />

            {/* Contact Enquiries */}
            <Route
              path="contact-enquiries"
              element={<ContactEnquiries />}
            />

            {/* Catalog */}
            <Route
              path="catalog/categories"
              element={<Categories />}
            />
            <Route
              path="catalog/products"
              element={<Products />}
            />
            <Route
              path="catalog/products/add"
              element={<ProductForm />}
            />
            <Route
              path="catalog/products/:id/edit"
              element={<ProductForm />}
            />

            {/* Website */}
            <Route
              path="site/navbar"
              element={<SiteNavigation />}
            />
            <Route
              path="site/footer"
              element={<SiteFooter />}
            />
            <Route
              path="site/featured-products"
              element={<FeaturedProducts />}
            />
            <Route
              path="site/testimonials"
              element={<Testimonials />}
            />
            <Route
              path="site/why-packages"
              element={<WhyPackages />}
            />

            {/* Coupons */}
            <Route
              path="coupons"
              element={<Coupons />}
            />
            <Route
              path="coupons/analytics"
              element={<CouponAnalytics />}
            />
            <Route
              path="coupons/analytics/:couponId"
              element={<CouponAnalytics />}
            />
            <Route
              path="coupons/add"
              element={<CouponForm />}
            />
            <Route
              path="coupons/:id/edit"
              element={<CouponForm />}
            />

            {/* Analytics */}
            <Route
              path="analytics"
              element={<Analytics />}
            />

          </Route>

          {/* Fallback */}
          <Route
            path="*"
            element={<Navigate to="/" replace />}
          />

        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
