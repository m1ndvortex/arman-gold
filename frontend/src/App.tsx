import { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import axios from 'axios'

// Create a client
const queryClient = new QueryClient()

function App() {
  const [backendStatus, setBackendStatus] = useState<string>('Checking...')

  useEffect(() => {
    // Test backend connection
    const checkBackend = async () => {
      try {
        const response = await axios.get('/api/v1/status')
        setBackendStatus('Connected ✅')
        console.log('Backend response:', response.data)
      } catch (error) {
        setBackendStatus('Disconnected ❌')
        console.error('Backend connection failed:', error)
      }
    }

    checkBackend()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <div className="min-h-screen bg-gray-50" dir="rtl">
          <header className="bg-white shadow-sm border-b">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center py-4">
                <h1 className="text-2xl font-bold text-gray-900">
                  پلتفرم طلافروشی
                </h1>
                <div className="text-sm text-gray-600">
                  Backend Status: {backendStatus}
                </div>
              </div>
            </div>
          </header>

          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Routes>
              <Route path="/" element={<HomePage />} />
            </Routes>
          </main>

          <Toaster 
            position="top-center"
            toastOptions={{
              duration: 4000,
              style: {
                direction: 'rtl',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }
            }}
          />
        </div>
      </Router>
    </QueryClientProvider>
  )
}

function HomePage() {
  return (
    <div className="text-center">
      <h2 className="text-3xl font-bold text-gray-900 mb-4">
        خوش آمدید به پلتفرم طلافروشی
      </h2>
      <p className="text-lg text-gray-600 mb-8">
        سیستم مدیریت جامع کسب و کار طلافروشی با پشتیبانی کامل از زبان فارسی
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-xl font-semibold mb-2">مدیریت فاکتور</h3>
          <p className="text-gray-600">ایجاد و مدیریت فاکتورهای فروش، خرید و تعویض</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-xl font-semibold mb-2">مدیریت موجودی</h3>
          <p className="text-gray-600">کنترل انبار و محصولات با پشتیبانی از بارکد</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-xl font-semibold mb-2">مدیریت مشتریان</h3>
          <p className="text-gray-600">سیستم CRM کامل با دفتر کل مشتریان</p>
        </div>
      </div>
    </div>
  )
}

export default App