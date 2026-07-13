import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './auth/ProtectedRoute'
import Layout from './components/Layout'
import Login from './screens/Login'
import Dashboard from './screens/Dashboard'
import ExpenseNew from './screens/ExpenseNew'
import ExpenseEdit from './screens/ExpenseEdit'
import ExpenseList from './screens/ExpenseList'
import AdminHome from './screens/AdminHome'
import SuppliersAdmin from './screens/SuppliersAdmin'
import CategoriesAdmin from './screens/CategoriesAdmin'
import MembersAdmin from './screens/MembersAdmin'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/expenses" element={<ExpenseList />} />
        <Route path="/expenses/new" element={<ExpenseNew />} />
        <Route path="/expenses/:id/edit" element={<ExpenseEdit />} />
        <Route path="/admin" element={<AdminHome />} />
        <Route path="/admin/suppliers" element={<SuppliersAdmin />} />
        <Route path="/admin/categories" element={<CategoriesAdmin />} />
        <Route path="/admin/members" element={<MembersAdmin />} />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}


