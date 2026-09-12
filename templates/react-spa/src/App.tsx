import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@pezhwan/react';
import Nav from './components/Nav';
import Home from './pages/Home';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ProfilePage from './pages/ProfilePage';

export default function App() {
  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/profile"
          element={
            <ProtectedRoute fallbackPath="/login">
              <ProfilePage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  );
}